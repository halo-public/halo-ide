using System.Text.Json;
using Microsoft.Extensions.Options;
using MiniCursor.Api.Models;
using MiniCursor.Api.Options;

namespace MiniCursor.Api.Services;

public sealed class AppSecretsService
{
    private static readonly JsonSerializerOptions SettingsJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly MiniCursorOptions _options;
    private readonly ILogger<AppSecretsService> _logger;
    private readonly string _secretsPath;
    private readonly object _gate = new();
    private SecretsRecord _secrets;

    public AppSecretsService(
        IOptions<MiniCursorOptions> options,
        IWebHostEnvironment env,
        ILogger<AppSecretsService> logger)
    {
        _options = options.Value;
        _logger = logger;

        var dataDir = _options.DataDirectory;
        var root = Path.IsPathRooted(dataDir)
            ? dataDir
            : Path.Combine(env.ContentRootPath, dataDir);
        Directory.CreateDirectory(root);
        _secretsPath = Path.Combine(root, "secrets.json");
        _secrets = LoadSecrets();
    }

    public CredentialsSettingsDto GetCredentials()
    {
        lock (_gate)
        {
            return new CredentialsSettingsDto(ResolveGitHubPat());
        }
    }

    public CredentialsSettingsDto SaveCredentials(CredentialsSettingsDto request)
    {
        lock (_gate)
        {
            _secrets = new SecretsRecord
            {
                GitHubPat = request.GitHubPat?.Trim() ?? ""
            };
            PersistSecrets();
            return new CredentialsSettingsDto(ResolveGitHubPat());
        }
    }

    public string? GetGitHubPat()
    {
        lock (_gate)
        {
            return ResolveGitHubPat();
        }
    }

    private string? ResolveGitHubPat()
    {
        if (!string.IsNullOrWhiteSpace(_secrets.GitHubPat))
            return _secrets.GitHubPat.Trim();

        if (!string.IsNullOrWhiteSpace(_options.GitHubToken))
            return _options.GitHubToken.Trim();

        return null;
    }

    private SecretsRecord LoadSecrets()
    {
        try
        {
            if (!File.Exists(_secretsPath))
                return new SecretsRecord();

            var json = File.ReadAllText(_secretsPath);
            return JsonSerializer.Deserialize<SecretsRecord>(json, SettingsJson) ?? new SecretsRecord();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not load secrets from {Path}", _secretsPath);
            return new SecretsRecord();
        }
    }

    private void PersistSecrets()
    {
        try
        {
            var json = JsonSerializer.Serialize(_secrets, SettingsJson);
            File.WriteAllText(_secretsPath, json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not persist secrets to {Path}", _secretsPath);
        }
    }

    private sealed class SecretsRecord
    {
        public string? GitHubPat { get; set; }
    }
}
