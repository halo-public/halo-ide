using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public sealed class WorkspaceWatchService : IDisposable
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly WorkspaceService _workspace;
    private readonly ILogger<WorkspaceWatchService> _logger;
    private readonly ConcurrentDictionary<Guid, WebSocket> _sockets = new();
    private readonly ConcurrentDictionary<string, WorkspaceWatchEventDto> _pending = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _watcherGate = new();
    private FileSystemWatcher? _watcher;
    private Timer? _flush;
    private string _watchedRoot = "";

    public WorkspaceWatchService(WorkspaceService workspace, ILogger<WorkspaceWatchService> logger)
    {
        _workspace = workspace;
        _logger = logger;
        _workspace.RootChanged += RestartWatcher;
        RestartWatcher();
        _flush = new Timer(_ => Flush(), null, 200, 200);
    }

    public async Task HandleWebSocketAsync(WebSocket socket, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        _sockets[id] = socket;
        var buffer = new byte[16];
        try
        {
            while (!ct.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Close) break;
            }
        }
        catch (OperationCanceledException)
        {
            /* expected */
        }
        catch (WebSocketException)
        {
            /* client gone */
        }
        finally
        {
            _sockets.TryRemove(id, out _);
            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                try
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "closed", CancellationToken.None);
                }
                catch
                {
                    /* ignore */
                }
            }
        }
    }

    private void RestartWatcher()
    {
        lock (_watcherGate)
        {
            _watcher?.Dispose();
            _watcher = null;
            _watchedRoot = _workspace.Root;
            if (!Directory.Exists(_watchedRoot)) return;

            try
            {
                var watcher = new FileSystemWatcher(_watchedRoot)
                {
                    IncludeSubdirectories = true,
                    NotifyFilter = NotifyFilters.FileName
                        | NotifyFilters.DirectoryName
                        | NotifyFilters.LastWrite
                        | NotifyFilters.Size,
                    Filter = "*",
                    InternalBufferSize = 64 * 1024,
                };
                watcher.Created += (_, e) => Queue("created", e.FullPath, e.ChangeType);
                watcher.Changed += (_, e) => Queue("changed", e.FullPath, e.ChangeType);
                watcher.Deleted += (_, e) => Queue("deleted", e.FullPath, e.ChangeType);
                watcher.Renamed += (_, e) => QueueRenamed(e);
                watcher.Error += (_, e) => _logger.LogWarning(e.GetException(), "Workspace watcher error");
                watcher.EnableRaisingEvents = true;
                _watcher = watcher;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not watch {Root}", _watchedRoot);
            }
        }
    }

    private void QueueRenamed(RenamedEventArgs e)
    {
        var oldRel = ToRelative(e.OldFullPath);
        var rel = ToRelative(e.FullPath);
        if (rel is null && oldRel is null) return;
        var path = rel ?? oldRel!;
        if (ShouldSkip(path) || _workspace.IsRecentSelfWrite(path)) return;
        if (oldRel is not null) _workspace.IsRecentSelfWrite(oldRel);
        var isDir = Directory.Exists(e.FullPath);
        _pending[path] = new WorkspaceWatchEventDto("renamed", path, isDir, oldRel);
    }

    private void Queue(string type, string fullPath, WatcherChangeTypes change)
    {
        var rel = ToRelative(fullPath);
        if (rel is null) return;
        if (ShouldSkip(rel) || _workspace.IsRecentSelfWrite(rel)) return;
        var isDir = type != "deleted" && Directory.Exists(fullPath);
        _pending[rel] = new WorkspaceWatchEventDto(type, rel, isDir, null);
    }

    private string? ToRelative(string fullPath)
    {
        var root = _watchedRoot;
        if (string.IsNullOrEmpty(root)) return null;
        var full = Path.GetFullPath(fullPath);
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return null;
        var rel = Path.GetRelativePath(root, full);
        if (rel == "." || rel.StartsWith("..", StringComparison.Ordinal)) return "";
        return rel.Replace('\\', '/');
    }

    public static bool ShouldSkip(string relativePath)
    {
        var rel = relativePath.Replace('\\', '/');
        if (string.IsNullOrEmpty(rel)) return true;
        var first = rel.Split('/')[0];
        if (first is ".git" or "node_modules" or "bin" or "obj") return true;
        if (rel.StartsWith(".mini-cursor/chats/", StringComparison.OrdinalIgnoreCase)
            || string.Equals(rel, ".mini-cursor/chats", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        return false;
    }

    private void Flush()
    {
        if (_pending.IsEmpty || _sockets.IsEmpty) return;
        var batch = _pending.Values.ToArray();
        _pending.Clear();
        var payload = JsonSerializer.Serialize(batch, Json);
        var bytes = Encoding.UTF8.GetBytes(payload);
        foreach (var (id, socket) in _sockets)
        {
            if (socket.State != WebSocketState.Open)
            {
                _sockets.TryRemove(id, out _);
                continue;
            }

            _ = SendAsync(socket, bytes);
        }
    }

    private static async Task SendAsync(WebSocket socket, byte[] bytes)
    {
        try
        {
            await socket.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
        }
        catch
        {
            /* drop */
        }
    }

    public void Dispose()
    {
        _workspace.RootChanged -= RestartWatcher;
        _flush?.Dispose();
        lock (_watcherGate)
        {
            _watcher?.Dispose();
            _watcher = null;
        }
    }
}
