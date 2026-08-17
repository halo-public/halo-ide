using MiniCursor.Api.Services;
using Xunit;

namespace MiniCursor.Api.Tests;

public class WorkspaceWatchTests
{
    [Fact]
    public void ShouldSkip_hides_git_and_chat_noise()
    {
        Assert.True(WorkspaceWatchService.ShouldSkip(".git/HEAD"));
        Assert.True(WorkspaceWatchService.ShouldSkip("node_modules/foo/index.js"));
        Assert.True(WorkspaceWatchService.ShouldSkip(".mini-cursor/chats/a.json"));
        Assert.False(WorkspaceWatchService.ShouldSkip("src/App.tsx"));
        Assert.False(WorkspaceWatchService.ShouldSkip(".mini-cursor/plugins/hello/plugin.js"));
    }
}
