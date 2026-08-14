using System.Collections.Concurrent;
using System.Text.Json;
using GitHub.Copilot;
using Microsoft.Extensions.Options;
using MiniCursor.Api.Models;
using MiniCursor.Api.Options;

namespace MiniCursor.Api.Services;

public sealed class CopilotService : IAsyncDisposable, IHostedService
{
    private const string DefaultModel = "gpt-5";
    private static readonly JsonSerializerOptions PrefsJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly ILogger<CopilotService> _logger;
    private readonly MiniCursorOptions _options;
    private readonly AppSecretsService _secrets;
    private readonly WorkspaceService _workspace;
    private readonly ConcurrentDictionary<string, CopilotSession> _sessions = new();
    private readonly string _prefsPath;
    private CopilotClient? _client;
    private string? _statusMessage = "Not started";
    private bool _connected;
    private bool _authenticated;
    private string _model;

    public CopilotService(
        IOptions<MiniCursorOptions> options,
        AppSecretsService secrets,
        WorkspaceService workspace,
        IWebHostEnvironment env,
        ILogger<CopilotService> logger)
    {
        _options = options.Value;
        _secrets = secrets;
        _workspace = workspace;
        _logger = logger;

        var dataDir = _options.DataDirectory;
        var root = Path.IsPathRooted(dataDir)
            ? dataDir
            : Path.Combine(env.ContentRootPath, dataDir);
        Directory.CreateDirectory(root);
        _prefsPath = Path.Combine(root, "copilot-prefs.json");

        _model = LoadPersistedModel()
            ?? (string.IsNullOrWhiteSpace(_options.CopilotModel) ? DefaultModel : _options.CopilotModel.Trim());
    }

    public string Model => _model;

    public CopilotStatusDto GetStatus() =>
        new(_connected, _authenticated, _statusMessage, "copilot", Model);

    public async Task<IReadOnlyList<CopilotModelDto>> ListModelsAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            if (_client is null || !_connected)
                return FallbackModels();

