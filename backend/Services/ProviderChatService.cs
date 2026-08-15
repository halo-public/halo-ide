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

    public async IAsyncEnumerable<string> StreamAsync(
        string provider,
        string model,
        IReadOnlyList<ChatMessageRecord> history,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var normalized = _providers.NormalizeProvider(provider);
        var connection = _providers.GetConnection(normalized);
        var messages = BuildMessages(history);

        var stream = normalized switch
        {
            "openai" or "wire" => StreamOpenAiAsync(connection, model, messages, normalized == "wire", cancellationToken),
            "claude" => StreamClaudeAsync(connection, model, messages, cancellationToken),
            "ollama" => StreamOllamaAsync(connection, model, messages, cancellationToken),
            _ => throw new InvalidOperationException($"Chat for '{normalized}' is not supported.")
        };

        await foreach (var delta in stream.WithCancellation(cancellationToken))
        {
            if (!string.IsNullOrEmpty(delta))
                yield return delta;
        }
    }

    private async IAsyncEnumerable<string> StreamOpenAiAsync(
        ProviderSettingsDto connection,
        string model,
        IReadOnlyList<Dictionary<string, string>> messages,
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

        request.Content = JsonContent(new
        {
            model,
            stream = true,
            messages
        });

        using var response = await SendForStreamAsync(request, wire ? "Aura Wire" : "OpenAI", cancellationToken);
        await foreach (var delta in ReadOpenAiSseAsync(response, cancellationToken))
            yield return delta;
    }

    private async IAsyncEnumerable<string> StreamClaudeAsync(
        ProviderSettingsDto connection,
        string model,
        IReadOnlyList<Dictionary<string, string>> messages,
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
        request.Content = JsonContent(new
        {
            model,
            max_tokens = 8192,
            stream = true,
            messages
        });

        using var response = await SendForStreamAsync(request, "Claude", cancellationToken);
        await foreach (var delta in ReadClaudeSseAsync(response, cancellationToken))
            yield return delta;
    }

    private async IAsyncEnumerable<string> StreamOllamaAsync(
        ProviderSettingsDto connection,
        string model,
        IReadOnlyList<Dictionary<string, string>> messages,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(connection.BaseUrl))
            throw new InvalidOperationException("Ollama base URL is missing.");

        var url = $"{connection.BaseUrl.TrimEnd('/')}/api/chat";
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        if (!string.IsNullOrWhiteSpace(connection.ApiKey))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", connection.ApiKey.Trim());
        request.Content = JsonContent(new
        {
            model,
            stream = true,
            messages
        });

        using var response = await SendForStreamAsync(request, "Ollama", cancellationToken);
        await foreach (var delta in ReadOllamaNdjsonAsync(response, cancellationToken))
            yield return delta;
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

    private static async IAsyncEnumerable<string> ReadOpenAiSseAsync(
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
            if (data.Length == 0 || data == "[DONE]")
                yield break;

            string? content = null;
            try
            {
                using var doc = JsonDocument.Parse(data);
                if (doc.RootElement.TryGetProperty("choices", out var choices) &&
                    choices.ValueKind == JsonValueKind.Array &&
                    choices.GetArrayLength() > 0)
                {
                    var choice = choices[0];
                    if (choice.TryGetProperty("delta", out var delta) &&
                        delta.TryGetProperty("content", out var contentEl) &&
                        contentEl.ValueKind == JsonValueKind.String)
                    {
                        content = contentEl.GetString();
                    }
                    else if (choice.TryGetProperty("message", out var message) &&
                             message.TryGetProperty("content", out var messageContent) &&
                             messageContent.ValueKind == JsonValueKind.String)
                    {
                        content = messageContent.GetString();
                    }
                }
            }
            catch (JsonException)
            {
                continue;
            }

            if (!string.IsNullOrEmpty(content))
                yield return content;
        }
    }

    private static async IAsyncEnumerable<string> ReadClaudeSseAsync(
        HttpResponseMessage response,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);
        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            if (!line.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                continue;

            var data = line[5..].Trim();
            if (data.Length == 0 || data == "[DONE]")
                continue;

            string? content = null;
            try
            {
                using var doc = JsonDocument.Parse(data);
                var root = doc.RootElement;
                var type = root.TryGetProperty("type", out var typeEl) ? typeEl.GetString() : null;
                if (type is "content_block_delta" &&
                    root.TryGetProperty("delta", out var delta) &&
                    delta.TryGetProperty("text", out var text) &&
                    text.ValueKind == JsonValueKind.String)
                {
                    content = text.GetString();
                }
                else if (type is "error")
                {
                    var message = root.TryGetProperty("error", out var error) &&
                                  error.TryGetProperty("message", out var errMessage)
                        ? errMessage.GetString()
                        : "Claude stream error";
                    throw new InvalidOperationException(message ?? "Claude stream error");
                }
            }
            catch (JsonException)
            {
                continue;
            }

            if (!string.IsNullOrEmpty(content))
                yield return content;
        }
    }

    private static async IAsyncEnumerable<string> ReadOllamaNdjsonAsync(
        HttpResponseMessage response,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);
        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;

            string? content = null;
            var done = false;
            try
            {
                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;
                if (root.TryGetProperty("message", out var message) &&
                    message.TryGetProperty("content", out var contentEl) &&
                    contentEl.ValueKind == JsonValueKind.String)
                {
                    content = contentEl.GetString();
                }

                done = root.TryGetProperty("done", out var doneEl) && doneEl.ValueKind == JsonValueKind.True;
                if (root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.String)
                    throw new InvalidOperationException(error.GetString() ?? "Ollama error");
            }
            catch (JsonException)
            {
                continue;
            }

            if (!string.IsNullOrEmpty(content))
                yield return content;
            if (done)
                yield break;
        }
    }

    private List<Dictionary<string, string>> BuildMessages(IReadOnlyList<ChatMessageRecord> history)
    {
        var messages = new List<Dictionary<string, string>>();
        foreach (var message in history)
        {
            var role = message.Role?.Trim().ToLowerInvariant();
            if (role is not ("user" or "assistant"))
                continue;

            var content = ExpandContent(message);
            if (string.IsNullOrWhiteSpace(content))
                continue;

            messages.Add(new Dictionary<string, string>
            {
                ["role"] = role,
                ["content"] = content
            });
        }

        return messages;
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
