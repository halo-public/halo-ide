using Microsoft.Extensions.Options;
using MiniCursor.Api.Models;
using MiniCursor.Api.Options;

namespace MiniCursor.Api.Services;

public sealed class WorkspaceService
{
    public const string MiniIdeFolderName = ".mini-cursor";
    public const string ChatsFolderName = "chats";
    private readonly object _gate = new();
    private string _root;
    private GitIgnoreMatcher _ignore;

    public WorkspaceService(IOptions<MiniCursorOptions> options, IWebHostEnvironment env)
    {
        var configured = options.Value.WorkspaceRoot;
        if (string.IsNullOrWhiteSpace(configured))
        {
            var sample = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "sample-workspace"));
            _root = Directory.Exists(sample)
                ? sample
                : Path.GetFullPath(Path.Combine(env.ContentRootPath, ".."));
        }
        else
        {
            _root = Path.GetFullPath(configured);
        }

        Directory.SetCurrentDirectory(_root);
        _ignore = new GitIgnoreMatcher(_root);
    }

    public string Root
    {
        get { lock (_gate) return _root; }
    }

    private GitIgnoreMatcher Ignore
    {
        get { lock (_gate) return _ignore; }
    }

    public WorkspaceInfoDto GetInfo()
    {
        var root = Root;
        return new WorkspaceInfoDto(root, Path.GetFileName(root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)));
    }

    public WorkspaceChatInfoDto GetChatInfo()
    {
        var root = Root;
        var chatsPath = Path.Combine(root, MiniIdeFolderName, ChatsFolderName);
        return new WorkspaceChatInfoDto(root, chatsPath);
    }

    public WorkspaceInfoDto SetRoot(string root)
    {
        if (string.IsNullOrWhiteSpace(root))
            throw new ArgumentException("Workspace root is required.", nameof(root));

        var full = Path.GetFullPath(root);
        if (!Directory.Exists(full))
            throw new DirectoryNotFoundException($"Workspace root does not exist: {full}");

        lock (_gate)
        {
            _root = full;
            Directory.SetCurrentDirectory(full);
            _ignore = new GitIgnoreMatcher(full);
        }

        return GetInfo();
    }

    public IReadOnlyList<FileNodeDto> List(string? path, bool respectGitignore = true)
    {
        var dir = PathSafety.ResolveUnderRoot(Root, path);
        if (!Directory.Exists(dir))
            throw new DirectoryNotFoundException($"Directory not found: {path}");

        var ignore = Ignore;
        var nodes = new List<FileNodeDto>();

        foreach (var directory in Directory.EnumerateDirectories(dir))
        {
            var name = Path.GetFileName(directory);
            var rel = PathSafety.ToRelative(Root, directory);
            if (GitIgnoreMatcher.ShouldAlwaysHide(name)) continue;
            if (respectGitignore && ignore.IsIgnored(rel, true)) continue;
            nodes.Add(new FileNodeDto(
                name,
                rel,
                true,
                null,
                Directory.GetLastWriteTimeUtc(directory)));
        }

        foreach (var file in Directory.EnumerateFiles(dir))
        {
            var name = Path.GetFileName(file);
            var rel = PathSafety.ToRelative(Root, file);
            if (GitIgnoreMatcher.ShouldAlwaysHide(name)) continue;
            if (respectGitignore && ignore.IsIgnored(rel, false)) continue;
            var info = new FileInfo(file);
            nodes.Add(new FileNodeDto(
                name,
                rel,
                false,
                info.Length,
                info.LastWriteTimeUtc));
        }

        return nodes
            .OrderByDescending(n => n.IsDirectory)
            .ThenBy(n => n.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public IReadOnlyList<string> ListTree(bool respectGitignore = true, int maxFiles = 5000)
    {
        var results = new List<string>();
        WalkFiles(Root, respectGitignore, maxFiles, results);
        return results;
    }

    public IReadOnlyList<SearchMatchDto> Search(string query, bool respectGitignore = true, int maxMatches = 200)
    {
        if (string.IsNullOrWhiteSpace(query))
            return [];

        var matches = new List<SearchMatchDto>();
        var files = new List<string>();
        WalkFiles(Root, respectGitignore, 5000, files);

        foreach (var rel in files)
        {
            if (matches.Count >= maxMatches) break;
            var full = PathSafety.ResolveUnderRoot(Root, rel);
            if (!IsTextFile(full)) continue;

            string[] lines;
            try
            {
                lines = File.ReadAllLines(full);
            }
            catch
            {
                continue;
            }

            for (var i = 0; i < lines.Length; i++)
            {
                if (matches.Count >= maxMatches) break;
                var line = lines[i];
                var idx = line.IndexOf(query, StringComparison.OrdinalIgnoreCase);
                if (idx < 0) continue;
                var preview = line.Length > 200 ? line[..200] : line;
                matches.Add(new SearchMatchDto(rel, i + 1, idx, preview.TrimEnd()));
            }
        }

        return matches;
    }

    public FileContentDto ReadFile(string path)
    {
        var full = PathSafety.ResolveUnderRoot(Root, path);
        if (!File.Exists(full))
            throw new FileNotFoundException("File not found.", path);

        var content = File.ReadAllText(full);
        return new FileContentDto(PathSafety.ToRelative(Root, full), content, DetectLanguage(full));
    }

    public FileContentDto WriteFile(string path, string content)
    {
        var full = PathSafety.ResolveUnderRoot(Root, path);
        var parent = Path.GetDirectoryName(full);
        if (!string.IsNullOrEmpty(parent))
            Directory.CreateDirectory(parent);

        File.WriteAllText(full, content ?? "");
        return new FileContentDto(PathSafety.ToRelative(Root, full), content ?? "", DetectLanguage(full));
    }

    public FileNodeDto Create(string path, bool isDirectory)
    {
        var full = PathSafety.ResolveUnderRoot(Root, path);
        if (File.Exists(full) || Directory.Exists(full))
            throw new InvalidOperationException($"Path already exists: {path}");

        if (isDirectory)
        {
            Directory.CreateDirectory(full);
        }
        else
        {
            var parent = Path.GetDirectoryName(full);
            if (!string.IsNullOrEmpty(parent))
                Directory.CreateDirectory(parent);
            File.WriteAllText(full, "");
        }

        var rel = PathSafety.ToRelative(Root, full);
        return new FileNodeDto(
            Path.GetFileName(full),
            rel,
            isDirectory,
            isDirectory ? null : 0,
            DateTimeOffset.UtcNow);
    }

    public FileNodeDto Rename(string path, string newPath)
    {
        var full = PathSafety.ResolveUnderRoot(Root, path);
        var dest = PathSafety.ResolveUnderRoot(Root, newPath);
        if (full.Equals(dest, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Source and destination are the same.");

        if (File.Exists(dest) || Directory.Exists(dest))
            throw new InvalidOperationException($"Destination already exists: {newPath}");

        var destParent = Path.GetDirectoryName(dest);
        if (!string.IsNullOrEmpty(destParent))
            Directory.CreateDirectory(destParent);

        if (Directory.Exists(full))
        {
            Directory.Move(full, dest);
            return new FileNodeDto(Path.GetFileName(dest), PathSafety.ToRelative(Root, dest), true, null, DateTimeOffset.UtcNow);
        }

        if (File.Exists(full))
        {
            File.Move(full, dest);
            var info = new FileInfo(dest);
            return new FileNodeDto(Path.GetFileName(dest), PathSafety.ToRelative(Root, dest), false, info.Length, info.LastWriteTimeUtc);
        }

        throw new FileNotFoundException("Path not found.", path);
    }

    public FileNodeDto Copy(string path, string newPath)
    {
        var full = PathSafety.ResolveUnderRoot(Root, path);
        var dest = PathSafety.ResolveUnderRoot(Root, newPath);
        if (full.Equals(dest, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Source and destination are the same.");

        if (File.Exists(dest) || Directory.Exists(dest))
            throw new InvalidOperationException($"Destination already exists: {newPath}");

        var destParent = Path.GetDirectoryName(dest);
        if (!string.IsNullOrEmpty(destParent))
            Directory.CreateDirectory(destParent);

        if (Directory.Exists(full))
        {
            CopyDirectory(full, dest);
            return new FileNodeDto(Path.GetFileName(dest), PathSafety.ToRelative(Root, dest), true, null, DateTimeOffset.UtcNow);
        }

        if (File.Exists(full))
        {
            File.Copy(full, dest);
            var info = new FileInfo(dest);
            return new FileNodeDto(Path.GetFileName(dest), PathSafety.ToRelative(Root, dest), false, info.Length, info.LastWriteTimeUtc);
        }

        throw new FileNotFoundException("Path not found.", path);
    }

    public void Delete(string path)
    {
        var full = PathSafety.ResolveUnderRoot(Root, path);
        if (full.Equals(Root, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Cannot delete the workspace root.");

        if (Directory.Exists(full))
        {
            Directory.Delete(full, recursive: true);
            return;
        }

        if (File.Exists(full))
        {
            File.Delete(full);
            return;
        }

        throw new FileNotFoundException("Path not found.", path);
    }

    public string ResolvePath(string path) => PathSafety.ResolveUnderRoot(Root, path);

    private void WalkFiles(string dir, bool respectGitignore, int maxFiles, List<string> results)
    {
        if (results.Count >= maxFiles) return;
        var ignore = Ignore;
        var root = Root;

        IEnumerable<string> dirs;
        IEnumerable<string> files;
        try
        {
            dirs = Directory.EnumerateDirectories(dir);
            files = Directory.EnumerateFiles(dir);
        }
        catch
        {
            return;
        }

        foreach (var file in files)
        {
            if (results.Count >= maxFiles) return;
            var name = Path.GetFileName(file);
            var rel = PathSafety.ToRelative(root, file);
            if (GitIgnoreMatcher.ShouldAlwaysHide(name)) continue;
            if (respectGitignore && ignore.IsIgnored(rel, false)) continue;
            results.Add(rel);
        }

        foreach (var child in dirs)
        {
            if (results.Count >= maxFiles) return;
            var name = Path.GetFileName(child);
            var rel = PathSafety.ToRelative(root, child);
            if (GitIgnoreMatcher.ShouldAlwaysHide(name)) continue;
            if (respectGitignore && ignore.IsIgnored(rel, true)) continue;
            WalkFiles(child, respectGitignore, maxFiles, results);
        }
    }

    private static void CopyDirectory(string source, string dest)
    {
        Directory.CreateDirectory(dest);
        foreach (var file in Directory.EnumerateFiles(source))
            File.Copy(file, Path.Combine(dest, Path.GetFileName(file)), overwrite: false);
        foreach (var dir in Directory.EnumerateDirectories(source))
            CopyDirectory(dir, Path.Combine(dest, Path.GetFileName(dir)));
    }

    private static bool IsTextFile(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (ext is ".png" or ".jpg" or ".jpeg" or ".gif" or ".webp" or ".ico" or ".bmp"
            or ".exe" or ".dll" or ".pdb" or ".zip" or ".gz" or ".7z" or ".rar"
            or ".woff" or ".woff2" or ".ttf" or ".eot" or ".pdf" or ".mp3" or ".mp4")
            return false;

        try
        {
            var info = new FileInfo(path);
            if (info.Length > 2_000_000) return false;
            Span<byte> buffer = stackalloc byte[512];
            using var fs = File.OpenRead(path);
            var read = fs.Read(buffer);
            for (var i = 0; i < read; i++)
            {
                if (buffer[i] == 0) return false;
            }
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static string DetectLanguage(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".cs" => "csharp",
        ".ts" or ".tsx" => "typescript",
        ".js" or ".jsx" => "javascript",
        ".json" => "json",
        ".md" => "markdown",
        ".css" => "css",
        ".html" or ".htm" => "html",
        ".py" => "python",
        ".yml" or ".yaml" => "yaml",
        ".xml" => "xml",
        ".sh" => "shell",
        ".ps1" => "powershell",
        ".sql" => "sql",
        ".go" => "go",
        ".rs" => "rust",
        ".java" => "java",
        ".kt" => "kotlin",
        ".rb" => "ruby",
        ".php" => "php",
        ".scss" => "scss",
        ".less" => "less",
        ".toml" => "ini",
        ".ini" => "ini",
        ".txt" => "plaintext",
        _ => "plaintext"
    };
}
