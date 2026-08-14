using System.Text.RegularExpressions;

namespace MiniCursor.Api.Services;

/// <summary>
/// Minimal .gitignore matcher for workspace listing/search (root .gitignore only).
/// </summary>
public sealed class GitIgnoreMatcher
{
    private readonly List<Rule> _rules = [];
    private static readonly string[] AlwaysHide =
    [
        "node_modules", ".git", "bin", "obj", ".vs", "AppData", ".cursor"
    ];

    public GitIgnoreMatcher(string workspaceRoot)
    {
        var path = Path.Combine(workspaceRoot, ".gitignore");
        if (!File.Exists(path)) return;

        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
            var negate = line.StartsWith('!');
            if (negate) line = line[1..];
            var dirOnly = line.EndsWith('/');
            if (dirOnly) line = line.TrimEnd('/');
            line = line.Replace('\\', '/').TrimStart('/');
            if (string.IsNullOrEmpty(line)) continue;
            _rules.Add(new Rule(ToRegex(line), negate, dirOnly));
        }
    }

    public bool IsIgnored(string relativePath, bool isDirectory)
    {
        var rel = relativePath.Replace('\\', '/').Trim('/');
        if (string.IsNullOrEmpty(rel)) return false;

        var segments = rel.Split('/');
        foreach (var seg in segments)
        {
            if (AlwaysHide.Contains(seg, StringComparer.OrdinalIgnoreCase))
                return true;
        }

        var ignored = false;
        foreach (var rule in _rules)
        {
            if (rule.DirOnly && !isDirectory && !rel.Contains('/'))
            {
                // dir-only rules still apply to nested paths under that dir
            }

            if (!rule.Pattern.IsMatch(rel) && !rule.Pattern.IsMatch(Path.GetFileName(rel)))
            {
                // also match any path segment prefix for patterns like "dist"
                var matched = false;
                for (var i = 0; i < segments.Length; i++)
                {
                    var prefix = string.Join('/', segments.Take(i + 1));
                    if (rule.Pattern.IsMatch(prefix) || rule.Pattern.IsMatch(segments[i]))
                    {
                        if (rule.DirOnly && i == segments.Length - 1 && !isDirectory)
                            continue;
                        matched = true;
                        break;
                    }
                }
                if (!matched) continue;
            }
            else if (rule.DirOnly && !isDirectory && segments.Length == 1)
            {
                continue;
            }

            ignored = !rule.Negate;
        }

        return ignored;
    }

    public static bool ShouldAlwaysHide(string name) =>
        AlwaysHide.Contains(name, StringComparer.OrdinalIgnoreCase);

    private static Regex ToRegex(string pattern)
    {
        var escaped = Regex.Escape(pattern)
            .Replace("\\*\\*", "§§")
            .Replace("\\*", "[^/]*")
            .Replace("\\?", "[^/]")
            .Replace("§§", ".*");
        return new Regex($"^{escaped}$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    }

    private sealed record Rule(Regex Pattern, bool Negate, bool DirOnly);
}
