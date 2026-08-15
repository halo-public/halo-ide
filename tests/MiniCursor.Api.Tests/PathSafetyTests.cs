using MiniCursor.Api.Services;
using Xunit;

namespace MiniCursor.Api.Tests;

public class PathSafetyTests
{
    [Fact]
    public void ResolveUnderRoot_allows_relative_child()
    {
        var root = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "mini-cursor-ws"));
        Directory.CreateDirectory(root);

        var resolved = PathSafety.ResolveUnderRoot(root, "src/app.cs");

        Assert.Equal(Path.GetFullPath(Path.Combine(root, "src", "app.cs")), resolved);
    }

    [Fact]
    public void ResolveUnderRoot_rejects_escape()
    {
        var root = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "mini-cursor-ws"));
        Directory.CreateDirectory(root);

        Assert.Throws<InvalidOperationException>(() =>
            PathSafety.ResolveUnderRoot(root, Path.Combine("..", "outside.txt")));
    }

    [Fact]
    public void ToRelative_uses_forward_slashes()
    {
        var root = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "mini-cursor-ws"));
        var full = Path.Combine(root, "a", "b.txt");

        Assert.Equal("a/b.txt", PathSafety.ToRelative(root, full));
    }
}
