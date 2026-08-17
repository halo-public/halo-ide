using MiniCursor.Api.Services;
using Xunit;

namespace MiniCursor.Api.Tests;

public class PluginCatalogTests
{
    [Fact]
    public void List_reads_valid_plugin_and_skips_invalid()
    {
        var root = CreateWorkspace();
        var plugins = Path.Combine(root, ".mini-cursor", "plugins");
        WritePlugin(plugins, "hello", """{ "name": "Hello", "version": "1.2.3", "main": "plugin.js" }""", "function activate(api) {}");
        Directory.CreateDirectory(Path.Combine(plugins, "no-manifest"));
        WritePlugin(plugins, "bad id", """{ "name": "Nope" }""", "function activate(api) {}");

        var list = PluginCatalog.List(root);

        var hello = Assert.Single(list);
        Assert.Equal("hello", hello.Id);
        Assert.Equal("Hello", hello.Name);
        Assert.Equal("1.2.3", hello.Version);
        Assert.Equal("plugin.js", hello.Main);
        Assert.Equal(".mini-cursor/plugins/hello", hello.Path);
    }

    [Fact]
    public void Read_returns_source()
    {
        var root = CreateWorkspace();
        var plugins = Path.Combine(root, ".mini-cursor", "plugins");
        WritePlugin(plugins, "hello", """{ "name": "Hello" }""", "function activate(api) { api.log('hi') }");

        var source = PluginCatalog.Read(root, "hello");

        Assert.Equal("hello", source.Id);
        Assert.Equal("Hello", source.Name);
        Assert.Contains("activate", source.Source);
    }

    [Fact]
    public void Read_rejects_invalid_id()
    {
        var root = CreateWorkspace();
        Assert.Throws<InvalidOperationException>(() => PluginCatalog.Read(root, "../secret"));
    }

    [Fact]
    public void List_skips_plugin_whose_main_escapes_folder()
    {
        var root = CreateWorkspace();
        var plugins = Path.Combine(root, ".mini-cursor", "plugins");
        WritePlugin(plugins, "escape", """{ "name": "Escape", "main": "../outside.js" }""", "function activate(api) {}");

        var list = PluginCatalog.List(root);

        Assert.Empty(list);
    }

    private static string CreateWorkspace()
    {
        var root = Path.Combine(Path.GetTempPath(), "mini-cursor-plugins", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    private static void WritePlugin(string pluginsRoot, string id, string manifest, string source)
    {
        var dir = Path.Combine(pluginsRoot, id);
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "plugin.json"), manifest);
        File.WriteAllText(Path.Combine(dir, "plugin.js"), source);
    }
}
