using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public sealed class ProviderChatService
{
    private const int MaxAttachmentChars = 100_000;
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    private readonly AiProviderService _providers;
    private readonly WorkspaceService _workspace;
    private readonly ILogger<ProviderChatService> _logger;
    private readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromMinutes(10)
    };

    public ProviderChatService(
        AiProviderService providers,
        WorkspaceService workspace,
        ILogger<ProviderChatService> logger)
    {
        _providers = providers;
        _workspace = workspace;
        _logger = logger;
    }

    public List<ProviderMessage> BuildTurn(IReadOnlyList<ChatMessageRecord> history)
    {
        var messages = new List<ProviderMessage>
        {
            new("system", ChatToolCatalog.SystemPrompt(_workspace.Root))
        };

        foreach (var message in history)
        {
            var role = message.Role?.Trim().ToLowerInvariant();
            if (role == "user")
            {
                var content = ExpandContent(message);
                if (!string.IsNullOrWhiteSpace(content))
                    messages.Add(new ProviderMessage("user", content));
                continue;
            }

            if (role != "assistant")
                continue;

            if (message.ToolCalls is { Count: > 0 })
            {
                var calls = message.ToolCalls
                    .Select(call => new ProviderToolCall(
                        string.IsNullOrWhiteSpace(call.Id) ? Guid.NewGuid().ToString("N") : call.Id,
                        string.IsNullOrWhiteSpace(call.Name) ? "tool" : call.Name,
                        call.Arguments ?? "{}"))
                    .ToList();
                messages.Add(new ProviderMessage("assistant", null, calls));
                foreach (var call in message.ToolCalls)
                {
                    var result = call.Error ?? call.Result ?? "";
                    messages.Add(new ProviderMessage("tool", result, ToolCallId: call.Id));
                }
            }

            if (!string.IsNullOrWhiteSpace(message.Content))
                messages.Add(new ProviderMessage("assistant", message.Content));
        }

        return messages;
    }

    public async IAsyncEnumerable<ProviderRoundEvent> StreamRoundAsync(
        string provider,
        string model,
        IReadOnlyList<ProviderMessage> messages,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var normalized = _providers.NormalizeProvider(provider);
        var connection = _providers.GetConnection(normalized);

        var stream = normalized switch
        {
            "openai" or "wire" => StreamOpenAiRoundAsync(connection, model, messages, normalized == "wire", cancellationToken),
            "claude" => StreamClaudeRoundAsync(connection, model, messages, cancellationToken),
            "ollama" => StreamOllamaRoundAsync(connection, model, messages, cancellationToken),
            _ => throw new InvalidOperationException($"Chat for '{normalized}' is not supported.")
        };

        await foreach (var evt in stream.WithCancellation(cancellationToken))
            yield return evt;
    }

    private async IAsyncEnumerable<ProviderRoundEvent> StreamOpenAiRoundAsync(
        ProviderSettingsDto connection,
        string model,
        IReadOnlyList<ProviderMessage> messages,
        bool wire,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (!wire && string.IsNullOrWhiteSpace(connection.ApiKey))
            throw new InvalidOperationException("Set an OpenAI API key in Settings.");
        if (string.IsNullOrWhiteSpace(connection.BaseUrl))
            throw new InvalidOperationException(wire
                ? "Aura Wire API address is missing. Detect it in Settings."
                : "OpenAI base URL is missing.");

        var url = $"{connection.BaseUrl.TrimEnd('/')}/chat/completions";
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", connection.ApiKey!.Trim());
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        if (wire)
            request.Headers.TryAddWithoutValidation("X-Aura-Wire-Ide", "mini-cursor");

        request.Content = JsonContent(new Dictionary<string, object?>
        {
            ["model"] = model,
            ["stream"] = true,
            ["messages"] = ToOpenAiMessages(messages),
            ["tools"] = ChatToolCatalog.OpenAiTools,
            ["tool_choice"] = "auto"
        });

        using var response = await SendForStreamAsync(request, wire ? "Aura Wire" : "OpenAI", cancellationToken);
        var acc = new OpenAiRoundAccumulator();
        await foreach (var data in ReadSseDataAsync(response, cancellationToken))
        {
            if (data == "[DONE]")
                break;

            JsonElement root;
            try
            {
                using var doc = JsonDocument.Parse(data);
                root = doc.RootElement.Clone();
            }
            catch (JsonException)
            {
                continue;
            }

            var applied = acc.Apply(root);
            if (!string.IsNullOrEmpty(applied.TextDelta))
                yield return ProviderRoundEvent.Delta(applied.TextDelta);
            if (applied.ToolUpdate is not null)
                yield return ProviderRoundEvent.ToolEvent(applied.ToolUpdate);
        }

        yield return ProviderRoundEvent.Complete(acc.CompletedToolCalls());
    }

    private async IAsyncEnumerable<ProviderRoundEvent> StreamClaudeRoundAsync(
        ProviderSettingsDto connection,
        string model,
        IReadOnlyList<ProviderMessage> messages,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(connection.ApiKey))
            throw new InvalidOperationException("Set a Claude API key in Settings.");

        var baseUrl = (connection.BaseUrl ?? "https://api.anthropic.com").TrimEnd('/');
        var url = baseUrl.EndsWith("/v1", StringComparison.OrdinalIgnoreCase)
            ? $"{baseUrl}/messages"
            : $"{baseUrl}/v1/messages";

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.TryAddWithoutValidation("x-api-key", connection.ApiKey.Trim());
        request.Headers.TryAddWithoutValidation("anthropic-version", "2023-06-01");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        request.Content = JsonContent(new Dictionary<string, object?>
        {
            ["model"] = model,
            ["max_tokens"] = 8192,
            ["stream"] = true,
            ["system"] = SystemContent(messages),
            ["messages"] = ToClaudeMessages(messages),
            ["tools"] = ChatToolCatalog.ClaudeTools
        });

        using var response = await SendForStreamAsync(request, "Claude", cancellationToken);
        var acc = new ClaudeRoundAccumulator();
        await foreach (var data in ReadSseDataAsync(response, cancellationToken))
        {
            if (data == "[DONE]")
                continue;

            JsonElement root;
            try
            {
                using var doc = JsonDocument.Parse(data);
                root = doc.RootElement.Clone();
            }
            catch (JsonException)
            {
                continue;
            }

            var applied = acc.Apply(root);
            if (!string.IsNullOrEmpty(applied.TextDelta))
                yield return ProviderRoundEvent.Delta(applied.TextDelta);
            if (applied.ToolUpdate is not null)
                yield return ProviderRoundEvent.ToolEvent(applied.ToolUpdate);
        }

        yield return ProviderRoundEvent.Complete(acc.CompletedToolCalls());
    }

    private async IAsyncEnumerable<ProviderRoundEvent> StreamOllamaRoundAsync(
        ProviderSettingsDto connection,
        string model,
        IReadOnlyList<ProviderMessage> messages,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(connection.BaseUrl))
            throw new InvalidOperationException("Ollama base URL is missing.");

        var url = $"{connection.BaseUrl.TrimEnd('/')}/api/chat";
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        if (!string.IsNullOrWhiteSpace(connection.ApiKey))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", connection.ApiKey.Trim());
        request.Content = JsonContent(new Dictionary<string, object?>
        {
            ["model"] = model,
            ["stream"] = true,
            ["messages"] = ToOpenAiMessages(messages),
            ["tools"] = ChatToolCatalog.OpenAiTools
        });

        using var response = await SendForStreamAsync(request, "Ollama", cancellationToken);
        var acc = new OllamaRoundAccumulator();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);
        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;

            JsonElement root;
            try
            {
                using var doc = JsonDocument.Parse(line);
                root = doc.RootElement.Clone();
            }
            catch (JsonException)
            {
                continue;
            }

            var applied = acc.Apply(root);
            if (!string.IsNullOrEmpty(applied.TextDelta))
                yield return ProviderRoundEvent.Delta(applied.TextDelta);
            if (applied.ToolUpdate is not null)
                yield return ProviderRoundEvent.ToolEvent(applied.ToolUpdate);
            if (acc.IsDone(root))
                break;
        }

        yield return ProviderRoundEvent.Complete(acc.CompletedToolCalls());
    }

    private async Task<HttpResponseMessage> SendForStreamAsync(
        HttpRequestMessage request,
        string label,
        CancellationToken cancellationToken)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "{Provider} chat request failed to connect", label);
            throw new InvalidOperationException($"Could not reach {label}. {ex.Message}");
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "{Provider} chat request timed out", label);
            throw new InvalidOperationException($"{label} timed out.");
        }

        if (response.IsSuccessStatusCode)
            return response;

        var status = (int)response.StatusCode;
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        response.Dispose();
        throw new InvalidOperationException(FormatHttpError(label, status, body));
    }

    private static async IAsyncEnumerable<string> ReadSseDataAsync(
        HttpResponseMessage response,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);
        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            if (line.Length == 0)
                continue;
            if (!line.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                continue;

            var data = line[5..].Trim();
            if (data.Length == 0)
                continue;
            yield return data;
        }
    }

    private static string FormatHttpError(string label, int status, string body)
    {
        var detail = ExtractErrorMessage(body);
        if (!string.IsNullOrWhiteSpace(detail))
            return $"{label} returned {status}: {detail}";
        return $"{label} returned {status}.";
    }

    private static string? ExtractErrorMessage(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.TryGetProperty("error", out var error))
            {
                if (error.ValueKind == JsonValueKind.String)
                    return error.GetString();
                if (error.TryGetProperty("message", out var message))
                    return message.GetString();
            }

            if (root.TryGetProperty("message", out var topMessage))
                return topMessage.GetString();
        }
        catch (JsonException)
        {
            // fall through
        }

        var trimmed = body.Trim();
        return trimmed.Length <= 280 ? trimmed : trimmed[..279] + "…";
    }

    private static string SystemContent(IReadOnlyList<ProviderMessage> messages) =>
        messages.FirstOrDefault(m => m.Role == "system")?.Content ?? ChatToolCatalog.SystemPrompt("");

    private static List<Dictionary<string, object?>> ToOpenAiMessages(IReadOnlyList<ProviderMessage> messages)
    {
        var list = new List<Dictionary<string, object?>>();
        foreach (var message in messages)
        {
            if (message.Role == "assistant" && message.ToolCalls is { Count: > 0 })
            {
                list.Add(new Dictionary<string, object?>
                {
                    ["role"] = "assistant",
                    ["content"] = string.IsNullOrWhiteSpace(message.Content) ? null : message.Content,
                    ["tool_calls"] = message.ToolCalls.Select(call => new Dictionary<string, object?>
                    {
                        ["id"] = call.Id,
                        ["type"] = "function",
                        ["function"] = new Dictionary<string, object?>
                        {
                            ["name"] = call.Name,
                            ["arguments"] = string.IsNullOrWhiteSpace(call.Arguments) ? "{}" : call.Arguments
                        }
                    }).ToList()
                });
                continue;
            }

            if (message.Role == "tool")
            {
                list.Add(new Dictionary<string, object?>
                {
                    ["role"] = "tool",
                    ["tool_call_id"] = message.ToolCallId ?? "",
                    ["content"] = message.Content ?? ""
                });
                continue;
            }

            if (string.IsNullOrWhiteSpace(message.Content) && message.Role != "assistant")
                continue;

            list.Add(new Dictionary<string, object?>
            {
                ["role"] = message.Role,
                ["content"] = message.Content ?? ""
            });
        }

        return list;
    }

    private static List<Dictionary<string, object?>> ToClaudeMessages(IReadOnlyList<ProviderMessage> messages)
    {
        var list = new List<Dictionary<string, object?>>();
        List<Dictionary<string, object?>>? pendingResults = null;

        void AddUser(object content)
        {
            if (list.Count > 0 &&
                list[^1].TryGetValue("role", out var role) &&
                role as string == "user")
            {
                list[^1]["content"] = MergeClaudeUserContent(list[^1]["content"], content);
                return;
            }

            list.Add(new Dictionary<string, object?>
            {
                ["role"] = "user",
                ["content"] = content
            });
        }

        void FlushResults()
        {
            if (pendingResults is not { Count: > 0 })
                return;
            AddUser(pendingResults);
            pendingResults = null;
        }

        foreach (var message in messages)
        {
            if (message.Role == "system")
                continue;

            if (message.Role == "tool")
            {
                pendingResults ??= [];
                pendingResults.Add(new Dictionary<string, object?>
                {
                    ["type"] = "tool_result",
                    ["tool_use_id"] = message.ToolCallId ?? "",
                    ["content"] = message.Content ?? ""
                });
                continue;
            }

            FlushResults();

            if (message.Role == "assistant" && message.ToolCalls is { Count: > 0 })
            {
                var content = new List<Dictionary<string, object?>>();
                if (!string.IsNullOrWhiteSpace(message.Content))
                    content.Add(new Dictionary<string, object?> { ["type"] = "text", ["text"] = message.Content });

                foreach (var call in message.ToolCalls)
                {
                    content.Add(new Dictionary<string, object?>
                    {
                        ["type"] = "tool_use",
                        ["id"] = call.Id,
                        ["name"] = call.Name,
                        ["input"] = ParseToolInput(call.Arguments)
                    });
                }

                list.Add(new Dictionary<string, object?>
                {
                    ["role"] = "assistant",
                    ["content"] = content
                });
                continue;
            }

            if (string.IsNullOrWhiteSpace(message.Content))
                continue;

            if (message.Role == "user")
            {
                AddUser(message.Content!);
                continue;
            }

            list.Add(new Dictionary<string, object?>
            {
                ["role"] = message.Role,
                ["content"] = message.Content
            });
        }

        FlushResults();
        return list;
    }

    private static List<Dictionary<string, object?>> MergeClaudeUserContent(object? existing, object incoming)
    {
        var blocks = new List<Dictionary<string, object?>>();
        AppendClaudeUserContent(blocks, existing);
        AppendClaudeUserContent(blocks, incoming);
        return blocks;
    }

    private static void AppendClaudeUserContent(List<Dictionary<string, object?>> blocks, object? content)
    {
        if (content is string text && !string.IsNullOrWhiteSpace(text))
        {
            blocks.Add(new Dictionary<string, object?> { ["type"] = "text", ["text"] = text });
            return;
        }

        if (content is List<Dictionary<string, object?>> list)
            blocks.AddRange(list);
    }

    private static object ParseToolInput(string? arguments)
    {
        if (string.IsNullOrWhiteSpace(arguments))
            return new Dictionary<string, object?>();

        try
        {
            using var doc = JsonDocument.Parse(arguments);
            return JsonSerializer.Deserialize<object>(doc.RootElement.GetRawText()) ?? new Dictionary<string, object?>();
        }
        catch (JsonException)
        {
            return new Dictionary<string, object?> { ["raw"] = arguments };
        }
    }

    private string ExpandContent(ChatMessageRecord message)
    {
        var text = message.Content ?? "";
        if (message.Attachments is null || message.Attachments.Count == 0)
            return text;

        var builder = new StringBuilder(text);
        foreach (var attachment in message.Attachments)
        {
            var body = ReadAttachment(attachment);
            if (string.IsNullOrWhiteSpace(body))
                continue;

            if (builder.Length > 0)
                builder.Append("\n\n");
            builder.Append("Attached file: ").Append(attachment.Name).Append('\n');
            builder.Append("```\n").Append(body).Append("\n```");
        }

        return builder.ToString();
    }

    private string? ReadAttachment(ChatAttachmentRecord attachment)
    {
        try
        {
            if (string.Equals(attachment.Kind, "blob", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(attachment.DataBase64))
            {
                var bytes = Convert.FromBase64String(attachment.DataBase64);
                if (attachment.MimeType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) == true)
                    return $"[image attached: {attachment.Name}]";
                return Truncate(Encoding.UTF8.GetString(bytes));
            }

            if (!string.IsNullOrWhiteSpace(attachment.Path))
            {
                var full = _workspace.ResolvePath(attachment.Path);
                if (!File.Exists(full))
                    return $"[missing file: {attachment.Name}]";
                return Truncate(File.ReadAllText(full));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read chat attachment {Name}", attachment.Name);
            return $"[could not read {attachment.Name}]";
        }

        return null;
    }

    private static string Truncate(string value)
    {
        if (value.Length <= MaxAttachmentChars)
            return value;
        return value[..MaxAttachmentChars] + "\n…";
    }

    private static StringContent JsonContent(object payload) =>
        new(JsonSerializer.Serialize(payload, Json), Encoding.UTF8, "application/json");
}
