using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Porta.Pty;

namespace MiniCursor.Api.Services;

public sealed class TerminalService
{
    private static readonly Encoding Utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

    private readonly WorkspaceService _workspace;

    public TerminalService(WorkspaceService workspace)
    {
        _workspace = workspace;
    }

    public async Task HandleWebSocketAsync(WebSocket socket, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        using IPtyConnection pty = await SpawnShellAsync(cts.Token);

        var sendLock = new SemaphoreSlim(1, 1);
        var writeLock = new SemaphoreSlim(1, 1);

        pty.ProcessExited += (_, _) =>
        {
            try { cts.Cancel(); } catch { /* ignore */ }
        };

        async Task SendTextAsync(string text)
        {
            if (socket.State != WebSocketState.Open) return;
            var bytes = Utf8NoBom.GetBytes(text);
            await sendLock.WaitAsync(cts.Token);
            try
            {
                if (socket.State == WebSocketState.Open)
                {
                    await socket.SendAsync(bytes, WebSocketMessageType.Text, true, cts.Token);
                }
            }
            finally
            {
                sendLock.Release();
            }
        }

        var stdoutTask = PumpStreamAsync(pty.ReaderStream, SendTextAsync, cts.Token);
        var receiveTask = ReceiveAsync(socket, pty, writeLock, cts.Token);

        try
        {
            await Task.WhenAny(receiveTask, stdoutTask);
        }
        catch (OperationCanceledException)
        {
            /* expected on close */
        }
        finally
        {
            try { pty.Kill(); } catch { /* ignore */ }
            try { cts.Cancel(); } catch { /* ignore */ }

            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                try
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "closed", CancellationToken.None);
                }
                catch { /* ignore */ }
            }
        }
    }

    private async Task<IPtyConnection> SpawnShellAsync(CancellationToken ct)
    {
        string app;
        string[] args;

        if (OperatingSystem.IsWindows())
        {
            app = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
            if (!File.Exists(app))
                app = "powershell.exe";
            args = ["-NoLogo", "-NoProfile"];
        }
        else
        {
            var shell = Environment.GetEnvironmentVariable("SHELL");
            if (string.IsNullOrWhiteSpace(shell)) shell = "/bin/bash";
            app = shell;
            args = ["-i"];
        }

        var options = new PtyOptions
        {
            Name = "mini-cursor",
            Cols = 120,
            Rows = 30,
            Cwd = _workspace.Root,
            App = app,
            CommandLine = args,
            Environment = new Dictionary<string, string>
            {
                ["TERM"] = "xterm-256color",
                ["COLORTERM"] = "truecolor",
            },
        };

        return await PtyProvider.SpawnAsync(options, ct);
    }

    private static async Task PumpStreamAsync(Stream stream, Func<string, Task> send, CancellationToken ct)
    {
        var buffer = new byte[4096];
        var decoder = Utf8NoBom.GetDecoder();
        var chars = new char[4096];
        try
        {
            while (!ct.IsCancellationRequested)
            {
                var read = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), ct);
                if (read <= 0) break;

                var charCount = decoder.GetChars(buffer, 0, read, chars, 0, flush: false);
                if (charCount <= 0) continue;

                var text = new string(chars, 0, charCount).Replace("\uFEFF", "");
                if (text.Length > 0)
                    await send(text);
            }
        }
        catch (OperationCanceledException)
        {
            /* ignore */
        }
        catch (ObjectDisposedException)
        {
            /* ignore */
        }
        catch (IOException)
        {
            /* ignore */
        }
    }

    private static async Task ReceiveAsync(
        WebSocket socket,
        IPtyConnection pty,
        SemaphoreSlim writeLock,
        CancellationToken ct)
    {
        var buffer = new byte[8192];
        var sb = new StringBuilder();

        try
        {
            while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var result = await socket.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Close)
                    break;

                sb.Append(Utf8NoBom.GetString(buffer, 0, result.Count));
                if (!result.EndOfMessage) continue;

                var message = sb.ToString();
                sb.Clear();

                if (message.StartsWith('{'))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(message);
                        if (doc.RootElement.TryGetProperty("type", out var type) &&
                            type.GetString() == "resize")
                        {
                            var cols = doc.RootElement.TryGetProperty("cols", out var colsEl)
                                ? colsEl.GetInt32()
                                : 0;
                            var rows = doc.RootElement.TryGetProperty("rows", out var rowsEl)
                                ? rowsEl.GetInt32()
                                : 0;
                            if (cols > 0 && rows > 0)
                                pty.Resize(cols, rows);
                            continue;
                        }

                        if (doc.RootElement.TryGetProperty("data", out var data))
                        {
                            await WriteInputAsync(pty, data.GetString() ?? "", writeLock, ct);
                            continue;
                        }
                    }
                    catch (JsonException)
                    {
                        /* fall through as raw text */
                    }
                }

                await WriteInputAsync(pty, message, writeLock, ct);
            }
        }
        catch (OperationCanceledException)
        {
            /* ignore */
        }
        catch (WebSocketException)
        {
            /* ignore */
        }
        catch (IOException)
        {
            /* ignore */
        }
    }

    private static async Task WriteInputAsync(
        IPtyConnection pty,
        string text,
        SemaphoreSlim writeLock,
        CancellationToken ct)
    {
        if (text.Length == 0) return;
        var bytes = Utf8NoBom.GetBytes(text);
        await writeLock.WaitAsync(ct);
        try
        {
            await pty.WriterStream.WriteAsync(bytes, ct);
            await pty.WriterStream.FlushAsync(ct);
        }
        finally
        {
            writeLock.Release();
        }
    }
}
