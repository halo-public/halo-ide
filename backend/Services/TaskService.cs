using System.Diagnostics;
using System.Text;
using System.Text.Json;
using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public sealed class TaskService
{
    private readonly WorkspaceService _workspace;
    private readonly LaunchService _launch;

    public TaskService(WorkspaceService workspace, LaunchService launch)
    {
        _workspace = workspace;
        _launch = launch;
    }

    public IReadOnlyList<TaskConfigDto> GetTasks()
    {
        var tasksPath = Path.Combine(_workspace.Root, ".vscode", "tasks.json");
        if (!File.Exists(tasksPath))
            return [];

        using var stream = File.OpenRead(tasksPath);
        using var doc = JsonDocument.Parse(stream, new JsonDocumentOptions
        {
            CommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true
        });

        if (!doc.RootElement.TryGetProperty("tasks", out var tasks) ||
            tasks.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var list = new List<TaskConfigDto>();
        foreach (var item in tasks.EnumerateArray())
        {
            var label = item.TryGetProperty("label", out var l) ? l.GetString() : null;
            if (string.IsNullOrWhiteSpace(label) &&
                item.TryGetProperty("taskName", out var tn))
            {
                label = tn.GetString();
            }
            if (string.IsNullOrWhiteSpace(label)) continue;

            var type = item.TryGetProperty("type", out var t) ? t.GetString() ?? "shell" : "shell";
            var command = item.TryGetProperty("command", out var c) ? c.GetString() : null;
            var cwd = item.TryGetProperty("options", out var opts) &&
                      opts.TryGetProperty("cwd", out var cwdEl)
                ? cwdEl.GetString()
                : null;

            List<string>? args = null;
            if (item.TryGetProperty("args", out var a) && a.ValueKind == JsonValueKind.Array)
            {
                args = a.EnumerateArray()
                    .Select(x => x.GetString() ?? "")
                    .Where(x => !string.IsNullOrEmpty(x))
                    .ToList();
            }

            list.Add(new TaskConfigDto(label!, type, command, cwd, args));
        }

        return list;
    }

    public LaunchRunDto Start(string label)
    {
        var task = GetTasks()
            .FirstOrDefault(t => string.Equals(t.Label, label, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException($"Task '{label}' not found.");

        return _launch.StartShellCommand(task.Label, BuildShellCommand(task), task.Cwd);
    }

    private static string BuildShellCommand(TaskConfigDto task)
    {
        var cmd = task.Command ?? "";
        if (task.Args is { Count: > 0 })
        {
            var args = string.Join(' ', task.Args.Select(Quote));
            cmd = string.IsNullOrWhiteSpace(cmd) ? args : $"{cmd} {args}";
        }
        if (string.IsNullOrWhiteSpace(cmd))
            throw new InvalidOperationException($"Task '{task.Label}' has no command.");
        return cmd;
    }

    private static string Quote(string value) =>
        value.Contains(' ') ? $"\"{value}\"" : value;
}
