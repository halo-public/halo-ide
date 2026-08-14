using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public sealed class LaunchService
{
    private readonly WorkspaceService _workspace;
    private readonly ConcurrentDictionary<string, LaunchRun> _runs = new();

    public LaunchService(WorkspaceService workspace)
    {
        _workspace = workspace;
    }

    public IReadOnlyList<LaunchConfigDto> GetConfigurations()
    {
        var launchPath = Path.Combine(_workspace.Root, ".vscode", "launch.json");
        if (!File.Exists(launchPath))
            return [];

        using var stream = File.OpenRead(launchPath);
        using var doc = JsonDocument.Parse(stream, new JsonDocumentOptions
        {
            CommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true
        });

        if (!doc.RootElement.TryGetProperty("configurations", out var configs) ||
            configs.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var list = new List<LaunchConfigDto>();
        foreach (var item in configs.EnumerateArray())
        {
            var name = item.TryGetProperty("name", out var n) ? n.GetString() : null;
            if (string.IsNullOrWhiteSpace(name)) continue;

            var type = item.TryGetProperty("type", out var t) ? t.GetString() ?? "node" : "node";
            var request = item.TryGetProperty("request", out var r) ? r.GetString() ?? "launch" : "launch";
            var program = item.TryGetProperty("program", out var p) ? p.GetString() : null;
            var cwd = item.TryGetProperty("cwd", out var c) ? c.GetString() : null;

            List<string>? args = null;
            if (item.TryGetProperty("args", out var a) && a.ValueKind == JsonValueKind.Array)
            {
                args = a.EnumerateArray()
                    .Select(x => x.GetString() ?? "")
                    .Where(x => !string.IsNullOrEmpty(x))
                    .ToList();
            }

            Dictionary<string, string>? env = null;
            if (item.TryGetProperty("env", out var e) && e.ValueKind == JsonValueKind.Object)
            {
                env = e.EnumerateObject()
                    .ToDictionary(prop => prop.Name, prop => prop.Value.GetString() ?? "");
            }

            // Support compound "console" / "runtimeExecutable" style configs
            if (string.IsNullOrWhiteSpace(program) &&
                item.TryGetProperty("runtimeExecutable", out var re))
            {
                program = re.GetString();
            }

            list.Add(new LaunchConfigDto(name!, type, request, program, cwd, args, env));
        }

        return list;
    }

    public LaunchRunDto Start(string configName)
    {
        var config = GetConfigurations()
            .FirstOrDefault(c => string.Equals(c.Name, configName, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException($"Launch configuration '{configName}' not found.");

        var id = Guid.NewGuid().ToString("N");
        var cwd = ResolveCwd(config.Cwd);
        var (fileName, arguments) = BuildCommand(config, cwd);

        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = cwd,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        if (config.Env is not null)
        {
            foreach (var (key, value) in config.Env)
                psi.Environment[key] = ExpandVars(value, cwd);
        }

        var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        var run = new LaunchRun(id, config.Name, process);
        if (!_runs.TryAdd(id, run))
            throw new InvalidOperationException("Failed to register launch run.");

        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is not null) run.Append(e.Data + Environment.NewLine);
        };
        process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null) run.Append(e.Data + Environment.NewLine);
        };
        process.Exited += (_, _) =>
        {
            run.MarkExited(process.ExitCode);
            try { process.Dispose(); } catch { /* ignore */ }
        };

        if (!process.Start())
            throw new InvalidOperationException("Failed to start process.");

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return run.ToDto();
    }

    public LaunchRunDto StartShellCommand(string name, string command, string? cwd)
    {
        var id = Guid.NewGuid().ToString("N");
        var workingDir = ResolveCwd(cwd);
        var expanded = ExpandVars(command, workingDir);

        var psi = new ProcessStartInfo
        {
            WorkingDirectory = workingDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        if (OperatingSystem.IsWindows())
        {
            psi.FileName = "powershell.exe";
            psi.Arguments = $"-NoProfile -Command {Quote(expanded)}";
        }
        else
        {
            psi.FileName = "/bin/bash";
            psi.Arguments = $"-lc {Quote(expanded)}";
        }

        var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        var run = new LaunchRun(id, name, process);
        if (!_runs.TryAdd(id, run))
            throw new InvalidOperationException("Failed to register task run.");

        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is not null) run.Append(e.Data + Environment.NewLine);
        };
        process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null) run.Append(e.Data + Environment.NewLine);
        };
        process.Exited += (_, _) =>
        {
            run.MarkExited(process.ExitCode);
            try { process.Dispose(); } catch { /* ignore */ }
        };

        if (!process.Start())
            throw new InvalidOperationException("Failed to start task.");

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return run.ToDto();
    }

    public LaunchRunDto? GetRun(string id) =>
        _runs.TryGetValue(id, out var run) ? run.ToDto() : null;

    public string GetOutput(string id) =>
        _runs.TryGetValue(id, out var run) ? run.GetOutput() : "";

    public bool Stop(string id)
    {
        if (!_runs.TryGetValue(id, out var run))
            return false;

        try
        {
            if (!run.Process.HasExited)
                run.Process.Kill(entireProcessTree: true);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public IReadOnlyList<LaunchRunDto> ListRuns() =>
        _runs.Values.OrderByDescending(r => r.StartedAt).Select(r => r.ToDto()).ToList();

    private string ResolveCwd(string? cwd)
    {
        if (string.IsNullOrWhiteSpace(cwd) || cwd is "${workspaceFolder}")
            return _workspace.Root;

        var expanded = ExpandVars(cwd, _workspace.Root);
        return PathSafety.ResolveUnderRoot(_workspace.Root, expanded);
    }

    private (string FileName, string Arguments) BuildCommand(LaunchConfigDto config, string cwd)
    {
        var program = ExpandVars(config.Program ?? "", cwd);
        var args = (config.Args ?? []).Select(a => Quote(ExpandVars(a, cwd))).ToList();

        // node / coreclr / python heuristics for "play"
        if (string.Equals(config.Type, "node", StringComparison.OrdinalIgnoreCase))
        {
            var script = string.IsNullOrWhiteSpace(program) ? "index.js" : program;
            if (!Path.IsPathRooted(script))
                script = Path.Combine(cwd, script);
            return ("node", string.Join(' ', new[] { Quote(script) }.Concat(args)));
        }

        if (string.Equals(config.Type, "python", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(config.Type, "debugpy", StringComparison.OrdinalIgnoreCase))
        {
            var script = string.IsNullOrWhiteSpace(program) ? "main.py" : program;
            if (!Path.IsPathRooted(script))
                script = Path.Combine(cwd, script);
            return ("python", string.Join(' ', new[] { Quote(script) }.Concat(args)));
        }

        if (string.Equals(config.Type, "coreclr", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(config.Type, "dotnet", StringComparison.OrdinalIgnoreCase))
        {
            if (!string.IsNullOrWhiteSpace(program) &&
                program.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
            {
                var dll = Path.IsPathRooted(program) ? program : Path.Combine(cwd, program);
                return ("dotnet", string.Join(' ', new[] { Quote(dll) }.Concat(args)));
            }

            return ("dotnet", string.Join(' ', new[] { "run" }.Concat(args)));
        }

        // Generic: treat program as executable
        if (string.IsNullOrWhiteSpace(program))
            throw new InvalidOperationException($"Launch config '{config.Name}' has no program.");

        var exe = Path.IsPathRooted(program) ? program : Path.Combine(cwd, program);
        return (exe, string.Join(' ', args));
    }

    private string ExpandVars(string value, string cwd)
    {
        if (string.IsNullOrEmpty(value)) return value;
        return value
            .Replace("${workspaceFolder}", _workspace.Root, StringComparison.OrdinalIgnoreCase)
            .Replace("${workspaceRoot}", _workspace.Root, StringComparison.OrdinalIgnoreCase)
            .Replace("${cwd}", cwd, StringComparison.OrdinalIgnoreCase);
    }

    private static string Quote(string value) =>
        value.Contains(' ') ? $"\"{value}\"" : value;

    private sealed class LaunchRun
    {
        private readonly StringBuilder _output = new();
        private readonly object _gate = new();

        public LaunchRun(string id, string configName, Process process)
        {
            Id = id;
            ConfigName = configName;
            Process = process;
            StartedAt = DateTimeOffset.UtcNow;
            Status = "running";
        }

        public string Id { get; }
        public string ConfigName { get; }
        public Process Process { get; }
        public DateTimeOffset StartedAt { get; }
        public DateTimeOffset? EndedAt { get; private set; }
        public string Status { get; private set; }
        public int? ExitCode { get; private set; }

        public void Append(string text)
        {
            lock (_gate) _output.Append(text);
        }

        public string GetOutput()
        {
            lock (_gate) return _output.ToString();
        }

        public void MarkExited(int exitCode)
        {
            ExitCode = exitCode;
            EndedAt = DateTimeOffset.UtcNow;
            Status = exitCode == 0 ? "succeeded" : "failed";
        }

        public LaunchRunDto ToDto() =>
            new(Id, ConfigName, Status, StartedAt, EndedAt, ExitCode);
    }
}
