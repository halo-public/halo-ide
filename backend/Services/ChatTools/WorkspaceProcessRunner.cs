using System.Diagnostics;
using System.Text;

namespace MiniCursor.Api.Services;

public sealed class WorkspaceProcessRunner
{
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(30);

    private readonly TimeSpan _timeout;

    public WorkspaceProcessRunner() : this(DefaultTimeout)
    {
    }

    public WorkspaceProcessRunner(TimeSpan timeout)
    {
        _timeout = timeout <= TimeSpan.Zero ? DefaultTimeout : timeout;
    }

    public async Task<ProcessRunResult> RunAsync(
        string command,
        string workingDirectory,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(command))
            return new ProcessRunResult(null, "Command is empty.", TimedOut: false);

        using var process = new Process();
        if (OperatingSystem.IsWindows())
        {
            process.StartInfo.FileName = "cmd.exe";
            process.StartInfo.Arguments = "/c " + command;
        }
        else
        {
            process.StartInfo.FileName = "/bin/sh";
            process.StartInfo.ArgumentList.Add("-c");
            process.StartInfo.ArgumentList.Add(command);
        }

        process.StartInfo.WorkingDirectory = workingDirectory;
        process.StartInfo.RedirectStandardOutput = true;
        process.StartInfo.RedirectStandardError = true;
        process.StartInfo.UseShellExecute = false;
        process.StartInfo.CreateNoWindow = true;
        process.StartInfo.StandardOutputEncoding = Encoding.UTF8;
        process.StartInfo.StandardErrorEncoding = Encoding.UTF8;

        var output = new StringBuilder();
        var gate = new object();
        void Append(string? line)
        {
            if (line is null) return;
            lock (gate)
            {
                if (output.Length > 0) output.Append('\n');
                output.Append(line);
            }
        }

        process.OutputDataReceived += (_, e) => Append(e.Data);
        process.ErrorDataReceived += (_, e) => Append(e.Data);

        try
        {
            process.Start();
        }
        catch (Exception ex)
        {
            return new ProcessRunResult(null, "Failed to start command: " + ex.Message, TimedOut: false);
        }

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(_timeout);

        try
        {
            await process.WaitForExitAsync(timeoutCts.Token);
            process.WaitForExit();
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            try { process.WaitForExit(1000); } catch { /* ignore */ }
            var dumped = Snapshot(output, gate);
            if (cancellationToken.IsCancellationRequested)
                throw;
            return new ProcessRunResult(null, AppendTimeout(dumped), TimedOut: true);
        }

        return new ProcessRunResult(process.ExitCode, Snapshot(output, gate), TimedOut: false);
    }

    private static string Snapshot(StringBuilder output, object gate)
    {
        lock (gate) return output.ToString();
    }

    private static string AppendTimeout(string dumped)
    {
        var note = "Command timed out.";
        return string.IsNullOrWhiteSpace(dumped) ? note : dumped + "\n" + note;
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
        }
        catch
        {
            /* process already gone */
        }
    }
}

public sealed record ProcessRunResult(int? ExitCode, string Output, bool TimedOut);
