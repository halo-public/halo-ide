using System.Text;
using System.Threading.Channels;
using GitHub.Copilot;
using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public sealed class ChatService
{
    private readonly ChatStore _store;
    private readonly CopilotService _copilot;
    private readonly AiProviderService _providers;
    private readonly WorkspaceService _workspace;
    private readonly ILogger<ChatService> _logger;

    public ChatService(
        ChatStore store,
        CopilotService copilot,
        AiProviderService providers,
        WorkspaceService workspace,
        ILogger<ChatService> logger)
    {
        _store = store;
        _copilot = copilot;
        _providers = providers;
        _workspace = workspace;
        _logger = logger;
    }

    public IReadOnlyList<ChatSummaryDto> List() => _store.List();

    public ChatDetailDto? Get(string id) => _store.Get(id)?.ToDetail();

    public ChatDetailDto Create(string? title)
    {
        var provider = "copilot";
        var model = _store.GetMostRecentModel() ?? _copilot.Model;
        if (!string.IsNullOrWhiteSpace(model) &&
            !string.Equals(model, _copilot.Model, StringComparison.OrdinalIgnoreCase))
        {
            _ = _copilot.SetModelAsync(model);
        }

        var created = _store.Create(title, model);
        created.Provider = provider;
        _store.Save(created);
        return created.ToDetail();
    }

    public WorkspaceChatInfoDto GetWorkspaceChatInfo() => _workspace.GetChatInfo();

    public WorkspaceChatInfoDto OnWorkspaceChanged()
    {
        _store.MoveFallbackChatsToWorkspace();
        return _workspace.GetChatInfo();
    }

    public async Task<CopilotStatusDto> SetProviderModelAsync(string provider, string model, string? chatId = null)
    {
        var normalizedProvider = _providers.NormalizeProvider(provider);
        var models = await _providers.ListModelsAsync(normalizedProvider);
        var selected = models.FirstOrDefault(m => string.Equals(m.Id, model, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException($"'{model}' is not a valid {normalizedProvider} model.");

        CopilotStatusDto status;
        if (string.Equals(normalizedProvider, "copilot", StringComparison.OrdinalIgnoreCase))
        {
            status = await _copilot.SetModelAsync(selected.Id);
        }
        else
        {
            status = new CopilotStatusDto(true, true, $"{selected.Provider} configured", normalizedProvider, selected.Id);
        }

        if (!string.IsNullOrWhiteSpace(chatId))
        {
            var existing = _store.Get(chatId);
            if (existing is not null)
            {
                var previousSession = existing.CopilotSessionId;
                existing.Provider = normalizedProvider;
                _store.SetModel(chatId, model);
                _store.Save(existing);
                await _copilot.DeleteSessionAsync(previousSession);
            }
        }

        return status;
    }

    public ChatDetailDto? Rename(string id, string title) => _store.Rename(id, title)?.ToDetail();

    public async Task<bool> DeleteAsync(string id)
    {
        var chat = _store.Get(id);
        if (chat is null) return false;
        await _copilot.DeleteSessionAsync(chat.CopilotSessionId);
        return _store.Delete(id);
    }

    public async IAsyncEnumerable<ChatStreamEvent> SendAsync(
        string chatId,
        SendMessageRequest request,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var channel = Channel.CreateUnbounded<ChatStreamEvent>();

        _ = Task.Run(async () =>
        {
            try
            {
                await ProduceAsync(chatId, request, channel.Writer, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Chat stream failed");
                await channel.Writer.WriteAsync(
                    ChatStreamEvent.Error("The chat request could not be completed."),
                    CancellationToken.None);
            }
            finally
            {
                channel.Writer.TryComplete();
            }
        }, CancellationToken.None);

        await foreach (var evt in channel.Reader.ReadAllAsync(cancellationToken))
            yield return evt;
    }

    private async Task ProduceAsync(
        string chatId,
        SendMessageRequest request,
        ChannelWriter<ChatStreamEvent> writer,
        CancellationToken cancellationToken)
    {
        var chat = _store.Get(chatId)
            ?? throw new KeyNotFoundException($"Chat '{chatId}' not found.");

        if (string.IsNullOrWhiteSpace(request.Content) &&
            (request.Attachments is null || request.Attachments.Count == 0))
        {
            throw new ArgumentException("Message content or attachments are required.");
        }

        var attachmentRecords = MapAttachments(request.Attachments);
        var userMessage = new ChatMessageRecord
        {
            Id = Guid.NewGuid().ToString("N"),
            Role = "user",
            Content = request.Content?.Trim() ?? "",
            CreatedAt = DateTimeOffset.UtcNow,
            Attachments = attachmentRecords
        };
        chat.Messages.Add(userMessage);

        if (chat.Title == "New Chat" && !string.IsNullOrWhiteSpace(userMessage.Content))
            chat.Title = Truncate(userMessage.Content, 48);

        var provider = string.IsNullOrWhiteSpace(chat.Provider) ? "copilot" : _providers.NormalizeProvider(chat.Provider);
        chat.Provider = provider;
        var model = string.IsNullOrWhiteSpace(chat.Model) ? _copilot.Model : chat.Model;
        chat.Model = model;
        _store.Save(chat);
        await writer.WriteAsync(ChatStreamEvent.User(userMessage.ToDto()), cancellationToken);

        if (!string.Equals(provider, "copilot", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"{provider} chat sending is not wired yet. Set keys in Settings, then switch back to Copilot for chat execution.");

        var session = await _copilot.GetOrCreateSessionAsync(chat.CopilotSessionId, _workspace.Root, model);
        chat.CopilotSessionId = session.SessionId;
        _store.Save(chat);

        var assistantBuffer = new StringBuilder();
        var pendingDeltas = Channel.CreateUnbounded<string>();
        string? error = null;
        var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        using var reg = cancellationToken.Register(() => done.TrySetCanceled(cancellationToken));
        using var sub = session.On<SessionEvent>(evt =>
        {
            switch (evt)
            {
                case AssistantMessageDeltaEvent delta:
                    if (!string.IsNullOrEmpty(delta.Data.DeltaContent))
                    {
                        assistantBuffer.Append(delta.Data.DeltaContent);
                        pendingDeltas.Writer.TryWrite(delta.Data.DeltaContent);
                    }
                    break;
                case AssistantMessageEvent message:
                    if (!string.IsNullOrEmpty(message.Data.Content))
                    {
                        assistantBuffer.Clear();
                        assistantBuffer.Append(message.Data.Content);
                    }
                    break;
                case SessionErrorEvent err:
                    error = err.Data.Message ?? "Copilot session error";
                    pendingDeltas.Writer.TryComplete();
                    done.TrySetResult();
                    break;
                case SessionIdleEvent:
                    pendingDeltas.Writer.TryComplete();
                    done.TrySetResult();
                    break;
            }
        });

        // Forward deltas while SendAsync runs; waiting until after it returns
        // buffers the whole reply and the UI never appears to stream.
        var forwardDeltas = Task.Run(async () =>
        {
            await foreach (var chunk in pendingDeltas.Reader.ReadAllAsync(cancellationToken))
                await writer.WriteAsync(ChatStreamEvent.Delta(chunk), cancellationToken);
        }, cancellationToken);

        try
        {
            var attachments = BuildCopilotAttachments(request.Attachments);
            await session.SendAsync(new MessageOptions
            {
                Prompt = string.IsNullOrWhiteSpace(request.Content) ? "See attached files." : request.Content,
                Attachments = attachments
            });

            await done.Task;
        }
        finally
        {
            pendingDeltas.Writer.TryComplete();
            done.TrySetResult();
            try { await forwardDeltas; }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { /* client gone */ }
        }

        if (!string.IsNullOrEmpty(error))
        {
            _logger.LogWarning("Copilot session returned an error: {Error}", error);
            await writer.WriteAsync(
                ChatStreamEvent.Error("The assistant could not complete the response."),
                cancellationToken);
            return;
        }

        var final = assistantBuffer.ToString();
        if (string.IsNullOrWhiteSpace(final))
            final = "(No response from Copilot)";

        var assistant = new ChatMessageRecord
        {
            Id = Guid.NewGuid().ToString("N"),
            Role = "assistant",
            Content = final,
            CreatedAt = DateTimeOffset.UtcNow
        };
        chat.Messages.Add(assistant);
        _store.Save(chat);
        await writer.WriteAsync(ChatStreamEvent.Done(assistant.ToDto()), cancellationToken);
    }

    private List<ChatAttachmentRecord>? MapAttachments(IReadOnlyList<MessageAttachmentRequest>? attachments)
    {
        if (attachments is null || attachments.Count == 0) return null;

        return attachments.Select(a => new ChatAttachmentRecord
        {
            Id = Guid.NewGuid().ToString("N"),
            Name = a.Name ?? Path.GetFileName(a.Path ?? "attachment"),
            Kind = a.Kind,
            Path = a.Path,
            MimeType = a.MimeType,
            DataBase64 = string.Equals(a.Kind, "blob", StringComparison.OrdinalIgnoreCase) ? a.DataBase64 : null
        }).ToList();
    }

    private List<Attachment>? BuildCopilotAttachments(IReadOnlyList<MessageAttachmentRequest>? attachments)
    {
        if (attachments is null || attachments.Count == 0) return null;

        var list = new List<Attachment>();
        foreach (var a in attachments)
        {
            if (string.Equals(a.Kind, "blob", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(a.DataBase64))
            {
                list.Add(new AttachmentBlob
                {
                    Data = a.DataBase64,
                    MimeType = a.MimeType ?? "application/octet-stream",
                    DisplayName = a.Name ?? "attachment"
                });
                continue;
            }

            if (!string.IsNullOrWhiteSpace(a.Path))
            {
                var full = _workspace.ResolvePath(a.Path);
                list.Add(new AttachmentFile
                {
                    Path = full,
                    DisplayName = a.Name ?? Path.GetFileName(full)
                });
            }
        }

        return list.Count == 0 ? null : list;
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..(max - 1)].TrimEnd() + "…";
}

public sealed record ChatStreamEvent(string Type, object? Payload)
{
    public static ChatStreamEvent User(ChatMessageDto message) => new("user", message);
    public static ChatStreamEvent Delta(string content) => new("delta", new { content });
    public static ChatStreamEvent Done(ChatMessageDto message) => new("done", message);
    public static ChatStreamEvent Error(string message) => new("error", new { message });
}
