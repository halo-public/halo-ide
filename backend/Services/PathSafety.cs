namespace MiniCursor.Api.Services;

public static class PathSafety
{
    public static string ResolveUnderRoot(string root, string? relativeOrAbsolute)
    {
        var rootFull = Path.GetFullPath(root);
        if (string.IsNullOrWhiteSpace(relativeOrAbsolute) || relativeOrAbsolute is "." or "/" or "\\")
            return rootFull;

        var candidate = Path.IsPathRooted(relativeOrAbsolute)
            ? Path.GetFullPath(relativeOrAbsolute)
            : Path.GetFullPath(Path.Combine(rootFull, relativeOrAbsolute));

        var rootWithSep = rootFull.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                          + Path.DirectorySeparatorChar;

        if (!candidate.Equals(rootFull, StringComparison.OrdinalIgnoreCase) &&
            !candidate.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Path is outside the workspace root.");
        }

        return candidate;
    }

    public static string ToRelative(string root, string fullPath)
    {
        var rootFull = Path.GetFullPath(root);
        var full = Path.GetFullPath(fullPath);
        var relative = Path.GetRelativePath(rootFull, full);
        return relative.Replace('\\', '/');
    }
}
