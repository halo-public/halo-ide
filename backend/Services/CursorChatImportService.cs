using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public sealed class CursorChatImportService
{
    private readonly ChatStore _store;
    private readonly WorkspaceService _workspace;
    private readonly ILogger<CursorChatImportService> _logger;

    public CursorChatImportService(
        ChatStore store,
        WorkspaceService workspace,
        ILogger<CursorChatImportService> logger)
    {
        _store = store;
        _workspace = workspace;
        _logger = logger;
    }

    public IReadOnlyList<CursorChatImportCandidateDto> List(bool currentWorkspaceOnly = false)
    {
        var dbPath = ResolveStateDbPath();
        if (dbPath is null)
            throw new InvalidOperationException("Cursor chat database not found. Is Cursor installed for this user?");

        using var scope = OpenReadOnly(dbPath);
        var connection = scope.Connection;
        EnsureComposerHeaders(connection);

        var currentRoot = NormalizePath(_workspace.Root);
        var results = new List<CursorChatImportCandidateDto>();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            SELECT composerId, workspaceId, createdAt, lastUpdatedAt, isArchived, isSubagent, value
            FROM composerHeaders
            WHERE IFNULL(isArchived, 0) = 0 AND IFNULL(isSubagent, 0) = 0
            ORDER BY lastUpdatedAt DESC
            """;

        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var id = reader.GetString(0);
            var createdMs = reader.IsDBNull(2) ? 0L : reader.GetInt64(2);
            var updatedMs = reader.IsDBNull(3) ? createdMs : reader.GetInt64(3);
            var json = reader.IsDBNull(6) ? null : reader.GetString(6);
            if (string.IsNullOrWhiteSpace(json)) continue;

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.TryGetProperty("isDraft", out var draftEl) &&
                draftEl.ValueKind == JsonValueKind.True)
            {
                continue;
            }

            var title = root.TryGetProperty("name", out var nameEl)
                ? nameEl.GetString()
                : null;
            if (string.IsNullOrWhiteSpace(title))
                title = "Untitled Chat";

            var subtitle = root.TryGetProperty("subtitle", out var subEl)
                ? subEl.GetString()
                : null;

            var mode = root.TryGetProperty("unifiedMode", out var modeEl)
                ? modeEl.GetString()
                : null;

            string? workspacePath = null;
            if (root.TryGetProperty("workspaceIdentifier", out var ws) &&
                ws.ValueKind == JsonValueKind.Object &&
                ws.TryGetProperty("uri", out var uri) &&
                uri.ValueKind == JsonValueKind.Object &&
                uri.TryGetProperty("fsPath", out var fsPath))
            {
                workspacePath = fsPath.GetString();
            }

            if (currentWorkspaceOnly)
            {
                var normalized = NormalizePath(workspacePath);
                if (!PathsOverlap(normalized, currentRoot))
                    continue;
            }

            results.Add(new CursorChatImportCandidateDto(
                id,
                title!,
                subtitle,
                workspacePath,
                FromUnixMs(createdMs),
                FromUnixMs(updatedMs),
                mode));
        }

        return results;
    }

    public IReadOnlyList<ChatDetailDto> Import(IReadOnlyList<string> ids)
    {
        if (ids.Count == 0) return [];

        var dbPath = ResolveStateDbPath();
        if (dbPath is null)
            throw new InvalidOperationException("Cursor chat database not found. Is Cursor installed for this user?");

        using var scope = OpenReadOnly(dbPath);
        var connection = scope.Connection;
        var imported = new List<ChatDetailDto>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var rawId in ids)
        {
            var id = rawId?.Trim();
            if (string.IsNullOrWhiteSpace(id) || !seen.Add(id)) continue;

            try
            {
                var record = ImportOne(connection, id);
                if (record is null)
                {
                    _logger.LogWarning("Cursor chat {Id} had no importable messages", id);
                    continue;
                }

                imported.Add(_store.SaveImported(record).ToDetail());
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to import Cursor chat {Id}", id);
            }
        }

        return imported;
    }

    private ChatRecord? ImportOne(SqliteConnection connection, string composerId)
    {
        var composerJson = GetKv(connection, $"composerData:{composerId}");
        if (composerJson is null) return null;

        using var composerDoc = JsonDocument.Parse(composerJson);
        var composer = composerDoc.RootElement;

        var title = composer.TryGetProperty("name", out var nameEl)
            ? nameEl.GetString()
            : null;
        if (string.IsNullOrWhiteSpace(title))
            title = "Imported Cursor Chat";

        string? model = null;
        if (composer.TryGetProperty("modelConfig", out var modelConfig) &&
            modelConfig.ValueKind == JsonValueKind.Object &&
            modelConfig.TryGetProperty("modelName", out var modelName))
        {
            model = modelName.GetString();
        }

        var createdAt = ReadTimestamp(composer, "createdAt") ?? DateTimeOffset.UtcNow;
        var updatedAt = ReadTimestamp(composer, "lastUpdatedAt") ?? createdAt;

        if (!composer.TryGetProperty("fullConversationHeadersOnly", out var headers) ||
            headers.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var messages = new List<ChatMessageRecord>();
        foreach (var header in headers.EnumerateArray())
        {
            if (!header.TryGetProperty("bubbleId", out var bubbleIdEl)) continue;
            var bubbleId = bubbleIdEl.GetString();
            if (string.IsNullOrWhiteSpace(bubbleId)) continue;

            var bubbleJson = GetKv(connection, $"bubbleId:{composerId}:{bubbleId}");
            if (bubbleJson is null) continue;

            using var bubbleDoc = JsonDocument.Parse(bubbleJson);
            var bubble = bubbleDoc.RootElement;
            var type = bubble.TryGetProperty("type", out var typeEl) && typeEl.TryGetInt32(out var t)
                ? t
                : -1;
            var text = bubble.TryGetProperty("text", out var textEl)
                ? textEl.GetString()?.Trim()
                : null;
            if (string.IsNullOrWhiteSpace(text)) continue;

            // Cursor: 1 = user, 2 = assistant (skip tool/thinking-only bubbles with empty text)
            var role = type switch
            {
                1 => "user",
                2 => "assistant",
                _ => null
            };
            if (role is null) continue;

            var msgCreated = ReadTimestamp(bubble, "createdAt") ?? updatedAt;
            messages.Add(new ChatMessageRecord
            {
                Id = Guid.NewGuid().ToString("N"),
                Role = role,
                Content = text!,
                CreatedAt = msgCreated,
                Attachments = null
            });
        }

        if (messages.Count == 0) return null;

        return new ChatRecord
        {
            Id = Guid.NewGuid().ToString("N"),
            Title = title!.Trim(),
            CreatedAt = createdAt,
            UpdatedAt = updatedAt,
            CopilotSessionId = null,
            Model = string.IsNullOrWhiteSpace(model) ? null : model.Trim(),
            Messages = messages
        };
    }

    private static string? GetKv(SqliteConnection connection, string key)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT value FROM cursorDiskKV WHERE key = $key LIMIT 1";
        cmd.Parameters.AddWithValue("$key", key);
        var result = cmd.ExecuteScalar();
        return result switch
        {
            null or DBNull => null,
            string s => s,
            byte[] bytes => System.Text.Encoding.UTF8.GetString(bytes),
            _ => result.ToString()
        };
    }

    private static void EnsureComposerHeaders(SqliteConnection connection)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            SELECT COUNT(*) FROM sqlite_master
            WHERE type = 'table' AND name = 'composerHeaders'
            """;
        var count = Convert.ToInt64(cmd.ExecuteScalar());
        if (count == 0)
            throw new InvalidOperationException("Cursor composerHeaders table not found in state.vscdb.");
    }

    private static DbScope OpenReadOnly(string dbPath)
    {
        // Open in place read-only (DB can be multi-GB; do not copy).
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadOnly,
            Cache = SqliteCacheMode.Shared
        }.ToString());

        try
        {
            connection.Open();
        }
        catch (SqliteException ex)
        {
            connection.Dispose();
            throw new InvalidOperationException(
                "Could not open Cursor's chat database. Close Cursor and try again, or ensure the database is readable.",
                ex);
        }

        return new DbScope(connection);
    }

    private sealed class DbScope : IDisposable
    {
        public DbScope(SqliteConnection connection) => Connection = connection;

        public SqliteConnection Connection { get; }

        public void Dispose() => Connection.Dispose();
    }

    private static string? ResolveStateDbPath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        if (string.IsNullOrWhiteSpace(appData)) return null;

        var path = Path.Combine(appData, "Cursor", "User", "globalStorage", "state.vscdb");
        return File.Exists(path) ? path : null;
    }

    private static DateTimeOffset FromUnixMs(long ms)
    {
        if (ms <= 0) return DateTimeOffset.UtcNow;
        return DateTimeOffset.FromUnixTimeMilliseconds(ms);
    }

    private static DateTimeOffset? ReadTimestamp(JsonElement el, string property)
    {
        if (!el.TryGetProperty(property, out var value)) return null;

        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var ms))
            return FromUnixMs(ms);

        if (value.ValueKind == JsonValueKind.String)
        {
            var s = value.GetString();
            if (string.IsNullOrWhiteSpace(s)) return null;
            if (long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedMs))
                return FromUnixMs(parsedMs);
            if (DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dto))
                return dto.ToUniversalTime();
        }

        return null;
    }

    private static string? NormalizePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        try
        {
            return Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
        catch
        {
            return path.Trim().TrimEnd('\\', '/');
        }
    }

    private static bool PathsOverlap(string? a, string? b)
    {
        if (a is null || b is null) return false;
        if (string.Equals(a, b, StringComparison.OrdinalIgnoreCase)) return true;

        var aPrefix = a + Path.DirectorySeparatorChar;
        var bPrefix = b + Path.DirectorySeparatorChar;
        return a.StartsWith(bPrefix, StringComparison.OrdinalIgnoreCase) ||
               b.StartsWith(aPrefix, StringComparison.OrdinalIgnoreCase);
    }
}
