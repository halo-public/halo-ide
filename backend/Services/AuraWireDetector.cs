using System.Net.Http;
using System.Text.Json;

namespace MiniCursor.Api.Services;

/// <summary>
/// Finds a local Aura Wire install and probes its OpenAI-compatible /v1 API
/// (dashboard port, default 41793 — not the MITM proxy on 41792).
/// Older installs used 5174 (next to Vite's 5173); that is still probed as a fallback.
/// </summary>
public sealed class AuraWireDetector
{
    public const int DefaultDashboardPort = 41793;
    public const string DefaultBaseUrl = "http://127.0.0.1:41793/v1";
    public const int LegacyDashboardPort = 5174;
    public const string LegacyBaseUrl = "http://127.0.0.1:5174/v1";

    private static readonly TimeSpan ProbeTimeout = TimeSpan.FromMilliseconds(900);

    private readonly HttpClient _http = new(new SocketsHttpHandler
    {
        ConnectTimeout = ProbeTimeout,
        UseProxy = false,
        PooledConnectionLifetime = TimeSpan.FromSeconds(5)
    })
    {
        Timeout = ProbeTimeout
    };

    public AuraWireInstallInfo InspectInstall()
    {
        var dataDir = ResolveDataDirectory();
        var settingsPath = Path.Combine(dataDir, "user-settings.json");
        var hasSettings = File.Exists(settingsPath);
        var hasDataDir = Directory.Exists(dataDir);
        var executablePath = FindInstalledExecutable();
        var port = hasSettings ? ReadDashboardPort(settingsPath) : DefaultDashboardPort;
        var installed = hasSettings || executablePath is not null || hasDataDir;

        return new AuraWireInstallInfo(
            Installed: installed,
            DataDirectory: hasDataDir ? dataDir : null,
            SettingsPath: hasSettings ? settingsPath : null,
            ExecutablePath: executablePath,
            SuggestedPort: port,
            SuggestedBaseUrl: FormatBaseUrl(port));
    }

    public async Task<AuraWireProbeResult> DetectAsync(
        string? configuredBaseUrl,
        CancellationToken cancellationToken = default)
    {
        var install = InspectInstall();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var candidate in CandidateBaseUrls(configuredBaseUrl, install))
        {
            if (!seen.Add(candidate))
                continue;

            if (await IsApiRunningAsync(candidate, cancellationToken))
            {
                return new AuraWireProbeResult(
                    Installed: true,
                    Running: true,
                    BaseUrl: candidate,
                    Message: $"Found Aura Wire at {candidate}.");
            }
        }

        if (install.Installed)
        {
            return new AuraWireProbeResult(
                Installed: true,
                Running: false,
                BaseUrl: install.SuggestedBaseUrl,
                Message: "Aura Wire is installed, but the OpenAI API is not running. Start Aura Wire and try Detect again.");
        }

        return new AuraWireProbeResult(
            Installed: false,
            Running: false,
            BaseUrl: null,
            Message: "Aura Wire was not found. Install it, or enter the local API address manually.");
    }

    public async Task<bool> IsApiRunningAsync(string? baseUrl, CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeBaseUrl(baseUrl);
        if (normalized is null)
            return false;

        try
        {
            using var modelsCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            modelsCts.CancelAfter(ProbeTimeout);
            using var modelsResponse = await _http.GetAsync($"{normalized}/models", modelsCts.Token);
            if (!modelsResponse.IsSuccessStatusCode)
                return false;

            var modelsBody = await modelsResponse.Content.ReadAsStringAsync(modelsCts.Token);
            if (LooksLikeWireModels(modelsBody))
                return true;

            var origin = OriginFromBaseUrl(normalized);
            return origin is not null && await LooksLikeWireStatusAsync(origin, cancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException or JsonException)
        {
            return false;
        }
    }

    public static string? NormalizeBaseUrl(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        if (!trimmed.Contains("://", StringComparison.Ordinal))
            trimmed = "http://" + trimmed.TrimStart('/');

        trimmed = trimmed.TrimEnd('/');
        if (trimmed.EndsWith("/v1", StringComparison.OrdinalIgnoreCase))
            return trimmed;

        return trimmed + "/v1";
    }

    private static IEnumerable<string> CandidateBaseUrls(string? configuredBaseUrl, AuraWireInstallInfo install)
    {
        var configured = NormalizeBaseUrl(configuredBaseUrl);
        if (configured is not null)
            yield return configured;

        yield return install.SuggestedBaseUrl;

        if (install.SuggestedPort != DefaultDashboardPort)
            yield return DefaultBaseUrl;

        if (install.SuggestedPort != LegacyDashboardPort)
            yield return LegacyBaseUrl;
    }

    private static string FormatBaseUrl(int port) => $"http://127.0.0.1:{port}/v1";

    private static string? OriginFromBaseUrl(string baseUrl)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri))
            return null;

        return uri.GetLeftPart(UriPartial.Authority);
    }

    private static bool LooksLikeWireModels(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return false;

            foreach (var item in data.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                    continue;
                if (item.TryGetProperty("id", out var id) &&
                    string.Equals(id.GetString(), "aura-wire-auto", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }
        catch (JsonException)
        {
            return false;
        }

        return false;
    }

    private async Task<bool> LooksLikeWireStatusAsync(string origin, CancellationToken cancellationToken)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(ProbeTimeout);
            using var response = await _http.GetAsync($"{origin}/api/status", cts.Token);
            if (!response.IsSuccessStatusCode)
                return false;

            var json = await response.Content.ReadAsStringAsync(cts.Token);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            return root.TryGetProperty("proxyRunning", out _)
                || root.TryGetProperty("proxyPort", out _)
                || root.TryGetProperty("privacyMode", out _);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException or JsonException)
        {
            return false;
        }
    }

    private static string ResolveDataDirectory()
    {
        var env = Environment.GetEnvironmentVariable("AURA_WIRE_DATA_DIR");
        if (!string.IsNullOrWhiteSpace(env))
            return Path.GetFullPath(env);

        var root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(root))
            root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".aura-wire");

        return Path.Combine(root, "AuraWire");
    }

    private static int ReadDashboardPort(string settingsPath)
    {
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(settingsPath));
            var root = doc.RootElement;
            if (TryReadPort(root, "dashboard", "port", out var port) ||
                TryReadPort(root, "Dashboard", "Port", out port))
            {
                return port;
            }
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            // fall through
        }

        return DefaultDashboardPort;
    }

    private static bool TryReadPort(JsonElement root, string section, string property, out int port)
    {
        port = 0;
        if (!root.TryGetProperty(section, out var dashboard) || dashboard.ValueKind != JsonValueKind.Object)
            return false;
        if (!dashboard.TryGetProperty(property, out var portEl) || !portEl.TryGetInt32(out var value))
            return false;
        if (value is < 1024 or > 65535)
            return false;

        port = value;
        return true;
    }

    private static string? FindInstalledExecutable()
    {
        if (!OperatingSystem.IsWindows())
            return null;

        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var candidates = new[]
        {
            Path.Combine(localAppData, "Programs", "Aura Wire", "Aura Wire.exe"),
            Path.Combine(programFiles, "Aura Wire", "Aura Wire.exe"),
        };

        return candidates.FirstOrDefault(File.Exists);
    }
}

public sealed record AuraWireInstallInfo(
    bool Installed,
    string? DataDirectory,
    string? SettingsPath,
    string? ExecutablePath,
    int SuggestedPort,
    string SuggestedBaseUrl);

public sealed record AuraWireProbeResult(
    bool Installed,
    bool Running,
    string? BaseUrl,
    string Message);
