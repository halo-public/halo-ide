using System.Text;
using System.Text.Json;

namespace MiniCursor.Api.Services;

public sealed class ChatToolExecutor
{
    private readonly WorkspaceService _workspace;
    private readonly WorkspaceProcessRunner _runner;
    private readonly ILogger<ChatToolExecutor> _logger;

    public ChatToolExecutor(
        WorkspaceService workspace,
        WorkspaceProcessRunner runner,
        ILogger<ChatToolExecutor> logger)
    {
        _workspace = workspace;
        _runner = runner;
        _logger = logger;
    }

    public async Task<ChatToolResult> ExecuteAsync(
        string name,
        string? argumentsJson,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var args = ParseArgs(argumentsJson);
            return name.Trim().ToLowerInvariant() switch
            {
                "read_file" => ReadFile(args),
                "list_dir" => ListDir(args),
                "grep" => Grep(args),
                "write_file" => WriteFile(args),
                "str_replace" => StrReplace(args),
                "run_command" => await RunCommandAsync(args, cancellationToken),
                _ => new ChatToolResult(false, $"Unknown tool '{name}'.")
            };
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Tool {Name} failed", name);
            return new ChatToolResult(false, ex.Message);
        }
    }

    public static string ReplaceOnce(string content, string oldString, string newString)
    {
        if (oldString.Length == 0)
            throw new InvalidOperationException("old_string must not be empty.");

        var first = content.IndexOf(oldString, StringComparison.Ordinal);
        if (first < 0)
            throw new InvalidOperationException("old_string was not found in the file.");

        var second = content.IndexOf(oldString, first + oldString.Length, StringComparison.Ordinal);
        if (second >= 0)
            throw new InvalidOperationException("old_string is not unique in the file; include more surrounding context.");

        return string.Concat(content.AsSpan(0, first), newString, content.AsSpan(first + oldString.Length));
    }

    private ChatToolResult ReadFile(JsonElement args)
    {
        var path = RequireString(args, "path");
        var file = _workspace.ReadFile(path);
        return Ok($"path: {file.Path}\n\n{file.Content}");
    }

    private ChatToolResult ListDir(JsonElement args)
    {
        var path = OptionalString(args, "path");
        if (string.IsNullOrWhiteSpace(path) || path is "." or "./")
            path = null;

        var nodes = _workspace.List(path);
        if (nodes.Count == 0)
            return new ChatToolResult(true, "(empty directory)");

        var builder = new StringBuilder();
        foreach (var node in nodes)
        {
            builder.Append(node.IsDirectory ? "dir  " : "file ");
            builder.Append(node.Path);
            if (!node.IsDirectory && node.Size is not null)
                builder.Append(" (").Append(node.Size).Append(" bytes)");
            builder.Append('\n');
        }

        return Ok(builder.ToString().TrimEnd());
    }

    private ChatToolResult Grep(JsonElement args)
    {
        var query = RequireString(args, "query");
        var regex = OptionalBool(args, "regex");
        var matchCase = OptionalBool(args, "matchCase") || OptionalBool(args, "match_case");
        var include = OptionalString(args, "include");
        var exclude = OptionalString(args, "exclude");

        var matches = _workspace.Search(query, true, regex, matchCase, include, exclude);
        if (matches.Count == 0)
            return new ChatToolResult(true, "No matches.");

        var builder = new StringBuilder();
        foreach (var match in matches)
        {
            builder.Append(match.Path).Append(':').Append(match.Line);
            builder.Append(':').Append(match.Preview).Append('\n');
        }

        return Ok(builder.ToString().TrimEnd());
    }

    private ChatToolResult WriteFile(JsonElement args)
    {
        var path = RequireString(args, "path");
        var content = OptionalString(args, "content") ?? "";
        var file = _workspace.WriteFile(path, content);
        return new ChatToolResult(true, $"Wrote {file.Path} ({content.Length} chars).");
    }

    private ChatToolResult StrReplace(JsonElement args)
    {
        var path = RequireString(args, "path");
        var oldString = RequireString(args, "old_string", "oldString");
        var newString = OptionalString(args, "new_string", "newString") ?? "";
        var file = _workspace.ReadFile(path);
        var next = ReplaceOnce(file.Content, oldString, newString);
        _workspace.WriteFile(path, next);
        return new ChatToolResult(true, $"Replaced 1 occurrence in {file.Path}.");
    }

    private async Task<ChatToolResult> RunCommandAsync(JsonElement args, CancellationToken cancellationToken)
    {
        var command = RequireString(args, "command");
        var result = await _runner.RunAsync(command, _workspace.Root, cancellationToken);
        var builder = new StringBuilder();
        if (result.TimedOut)
            builder.AppendLine("timed_out: true");
        if (result.ExitCode is not null)
            builder.Append("exit_code: ").Append(result.ExitCode.Value).Append('\n');
        if (!string.IsNullOrWhiteSpace(result.Output))
        {
            if (builder.Length > 0) builder.Append('\n');
            builder.Append(result.Output);
        }

        var text = builder.Length == 0 ? "(no output)" : builder.ToString().TrimEnd();
        return new ChatToolResult(!result.TimedOut, ChatToolCatalog.TruncateResult(text));
    }

    private static ChatToolResult Ok(string content) =>
        new(true, ChatToolCatalog.TruncateResult(content));

    private static JsonElement ParseArgs(string? argumentsJson)
    {
        if (string.IsNullOrWhiteSpace(argumentsJson))
            return JsonSerializer.SerializeToElement(new Dictionary<string, string>());

        try
        {
            using var doc = JsonDocument.Parse(argumentsJson);
            return doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            throw new InvalidOperationException("Tool arguments were not valid JSON.");
        }
    }

    private static string RequireString(JsonElement args, params string[] names)
    {
        var value = OptionalString(args, names);
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException($"Missing required argument '{names[0]}'.");
        return value;
    }

    private static string? OptionalString(JsonElement args, params string[] names)
    {
        if (args.ValueKind != JsonValueKind.Object)
            return null;

        foreach (var name in names)
        {
            if (!args.TryGetProperty(name, out var el))
                continue;
            if (el.ValueKind == JsonValueKind.String)
                return el.GetString();
            if (el.ValueKind is JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False)
                return el.ToString();
        }

        return null;
    }

    private static bool OptionalBool(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var el))
            return false;
        return el.ValueKind == JsonValueKind.True ||
               (el.ValueKind == JsonValueKind.String &&
                bool.TryParse(el.GetString(), out var parsed) && parsed);
    }
}
