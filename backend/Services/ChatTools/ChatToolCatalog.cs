using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public static class ChatToolCatalog
{
    public const int MaxResultChars = 8000;
    public const int MaxRounds = 25;

    public static string SystemPrompt(string workspaceRoot) =>
        """
        You are a coding assistant in Mini Cursor. You can read, search, and edit the user's workspace, and run shell commands.
        Paths are workspace-relative and use forward slashes. Prefer str_replace for surgical edits and write_file to create or replace a whole file.
        Use grep to find code. Use run_command for tests, builds, and git. Be concise.
        """.Trim() + "\nWorkspace root: " + workspaceRoot;

    public static object OpenAiTools { get; } = new object[]
    {
        OpenAiFunction("read_file", "Read a text file in the workspace.",
            Props(("path", "string", "Workspace-relative path.")),
            "path"),
        OpenAiFunction("list_dir", "List files and folders in a workspace directory.",
            Props(("path", "string", "Workspace-relative directory. Omit or use . for the workspace root.")),
            []),
        OpenAiFunction("grep", "Search file contents in the workspace.",
            Props(
                ("query", "string", "Text or regular expression to find."),
                ("regex", "boolean", "If true, treat query as a regular expression."),
                ("matchCase", "boolean", "If true, match case-sensitively."),
                ("include", "string", "Optional glob of files to include, e.g. *.cs"),
                ("exclude", "string", "Optional glob of files to skip.")),
            "query"),
        OpenAiFunction("write_file", "Create or overwrite a text file in the workspace.",
            Props(
                ("path", "string", "Workspace-relative path."),
                ("content", "string", "Full file contents to write.")),
            "path", "content"),
        OpenAiFunction("str_replace", "Replace exactly one occurrence of old_string with new_string in a file.",
            Props(
                ("path", "string", "Workspace-relative path."),
                ("old_string", "string", "Exact text to find. Must occur exactly once."),
                ("new_string", "string", "Replacement text.")),
            "path", "old_string", "new_string"),
        OpenAiFunction("run_command", "Run a shell command in the workspace root. Captures stdout and stderr.",
            Props(("command", "string", "The command to run.")),
            "command")
    };

    public static object ClaudeTools { get; } = new object[]
    {
        ClaudeTool("read_file", "Read a text file in the workspace.",
            Props(("path", "string", "Workspace-relative path.")),
            "path"),
        ClaudeTool("list_dir", "List files and folders in a workspace directory.",
            Props(("path", "string", "Workspace-relative directory. Omit or use . for the workspace root.")),
            []),
        ClaudeTool("grep", "Search file contents in the workspace.",
            Props(
                ("query", "string", "Text or regular expression to find."),
                ("regex", "boolean", "If true, treat query as a regular expression."),
                ("matchCase", "boolean", "If true, match case-sensitively."),
                ("include", "string", "Optional glob of files to include, e.g. *.cs"),
                ("exclude", "string", "Optional glob of files to skip.")),
            "query"),
        ClaudeTool("write_file", "Create or overwrite a text file in the workspace.",
            Props(
                ("path", "string", "Workspace-relative path."),
                ("content", "string", "Full file contents to write.")),
            "path", "content"),
        ClaudeTool("str_replace", "Replace exactly one occurrence of old_string with new_string in a file.",
            Props(
                ("path", "string", "Workspace-relative path."),
                ("old_string", "string", "Exact text to find. Must occur exactly once."),
                ("new_string", "string", "Replacement text.")),
            "path", "old_string", "new_string"),
        ClaudeTool("run_command", "Run a shell command in the workspace root. Captures stdout and stderr.",
            Props(("command", "string", "The command to run.")),
            "command")
    };

    public static string TruncateResult(string value, int max = MaxResultChars)
    {
        if (value.Length <= max)
            return value;
        return value[..max] + "\n…";
    }

    private static object OpenAiFunction(string name, string description, object properties, params string[] required) =>
        new
        {
            type = "function",
            function = new
            {
                name,
                description,
                parameters = Schema(properties, required)
            }
        };

    private static Dictionary<string, object?> ClaudeTool(string name, string description, object properties, params string[] required) =>
        new()
        {
            ["name"] = name,
            ["description"] = description,
            ["input_schema"] = Schema(properties, required)
        };

    private static object Schema(object properties, string[] required) =>
        required.Length == 0
            ? new { type = "object", properties }
            : new { type = "object", properties, required };

    private static Dictionary<string, object> Props(params (string Name, string Type, string Description)[] fields)
    {
        var props = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var (name, type, description) in fields)
            props[name] = new { type, description };
        return props;
    }
}

public sealed record ProviderMessage(
    string Role,
    string? Content = null,
    IReadOnlyList<ProviderToolCall>? ToolCalls = null,
    string? ToolCallId = null);

public sealed record ProviderToolCall(string Id, string Name, string Arguments);

public sealed record ProviderRoundEvent(
    string Kind,
    string? Text = null,
    ChatToolCallDto? Tool = null,
    IReadOnlyList<ProviderToolCall>? CompletedToolCalls = null)
{
    public static ProviderRoundEvent Delta(string text) => new("delta", Text: text);
    public static ProviderRoundEvent ToolEvent(ChatToolCallDto call) => new("tool", Tool: call);
    public static ProviderRoundEvent Complete(IReadOnlyList<ProviderToolCall> calls) =>
        new("complete", CompletedToolCalls: calls);
}

public sealed record ChatToolResult(bool Ok, string Content);

public readonly record struct RoundApplyResult(string? TextDelta, ChatToolCallDto? ToolUpdate);
