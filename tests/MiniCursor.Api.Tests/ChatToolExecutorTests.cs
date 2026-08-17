using Microsoft.Extensions.Logging.Abstractions;
using MiniCursor.Api.Services;
using Xunit;

namespace MiniCursor.Api.Tests;

public class ChatToolExecutorTests
{
    [Fact]
    public void ReplaceOnce_replaces_unique_occurrence()
    {
        var next = ChatToolExecutor.ReplaceOnce("alpha beta alpha", "beta", "GAMMA");
        Assert.Equal("alpha GAMMA alpha", next);
    }

    [Fact]
    public void ReplaceOnce_rejects_missing_and_duplicate()
    {
        Assert.Throws<InvalidOperationException>(() =>
            ChatToolExecutor.ReplaceOnce("one two", "three", "x"));
        Assert.Throws<InvalidOperationException>(() =>
            ChatToolExecutor.ReplaceOnce("one one", "one", "x"));
    }

    [Fact]
    public async Task ReadFile_rejects_path_escape()
    {
        using var fx = new ToolWorkspace();
        File.WriteAllText(Path.Combine(Path.GetDirectoryName(fx.Root)!, "outside.txt"), "secret");

        var result = await fx.Executor.ExecuteAsync("read_file", """{"path":"../outside.txt"}""");

        Assert.False(result.Ok);
        Assert.Contains("outside", result.Content, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ReadFile_truncates_large_output()
    {
        using var fx = new ToolWorkspace();
        var body = new string('a', ChatToolCatalog.MaxResultChars + 2000);
        File.WriteAllText(Path.Combine(fx.Root, "big.txt"), body);

        var result = await fx.Executor.ExecuteAsync("read_file", """{"path":"big.txt"}""");

        Assert.True(result.Ok);
        Assert.True(result.Content.Length <= ChatToolCatalog.MaxResultChars + 10);
        Assert.EndsWith("…", result.Content.TrimEnd());
    }

    [Fact]
    public async Task StrReplace_writes_unique_edit()
    {
        using var fx = new ToolWorkspace();
        File.WriteAllText(Path.Combine(fx.Root, "app.cs"), "int x = 1;\nint y = 2;\n");

        var result = await fx.Executor.ExecuteAsync("str_replace",
            """{"path":"app.cs","old_string":"int y = 2;","new_string":"int y = 3;"}""");

        Assert.True(result.Ok);
        Assert.Equal("int x = 1;\nint y = 3;\n", File.ReadAllText(Path.Combine(fx.Root, "app.cs")));
    }

    [Fact]
    public async Task RunCommand_times_out()
    {
        using var fx = new ToolWorkspace(TimeSpan.FromMilliseconds(400));
        var result = await fx.Executor.ExecuteAsync("run_command",
            OperatingSystem.IsWindows()
                ? """{"command":"ping -n 20 127.0.0.1"}"""
                : """{"command":"sleep 20"}""");

        Assert.False(result.Ok);
        Assert.Contains("timed", result.Content, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class ToolWorkspace : IDisposable
    {
        private readonly string _previous = Directory.GetCurrentDirectory();

        public string Root { get; }
        public ChatToolExecutor Executor { get; }

        public ToolWorkspace(TimeSpan? commandTimeout = null)
        {
            Root = Path.Combine(Path.GetTempPath(), "mini-cursor-tools", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Root);
            var workspace = new WorkspaceService(Root);
            var runner = commandTimeout is { } timeout
                ? new WorkspaceProcessRunner(timeout)
                : new WorkspaceProcessRunner();
            Executor = new ChatToolExecutor(workspace, runner, NullLogger<ChatToolExecutor>.Instance);
        }

        public void Dispose()
        {
            try { Directory.SetCurrentDirectory(_previous); } catch { /* ignore */ }
            try { Directory.Delete(Root, recursive: true); } catch { /* ignore */ }
        }
    }
}