            var models = await _client.ListModelsAsync(cancellationToken);
            var list = models
                .Select(m => new CopilotModelDto(
                    m.Id ?? "",
                    string.IsNullOrWhiteSpace(m.Name) ? m.Id ?? "" : m.Name,
                    "copilot",
                    m.Policy?.State))
                .Where(m => !string.IsNullOrWhiteSpace(m.Id))
                .OrderBy(m => m.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (!string.IsNullOrWhiteSpace(_model) &&
                !list.Any(m => string.Equals(m.Id, _model, StringComparison.OrdinalIgnoreCase)))
            {
                list.Insert(0, new CopilotModelDto(_model, _model, "copilot"));
            }

            return list.Count > 0 ? list : FallbackModels();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to list Copilot models");
            return FallbackModels();
        }
    }

    private IReadOnlyList<CopilotModelDto> FallbackModels() =>
        string.IsNullOrWhiteSpace(_model)
            ? []
            : [new CopilotModelDto(_model, _model, "copilot")];

    public async Task<CopilotStatusDto> SetModelAsync(string model)
    {
        if (string.IsNullOrWhiteSpace(model))
            throw new ArgumentException("Model is required.", nameof(model));

        EnsureReady();

        var next = model.Trim();
        var models = await ListModelsAsync();
        var selected = models.FirstOrDefault(m => string.Equals(m.Id, next, StringComparison.OrdinalIgnoreCase));
        if (selected is null)
            throw new InvalidOperationException($"'{next}' is not a valid Copilot model.");

        _model = selected.Id;
        PersistModel(_model);
        _logger.LogInformation("Copilot model set to {Model}", _model);
        return GetStatus();
    }

    public async Task StartAsync(CancellationToken cancellationToken) =>
        await ConnectAsync(cancellationToken);

    public async Task<CopilotStatusDto> ReconnectAsync(CancellationToken cancellationToken = default)
    {
        await StopAsync(cancellationToken);
        await ConnectAsync(cancellationToken);
        return GetStatus();
    }

    private async Task ConnectAsync(CancellationToken cancellationToken)
    {
        try
        {
            var clientOptions = new CopilotClientOptions();
            var githubToken = _secrets.GetGitHubPat();
            if (!string.IsNullOrWhiteSpace(githubToken))
            {
                clientOptions.GitHubToken = githubToken;
            }

            var workspaceRoot = _workspace.Root;
            if (!string.IsNullOrWhiteSpace(workspaceRoot) && Directory.Exists(workspaceRoot))
            {
                clientOptions.WorkingDirectory = Path.GetFullPath(workspaceRoot);
            }

            _client = new CopilotClient(clientOptions);
            await _client.StartAsync();
            _connected = true;
            _authenticated = true;
            _statusMessage = "Connected to GitHub Copilot";
            _logger.LogInformation("Copilot client started");
        }
        catch (Exception ex)
        {
            _connected = false;
            _authenticated = false;
            _statusMessage = "Copilot is unavailable. Ensure Copilot CLI is installed and authenticated, or set a GitHub PAT in Settings.";
            _logger.LogWarning(ex, "Failed to start Copilot client");
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        foreach (var session in _sessions.Values)
        {
            try { await session.DisposeAsync(); } catch { /* ignore */ }
        }
        _sessions.Clear();

        if (_client is not null)
        {
            try { await _client.DisposeAsync(); } catch { /* ignore */ }
            _client = null;
        }

        _connected = false;
    }

    public async ValueTask DisposeAsync() => await StopAsync(CancellationToken.None);

    public async Task SetWorkingDirectoryAsync(string workspaceRoot, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(workspaceRoot))
            return;

        var full = Path.GetFullPath(workspaceRoot);
        if (!Directory.Exists(full))
            return;

        foreach (var session in _sessions.Values.ToList())
        {
            try
            {
                await session.Rpc.Metadata.SetWorkingDirectoryAsync(full, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to update working directory on session");
            }
        }
    }

    public async Task<CopilotSession> GetOrCreateSessionAsync(
        string? existingSessionId,
        string workspaceRoot,
        string? model = null)
    {
        EnsureReady();

        var full = string.IsNullOrWhiteSpace(workspaceRoot)
            ? _workspace.Root
            : Path.GetFullPath(workspaceRoot);

        if (!string.IsNullOrWhiteSpace(existingSessionId) &&
            _sessions.TryGetValue(existingSessionId, out var cached))
        {
            await TrySetSessionWorkingDirectoryAsync(cached, full);
            return cached;
        }

        if (!string.IsNullOrWhiteSpace(existingSessionId))
        {
            try
            {
                var resumed = await _client!.ResumeSessionAsync(existingSessionId, new ResumeSessionConfig
                {
                    WorkingDirectory = full,
                    OnPermissionRequest = PermissionHandler.ApproveAll
                });
                _sessions[resumed.SessionId] = resumed;
                return resumed;
            }
            catch (Exception ex)
            {
                _logger.LogInformation(ex, "Could not resume session {SessionId}; creating new", existingSessionId);
                _sessions.TryRemove(existingSessionId, out _);
            }
        }

        var sessionModel = string.IsNullOrWhiteSpace(model) ? Model : model.Trim();
        var session = await _client!.CreateSessionAsync(new SessionConfig
        {
            Model = sessionModel,
            Streaming = true,
            WorkingDirectory = full,
            OnPermissionRequest = PermissionHandler.ApproveAll
        });

        _sessions[session.SessionId] = session;
        return session;
    }

    private async Task TrySetSessionWorkingDirectoryAsync(CopilotSession session, string workspaceRoot)
    {
        try
        {
            await session.Rpc.Metadata.SetWorkingDirectoryAsync(workspaceRoot);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to set working directory on session");
        }
    }

    public async Task DeleteSessionAsync(string? sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return;

        if (_sessions.TryRemove(sessionId, out var session))
        {
            try { await session.DisposeAsync(); } catch { /* ignore */ }
        }

        if (_client is not null)
        {
            try { await _client.DeleteSessionAsync(sessionId); } catch { /* ignore */ }
        }
    }

    private string? LoadPersistedModel()
    {
        try
        {
            if (!File.Exists(_prefsPath)) return null;
            var json = File.ReadAllText(_prefsPath);
            var prefs = JsonSerializer.Deserialize<CopilotPrefs>(json, PrefsJson);
            return string.IsNullOrWhiteSpace(prefs?.Model) ? null : prefs.Model.Trim();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not load copilot prefs from {Path}", _prefsPath);
            return null;
        }
    }

    private void PersistModel(string model)
    {
        try
        {
            var json = JsonSerializer.Serialize(new CopilotPrefs { Model = model }, PrefsJson);
            File.WriteAllText(_prefsPath, json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not persist copilot model to {Path}", _prefsPath);
        }
    }

    private void EnsureReady()
    {
        if (_client is null || !_connected)
            throw new InvalidOperationException(_statusMessage ?? "Copilot is not connected.");
    }

    private sealed class CopilotPrefs
    {
        public string? Model { get; set; }
    }
}
