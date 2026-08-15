using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using GitHub.Copilot;
using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public sealed class ChatService
{
    private readonly ChatStore _store;
    private readonly CopilotService _copilot;
    private readonly AiProviderService _providers;
    private readonly ProviderChatService _providerChat;
    private readonly WorkspaceService _workspace;
    private readonly ILogger<ChatService> _logger;

    public ChatService(
        ChatStore store,
        CopilotService copilot,
        AiProviderService providers,
        ProviderChatService providerChat,
        WorkspaceService workspace,
        ILogger<ChatService> logger)
    {
        _store = store;
        _copilot = copilot;
        _providers = providers;
        _providerChat = providerChat;
        _workspace = workspace;
        _logger = logger;
    }

    public IReadOnlyList<ChatSummaryDto> List() => _store.List();

    public ChatDetailDto? Get(string id) => _store.Get(id)?.ToDetail();

    public ChatDetailDto Create(string? title, string? provider = null, string? model = null)
    {
        var normalizedProvider = string.IsNullOrWhiteSpace(provider)
            ? (_store.GetMostRecentProvider() ?? "copilot")
            : _providers.NormalizeProvider(provider);

        var resolvedModel = string.IsNullOrWhiteSpace(model)
            ? _store.GetMostRecentModel()
            : model.Trim();

        if (string.Equals(normalizedProvider, "copilot", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(resolvedModel))
                resolvedModel = _copilot.Model;
            else if (!string.Equals(resolvedModel, _copilot.Model, StringComparison.OrdinalIgnoreCase))
                _ = _copilot.SetModelAsync(resolvedModel);
        }

        var created = _store.Create(title, resolvedModel);
        created.Provider = normalizedProvider;
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

        var provider = !string.IsNullOrWhiteSpace(request.Provider)
            ? _providers.NormalizeProvider(request.Provider)
            : string.IsNullOrWhiteSpace(chat.Provider) ? "copilot" : _providers.NormalizeProvider(chat.Provider);
        chat.Provider = provider;
        var model = !string.IsNullOrWhiteSpace(request.Model)
            ? request.Model.Trim()
            : string.IsNullOrWhiteSpace(chat.Model) ? _copilot.Model : chat.Model;
        chat.Model = model;
        _store.Save(chat);
        await writer.WriteAsync(ChatStreamEvent.User(userMessage.ToDto()), cancellationToken);

        if (!string.Equals(provider, "copilot", StringComparison.OrdinalIgnoreCase))
        {
            await ProduceProviderAsync(chat, provider, model, writer, cancellationToken);
            return;
        }

        var session = await _copilot.GetOrCreateSessionAsync(chat.CopilotSessionId, _workspace.Root, model);
        chat.CopilotSessionId = session.SessionId;
        _store.Save(chat);

        var assistantBuffer = new StringBuilder();
        var pendingEvents = Channel.CreateUnbounded<ChatStreamEvent>();
        var tools = new ConcurrentDictionary<string, ChatToolCallDto>(StringComparer.Ordinal);
        string? error = null;
        var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        ChatToolCallDto GetOrCreateTool(string? id, string? name)
        {
            var key = string.IsNullOrWhiteSpace(id) ? Guid.NewGuid().ToString("N") : id.Trim();
            if (tools.TryGetValue(key, out var existing))
            {
                if (!string.IsNullOrWhiteSpace(name) &&
                    !string.Equals(existing.Name, name, StringComparison.Ordinal))
                    return existing with { Name = name };
                return existing;
            }

            return new ChatToolCallDto(key, string.IsNullOrWhiteSpace(name) ? "tool" : name.Trim(), "pending");
        }

        void EmitTool(ChatToolCallDto call)
        {
            tools[call.Id] = call;
            pendingEvents.Writer.TryWrite(ChatStreamEvent.Tool(call));
        }

        using var reg = cancellationToken.Register(() => done.TrySetCanceled(cancellationToken));
        using var sub = session.On<SessionEvent>(evt =>
        {
            switch (evt)
            {
                case AssistantMessageDeltaEvent delta:
                    if (!string.IsNullOrEmpty(delta.Data.DeltaContent))
                    {
                        assistantBuffer.Append(delta.Data.DeltaContent);
                        pendingEvents.Writer.TryWrite(ChatStreamEvent.Delta(delta.Data.DeltaContent));
                    }
                    break;
                case AssistantMessageEvent message:
                    if (!string.IsNullOrEmpty(message.Data.Content))
                    {
                        assistantBuffer.Clear();
                        assistantBuffer.Append(message.Data.Content);
                    }
                    if (message.Data.ToolRequests is { Length: > 0 })
                    {
                        foreach (var req in message.Data.ToolRequests)
                        {
                            var current = GetOrCreateTool(req.ToolCallId, req.Name ?? req.ToolTitle);
                            var alreadyDone = current.Status is "complete" or "error";
                            EmitTool(current with
                            {
                                Status = alreadyDone ? current.Status : "pending",
                                Detail = req.IntentionSummary ?? current.Detail,
                                Arguments = FormatValue(req.Arguments) ?? current.Arguments
                            });
                        }
                    }
                    break;
                case AssistantToolCallDeltaEvent toolDelta:
                {
                    var current = GetOrCreateTool(toolDelta.Data.ToolCallId, toolDelta.Data.ToolName);
                    var args = current.Arguments ?? "";
                    if (!string.IsNullOrEmpty(toolDelta.Data.InputDelta))
                        args += toolDelta.Data.InputDelta;
                    EmitTool(current with
                    {
                        Arguments = args,
                        Status = current.Status is "complete" or "error" ? current.Status : "pending"
                    });
                    break;
                }
                case ToolExecutionStartEvent start:
                {
                    var current = GetOrCreateTool(start.Data.ToolCallId, start.Data.ToolName);
                    EmitTool(current with
                    {
                        Status = "running",
                        Arguments = FormatValue(start.Data.Arguments) ?? current.Arguments
                    });
                    break;
                }
                case ToolExecutionProgressEvent progress:
                {
                    var current = GetOrCreateTool(progress.Data.ToolCallId, null);
                    EmitTool(current with
                    {
                        Status = current.Status is "complete" or "error" ? current.Status : "running",
                        Detail = progress.Data.ProgressMessage ?? current.Detail
                    });
                    break;
                }
                case ToolExecutionPartialResultEvent partial:
                {
                    var current = GetOrCreateTool(partial.Data.ToolCallId, null);
                    var result = (current.Result ?? "") + (partial.Data.PartialOutput ?? "");
                    EmitTool(current with
                    {
                        Status = current.Status is "complete" or "error" ? current.Status : "running",
                        Result = Truncate(result, 8000)
                    });
                    break;
                }
                case ToolExecutionCompleteEvent complete:
                {
                    var current = GetOrCreateTool(complete.Data.ToolCallId, null);
                    var result = complete.Data.Result?.DetailedContent ?? complete.Data.Result?.Content;
                    EmitTool(current with
                    {
                        Status = complete.Data.Success ? "complete" : "error",
                        Result = FormatValue(result, 8000) ?? current.Result,
                        Error = complete.Data.Error?.Message ?? current.Error
                    });
                    break;
                }
                case SessionErrorEvent err:
                    error = err.Data.Message ?? "Copilot session error";
                    pendingEvents.Writer.TryComplete();
                    done.TrySetResult();
                    break;
                case SessionIdleEvent:
                    pendingEvents.Writer.TryComplete();
                    done.TrySetResult();
                    break;
            }
        });

        // Forward deltas while SendAsync runs; waiting until after it returns
        // buffers the whole reply and the UI never appears to stream.
        var forwardEvents = Task.Run(async () =>
        {
            await foreach (var streamEvent in pendingEvents.Reader.ReadAllAsync(cancellationToken))
                await writer.WriteAsync(streamEvent, cancellationToken);
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
            pendingEvents.Writer.TryComplete();
            done.TrySetResult();
            try { await forwardEvents; }
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
            CreatedAt = DateTimeOffset.UtcNow,
            ToolCalls = tools.IsEmpty ? null : tools.Values.ToList()
        };
        chat.Messages.Add(assistant);
        _store.Save(chat);
        await writer.WriteAsync(ChatStreamEvent.Done(assistant.ToDto()), cancellationToken);
    }

    private async Task ProduceProviderAsync(
        ChatRecord chat,
        string provider,
        string model,
        ChannelWriter<ChatStreamEvent> writer,
        CancellationToken cancellationToken)
    {
        var assistantBuffer = new StringBuilder();
        try
        {
            await foreach (var delta in _providerChat.StreamAsync(provider, model, chat.Messages, cancellationToken))
            {
                assistantBuffer.Append(delta);
                await writer.WriteAsync(ChatStreamEvent.Delta(delta), cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "{Provider} chat failed", provider);
            await writer.WriteAsync(
                ChatStreamEvent.Error(ex.Message),
                cancellationToken);
            return;
        }

        var final = assistantBuffer.ToString();
        if (string.IsNullOrWhiteSpace(final))
            final = $"(No response from {provider})";

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

    private static string? FormatValue(object? value, int max = 4000)
    {
        if (value is null) return null;
        if (value is string text)
            return string.IsNullOrWhiteSpace(text) ? null : Truncate(text, max);

        try
        {
            var json = JsonSerializer.Serialize(value);
            return string.IsNullOrWhiteSpace(json) || json == "null" ? null : Truncate(json, max);
        }
        catch
        {
            var fallback = value.ToString();
            return string.IsNullOrWhiteSpace(fallback) ? null : Truncate(fallback, max);
        }
    }
}

public sealed record ChatStreamEvent(string Type, object? Payload)
{
    public static ChatStreamEvent User(ChatMessageDto message) => new("user", message);
    public static ChatStreamEvent Delta(string content) => new("delta", new { content });
    public static ChatStreamEvent Tool(ChatToolCallDto call) => new("tool", call);
    public static ChatStreamEvent Done(ChatMessageDto message) => new("done", message);
    public static ChatStreamEvent Error(string message) => new("error", new { message });
}
