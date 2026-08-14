using System.Diagnostics;
using System.Text;
using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public sealed class GitService
{
    private static readonly HashSet<string> SupportedOperations = new(StringComparer.OrdinalIgnoreCase)
    {
        "fetch",
        "pull",
        "push",
        "stage",
        "unstage",
        "discard",
        "commit"
    };

    private static readonly HashSet<string> RemoteAuthOperations = new(StringComparer.OrdinalIgnoreCase)
    {
        "fetch",
        "pull",
        "push"
    };

    private readonly WorkspaceService _workspace;
    private readonly LaunchService _launch;
    private readonly AppSecretsService _secrets;

    public GitService(WorkspaceService workspace, LaunchService launch, AppSecretsService secrets)
    {
        _workspace = workspace;
        _launch = launch;
        _secrets = secrets;
    }

    public GitSidebarDto GetSidebar()
    {
        var status = GetStatus();
        var branches = GetBranches(status.Branch);
        return new GitSidebarDto(status, branches);
    }

    public GitStatusDto GetStatus()
    {
        EnsureGitRepository();

        var porcelain = RunGit("status --porcelain=2 --branch");
        var files = new List<GitStatusFileDto>();
        string branch = "(unknown)";
        string? upstream = null;
        var isDetached = false;
        var aheadBy = 0;
        var behindBy = 0;

        foreach (var rawLine in porcelain.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            if (rawLine.StartsWith("# branch.head ", StringComparison.Ordinal))
            {
                var head = rawLine["# branch.head ".Length..].Trim();
                if (string.Equals(head, "(detached)", StringComparison.Ordinal))
                {
                    isDetached = true;
                    branch = "HEAD";
                }
                else
                {
                    branch = head;
                }
                continue;
            }

            if (rawLine.StartsWith("# branch.upstream ", StringComparison.Ordinal))
            {
                upstream = rawLine["# branch.upstream ".Length..].Trim();
                continue;
            }

            if (rawLine.StartsWith("# branch.ab ", StringComparison.Ordinal))
            {
                var parts = rawLine["# branch.ab ".Length..].Split(' ', StringSplitOptions.RemoveEmptyEntries);
                foreach (var part in parts)
                {
                    if (part.StartsWith("+", StringComparison.Ordinal) &&
                        int.TryParse(part[1..], out var ahead))
                    {
                        aheadBy = ahead;
                    }
                    else if (part.StartsWith("-", StringComparison.Ordinal) &&
                             int.TryParse(part[1..], out var behind))
                    {
                        behindBy = behind;
                    }
                }
                continue;
            }

            if (rawLine.StartsWith("1 ", StringComparison.Ordinal) || rawLine.StartsWith("2 ", StringComparison.Ordinal))
            {
                var parts = rawLine.Split(' ', 9, StringSplitOptions.None);
                if (parts.Length < 9) continue;
                var xy = parts[1];
                var path = parts[8];
                if (rawLine.StartsWith("2 ", StringComparison.Ordinal))
                {
                    var renameParts = path.Split('\t', 2, StringSplitOptions.None);
                    path = renameParts.Length == 2 ? renameParts[1] : path;
                }
                files.Add(new GitStatusFileDto(path, DecodeStatus(xy[0]), DecodeStatus(xy[1])));
                continue;
            }

            if (rawLine.StartsWith("? ", StringComparison.Ordinal))
            {
                files.Add(new GitStatusFileDto(rawLine[2..], "untracked", "untracked"));
            }
        }

        return new GitStatusDto(
            branch,
            upstream,
            isDetached,
            files.Any(f => !IsUnchanged(f.StagedStatus) || !IsUnchanged(f.WorktreeStatus)),
            files.Any(f => string.Equals(f.WorktreeStatus, "untracked", StringComparison.Ordinal)),
            aheadBy,
            behindBy,
            files);
    }

    public LaunchRunDto StartOperation(GitOperationRequest request)
    {
        EnsureGitRepository();

        if (request is null)
            throw new InvalidOperationException("A Git operation is required.");

        if (string.Equals(request.Operation, "checkout", StringComparison.OrdinalIgnoreCase))
        {
            var target = request.Argument?.Trim();
            if (string.IsNullOrWhiteSpace(target))
                throw new InvalidOperationException("A branch name is required.");

            return _launch.StartShellCommand($"git checkout {target}", BuildGitCommand("checkout", [target]), _workspace.Root);
        }

        if (string.Equals(request.Operation, "commit", StringComparison.OrdinalIgnoreCase))
        {
            var message = request.Argument?.Trim();
            if (string.IsNullOrWhiteSpace(message))
                throw new InvalidOperationException("A commit message is required.");

            return _launch.StartShellCommand("git commit", BuildGitCommand("commit", ["-m", message]), _workspace.Root);
        }

        if (string.Equals(request.Operation, "stage", StringComparison.OrdinalIgnoreCase))
        {
            var paths = NormalizePaths(request.Paths);
            return _launch.StartShellCommand("git add", BuildGitCommand("add", ["--", .. paths]), _workspace.Root);
        }

        if (string.Equals(request.Operation, "unstage", StringComparison.OrdinalIgnoreCase))
        {
            var paths = NormalizePaths(request.Paths);
            return _launch.StartShellCommand("git restore --staged", BuildGitCommand("restore", ["--staged", "--", .. paths]), _workspace.Root);
        }

        if (string.Equals(request.Operation, "discard", StringComparison.OrdinalIgnoreCase))
        {
            var paths = NormalizePaths(request.Paths);
            return _launch.StartShellCommand("git restore", BuildGitCommand("restore", ["--worktree", "--", .. paths]), _workspace.Root);
        }

        if (!SupportedOperations.Contains(request.Operation))
            throw new InvalidOperationException($"Unsupported git operation '{request.Operation}'.");

        var authArgs = RemoteAuthOperations.Contains(request.Operation) ? GetAuthConfigArgs() : null;
        return _launch.StartShellCommand(
            $"git {request.Operation}",
            BuildGitCommand(request.Operation, prefixArgs: authArgs),
            _workspace.Root);
    }

    private IReadOnlyList<string>? GetAuthConfigArgs()
    {
        var pat = _secrets.GetGitHubPat();
        if (string.IsNullOrWhiteSpace(pat))
            return null;

        var encoded = Convert.ToBase64String(Encoding.ASCII.GetBytes($"x-access-token:{pat.Trim()}"));
        return ["-c", $"http.extraHeader=AUTHORIZATION: basic {encoded}"];
    }

    private void EnsureGitRepository()
    {
        var output = RunGit("rev-parse --is-inside-work-tree");
        if (!string.Equals(output.Trim(), "true", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Workspace is not a Git repository.");
    }

    private string RunGit(string arguments)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "git",
            Arguments = arguments,
            WorkingDirectory = _workspace.Root,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start git.");
        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            var message = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
            throw new InvalidOperationException(message.Trim());
        }

        return stdout;
    }

    private IReadOnlyList<GitRefDto> GetBranches(string currentBranch)
    {
        var output = RunGit("for-each-ref --format=\"%(refname:short)|%(refname)\" refs/heads refs/remotes");
        var result = new List<GitRefDto>();
        foreach (var line in output.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = line.Split('|', 2, StringSplitOptions.None);
            if (parts.Length != 2) continue;
            var name = parts[0].Trim();
            var fullRef = parts[1].Trim();
            if (string.IsNullOrWhiteSpace(name) || string.Equals(name, "origin/HEAD", StringComparison.OrdinalIgnoreCase))
                continue;

            var isRemote = fullRef.StartsWith("refs/remotes/", StringComparison.Ordinal);
            result.Add(new GitRefDto(name, !isRemote && string.Equals(name, currentBranch, StringComparison.Ordinal), isRemote));
        }

        return result
            .OrderBy(b => b.IsRemote)
            .ThenByDescending(b => b.IsCurrent)
            .ThenBy(b => b.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static IReadOnlyList<string> NormalizePaths(IReadOnlyList<string>? paths)
    {
        var normalized = (paths ?? [])
            .Select(p => p?.Trim())
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (normalized.Count == 0)
            throw new InvalidOperationException("At least one file path is required.");

        return normalized!;
    }

    private static string BuildGitCommand(
        string operation,
        IReadOnlyList<string>? args = null,
        IReadOnlyList<string>? prefixArgs = null)
    {
        var parts = new List<string> { "git" };
        if (prefixArgs is not null)
            parts.AddRange(prefixArgs.Select(QuoteArgument));
        parts.Add(operation);
        if (args is not null)
            parts.AddRange(args.Select(QuoteArgument));
        return string.Join(' ', parts);
    }

    private static string QuoteArgument(string value)
    {
        if (string.IsNullOrEmpty(value))
            return "\"\"";

        return "\"" + value.Replace("\"", "\\\"", StringComparison.Ordinal) + "\"";
    }

    private static bool IsUnchanged(string status) => string.Equals(status, "unmodified", StringComparison.Ordinal);

    private static string DecodeStatus(char code) => code switch
    {
        '.' => "unmodified",
        'M' => "modified",
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        'U' => "updated",
        '?' => "untracked",
        _ => code.ToString()
    };
}
