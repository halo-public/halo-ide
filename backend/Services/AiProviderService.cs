using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MiniCursor.Api.Models;
using MiniCursor.Api.Options;

namespace MiniCursor.Api.Services;

public sealed class AiProviderService
{
    private const string CopilotProvider = "copilot";
    private const string OpenAiProvider = "openai";
    private const string ClaudeProvider = "claude";
    private const string OllamaProvider = "ollama";

    private static readonly JsonSerializerOptions SettingsJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private static readonly ProviderOptionDto[] ProviderOptions =
    [
        new(CopilotProvider, "Copilot"),
        new(OpenAiProvider, "OpenAI", RequiresApiKey: true),
        new(ClaudeProvider, "Claude", RequiresApiKey: true),
        new(OllamaProvider, "Ollama", RequiresApiKey: false)
    ];

    private static readonly string[] OpenAiModels =
    [
        "gpt-5.4",
        "gpt-5",
        "gpt-5-mini",
        "gpt-5.4-mini",
        "gpt-4.1",
        "gpt-4o"
    ];

    private static readonly string[] ClaudeModels =
    [
        "claude-sonnet-5",
        "claude-sonnet-4.6",
        "claude-sonnet-4.5",
        "claude-haiku-4.5"
    ];

    private readonly MiniCursorOptions _options;
    private readonly CopilotService _copilot;
    private readonly ILogger<AiProviderService> _logger;
    private readonly string _settingsPath;
    private readonly HttpClient _httpClient = new();
    private AiSettingsRecord _settings;

    public AiProviderService(
        IOptions<MiniCursorOptions> options,
        IWebHostEnvironment env,
        CopilotService copilot,
        ILogger<AiProviderService> logger)
    {
        _options = options.Value;
        _copilot = copilot;
        _logger = logger;

        var dataDir = _options.DataDirectory;
        var root = Path.IsPathRooted(dataDir)
            ? dataDir
            : Path.Combine(env.ContentRootPath, dataDir);
        Directory.CreateDirectory(root);
        _settingsPath = Path.Combine(root, "ai-settings.json");
        _settings = LoadSettings();
    }

    public IReadOnlyList<ProviderOptionDto> ListProviders()
    {
        return ProviderOptions
            .Select(option => option with
            {
                Configured = !option.RequiresApiKey || HasApiKey(option.Id)
            })
            .ToList();
    }

    public async Task<IReadOnlyList<CopilotModelDto>> ListModelsAsync(string provider, CancellationToken cancellationToken = default)
    {
        return NormalizeProvider(provider) switch
        {
            CopilotProvider => (await _copilot.ListModelsAsync(cancellationToken))
                .Select(m => m with { Provider = CopilotProvider })
                .ToList(),
            OpenAiProvider => OpenAiModels.Select(m => new CopilotModelDto(m, m, OpenAiProvider)).ToList(),
            ClaudeProvider => ClaudeModels.Select(m => new CopilotModelDto(m, m, ClaudeProvider)).ToList(),
            OllamaProvider => await ListOllamaModelsAsync(cancellationToken),
            _ => throw new InvalidOperationException($"Unsupported provider '{provider}'.")
        };
    }

    public AiSettingsDto GetSettings()
    {
        var providers = ProviderOptions.Select(option =>
        {
            var provider = GetProviderSettings(option.Id);
            return new ProviderSettingsDto(option.Id, provider.ApiKey, provider.BaseUrl);
        }).ToList();

        return new AiSettingsDto(providers);
    }

    public AiSettingsDto SaveSettings(AiSettingsDto request)
    {
        var mapped = new Dictionary<string, ProviderSettingsRecord>(StringComparer.OrdinalIgnoreCase);
        foreach (var option in ProviderOptions)
        {
            var incoming = request.Providers.FirstOrDefault(p =>
                string.Equals(p.Provider, option.Id, StringComparison.OrdinalIgnoreCase));

            var current = GetProviderSettings(option.Id);
            mapped[option.Id] = new ProviderSettingsRecord
            {
                ApiKey = incoming?.ApiKey?.Trim() ?? current.ApiKey,
                BaseUrl = incoming?.BaseUrl?.Trim() ?? current.BaseUrl
            };
        }

        _settings = new AiSettingsRecord { Providers = mapped };
        PersistSettings();
        return GetSettings();
    }

    public bool HasApiKey(string provider)
    {
        var settings = GetProviderSettings(provider);
        return !string.IsNullOrWhiteSpace(settings.ApiKey);
    }

    public string NormalizeProvider(string? provider)
    {
        var normalized = provider?.Trim().ToLowerInvariant();
        return normalized switch
        {
            CopilotProvider or OpenAiProvider or ClaudeProvider or OllamaProvider => normalized,
            _ => throw new InvalidOperationException($"Unsupported provider '{provider}'.")
        };
    }

    private ProviderSettingsRecord GetProviderSettings(string provider)
    {
        var normalized = NormalizeProvider(provider);
        if (_settings.Providers.TryGetValue(normalized, out var settings))
            return settings;

        return new ProviderSettingsRecord
        {
            BaseUrl = normalized switch
            {
                OllamaProvider => "http://127.0.0.1:11434",
                _ => null
            }
        };
    }

    private async Task<IReadOnlyList<CopilotModelDto>> ListOllamaModelsAsync(CancellationToken cancellationToken)
    {
        var settings = GetProviderSettings(OllamaProvider);
        var baseUrl = ResolveOllamaBaseUrl(settings);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/tags");
        if (!string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.ApiKey.Trim());
        }

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Ollama returned {(int)response.StatusCode}.");

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var payload = await JsonSerializer.DeserializeAsync<OllamaTagsResponse>(stream, cancellationToken: cancellationToken)
            ?? throw new InvalidOperationException("Invalid Ollama model response.");

        return payload.Models
            .Where(m => !string.IsNullOrWhiteSpace(m.Name))
            .OrderBy(m => m.Name, StringComparer.OrdinalIgnoreCase)
            .Select(m => new CopilotModelDto(m.Name!, m.Name!, OllamaProvider))
            .ToList();
    }

    private static string ResolveOllamaBaseUrl(ProviderSettingsRecord settings)
    {
        var configured = settings.BaseUrl?.Trim().TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(configured))
            return configured;

        return string.IsNullOrWhiteSpace(settings.ApiKey)
            ? "http://127.0.0.1:11434"
            : "https://ollama.com";
    }

    private AiSettingsRecord LoadSettings()
    {
        try
        {
            if (!File.Exists(_settingsPath))
                return new AiSettingsRecord();

            var json = File.ReadAllText(_settingsPath);
            return JsonSerializer.Deserialize<AiSettingsRecord>(json, SettingsJson) ?? new AiSettingsRecord();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not load AI settings from {Path}", _settingsPath);
            return new AiSettingsRecord();
        }
    }

    private void PersistSettings()
    {
        try
        {
            var json = JsonSerializer.Serialize(_settings, SettingsJson);
            File.WriteAllText(_settingsPath, json, Encoding.UTF8);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not persist AI settings to {Path}", _settingsPath);
        }
    }

    private sealed class AiSettingsRecord
    {
        public Dictionary<string, ProviderSettingsRecord> Providers { get; set; } =
            new(StringComparer.OrdinalIgnoreCase);
    }

    private sealed class ProviderSettingsRecord
    {
        public string? ApiKey { get; set; }
        public string? BaseUrl { get; set; }
    }

    private sealed class OllamaTagsResponse
    {
        public List<OllamaModelRecord> Models { get; set; } = [];
    }

    private sealed class OllamaModelRecord
    {
        public string? Name { get; set; }
    }
}
