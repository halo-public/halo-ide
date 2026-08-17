using System.Text.Json;
using System.Text.RegularExpressions;
using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public static class PluginCatalog
{
    public const string PluginsFolderName = "plugins";
    public const int MaxSourceBytes = 256 * 1024;
    private static readonly Regex IdPattern = new("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$", RegexOptions.Compiled);

    private static readonly JsonDocumentOptions JsonOptions = new()
    {
        CommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    public static string PluginsRoot(string workspaceRoot) =>
        Path.Combine(workspaceRoot, WorkspaceService.MiniIdeFolderName, PluginsFolderName);

    public static bool IsValidId(string? id) =>
        !string.IsNullOrWhiteSpace(id) && IdPattern.IsMatch(id);

    public static IReadOnlyList<PluginInfoDto> List(string workspaceRoot)
    {
        var root = PluginsRoot(workspaceRoot);
        if (!Directory.Exists(root)) return [];

        var list = new List<PluginInfoDto>();
        foreach (var dir in Directory.EnumerateDirectories(root))
        {
            var id = Path.GetFileName(dir);
            if (!IsValidId(id)) continue;
            var manifestPath = Path.Combine(dir, "plugin.json");
            if (!File.Exists(manifestPath)) continue;

            try
            {
                list.Add(ReadManifest(workspaceRoot, id, dir, manifestPath));
            }
            catch
            {
                // Skip broken manifests so one bad plugin does not hide the rest.
            }
        }

        return list
            .OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static PluginSourceDto Read(string workspaceRoot, string id)
    {
        if (!IsValidId(id))
            throw new InvalidOperationException("Invalid plugin id.");

        var pluginsRoot = PluginsRoot(workspaceRoot);
        var pluginDir = PathSafety.ResolveUnderRoot(pluginsRoot, id);
        var manifestPath = Path.Combine(pluginDir, "plugin.json");
        if (!File.Exists(manifestPath))
            throw new FileNotFoundException("Plugin not found.", id);

        var info = ReadManifest(workspaceRoot, id, pluginDir, manifestPath);
        var mainFull = PathSafety.ResolveUnderRoot(pluginDir, info.Main);
        if (!File.Exists(mainFull))
            throw new FileNotFoundException("Plugin main file not found.", info.Main);

        var length = new FileInfo(mainFull).Length;
        if (length > MaxSourceBytes)
            throw new InvalidOperationException("Plugin source is too large.");

        var source = File.ReadAllText(mainFull);
        return new PluginSourceDto(info.Id, info.Name, info.Version, info.Main, source);
    }

    private static PluginInfoDto ReadManifest(string workspaceRoot, string id, string pluginDir, string manifestPath)
    {
        using var stream = File.OpenRead(manifestPath);
        using var doc = JsonDocument.Parse(stream, JsonOptions);
        var root = doc.RootElement;

        var name = root.TryGetProperty("name", out var n) ? n.GetString() : null;
        var version = root.TryGetProperty("version", out var v) ? v.GetString() : null;
        var main = root.TryGetProperty("main", out var m) ? m.GetString() : null;

        if (string.IsNullOrWhiteSpace(name)) name = id;
        if (string.IsNullOrWhiteSpace(version)) version = "0.0.0";
        if (string.IsNullOrWhiteSpace(main)) main = "plugin.js";

        PathSafety.ResolveUnderRoot(pluginDir, main);

        var rel = PathSafety.ToRelative(workspaceRoot, pluginDir);
        return new PluginInfoDto(id, name, version, main, rel);
    }
}

public sealed class PluginService
{
    private readonly WorkspaceService _workspace;

    public PluginService(WorkspaceService workspace)
    {
        _workspace = workspace;
    }

    public IReadOnlyList<PluginInfoDto> List() => PluginCatalog.List(_workspace.Root);

    public PluginSourceDto Read(string id) => PluginCatalog.Read(_workspace.Root, id);
}
