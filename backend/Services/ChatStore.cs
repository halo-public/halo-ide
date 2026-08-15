using System.Text.Json;
using MiniCursor.Api.Models;
using MiniCursor.Api.Options;
using Microsoft.Extensions.Options;

namespace MiniCursor.Api.Services;

public sealed class ChatStore
{
    public static readonly TimeSpan HistoryRetention = TimeSpan.FromDays(3);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly WorkspaceService _workspace;
    private readonly string _fallbackChatsDir;
    private readonly object _gate = new();

    public ChatStore(IOptions<MiniCursorOptions> options, IWebHostEnvironment env, WorkspaceService workspace)
    {
        _workspace = workspace;
        var dataDir = options.Value.DataDirectory;
        var root = Path.IsPathRooted(dataDir)
            ? dataDir
            : Path.Combine(env.ContentRootPath, dataDir);
        _fallbackChatsDir = Path.Combine(root, "chats");
        Directory.CreateDirectory(_fallbackChatsDir);
    }

    public IReadOnlyList<ChatSummaryDto> List()
    {
        lock (_gate)
        {
            var chatsDir = EnsureChatsDir();
            PurgeExpiredUnlocked();
            var cutoff = DateTimeOffset.UtcNow - HistoryRetention;
            return Directory.EnumerateFiles(chatsDir, "*.json")
                .Select(LoadUnlocked)
                .Where(c => c is not null && c.UpdatedAt >= cutoff)
                .Select(c => c!.ToSummary())
                .OrderByDescending(c => c.UpdatedAt)
                .ToList()!;
        }
    }

    public ChatRecord? Get(string id)
    {
        lock (_gate)
        {
            var path = PathFor(id);
            if (!File.Exists(path)) return null;
            var record = LoadUnlocked(path);
            if (record is null) return null;
            if (record.UpdatedAt < DateTimeOffset.UtcNow - HistoryRetention)
            {
                File.Delete(path);
                return null;
            }
            return record;
        }
    }

    public ChatRecord Create(string? title, string? model = null)
    {
        var record = new ChatRecord
        {
            Id = Guid.NewGuid().ToString("N"),
            Title = string.IsNullOrWhiteSpace(title) ? "New Chat" : title.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            Model = string.IsNullOrWhiteSpace(model) ? null : model.Trim(),
            Messages = []
        };

        lock (_gate) SaveUnlocked(record);
        return record;
    }

    /// <summary>Provider from the most recently updated chat that has one set.</summary>
    public string? GetMostRecentProvider()
    {
        lock (_gate)
        {
            var chatsDir = EnsureChatsDir();
            var cutoff = DateTimeOffset.UtcNow - HistoryRetention;
            return Directory.EnumerateFiles(chatsDir, "*.json")
                .Select(LoadUnlocked)
                .Where(c => c is not null
                    && c.UpdatedAt >= cutoff
                    && !string.IsNullOrWhiteSpace(c.Provider))
                .OrderByDescending(c => c!.UpdatedAt)
                .Select(c => c!.Provider)
                .FirstOrDefault();
        }
    }

    /// <summary>Model from the most recently updated chat that has one set.</summary>
    public string? GetMostRecentModel()
    {
        lock (_gate)
        {
            var chatsDir = EnsureChatsDir();
            var cutoff = DateTimeOffset.UtcNow - HistoryRetention;
            return Directory.EnumerateFiles(chatsDir, "*.json")
                .Select(LoadUnlocked)
                .Where(c => c is not null
                    && c.UpdatedAt >= cutoff
                    && !string.IsNullOrWhiteSpace(c.Model))
                .OrderByDescending(c => c!.UpdatedAt)
                .Select(c => c!.Model)
                .FirstOrDefault();
        }
    }

    public ChatRecord? SetModel(string id, string model)
    {
        lock (_gate)
        {
            var record = GetUnlocked(id);
            if (record is null) return null;

            var next = model.Trim();
            if (string.Equals(record.Model, next, StringComparison.OrdinalIgnoreCase))
                return record;

            record.Model = next;
            record.CopilotSessionId = null;
            record.UpdatedAt = DateTimeOffset.UtcNow;
            SaveUnlocked(record);
            return record;
        }
    }

    public void ClearCopilotSessionId(string id)
    {
        lock (_gate)
        {
            var record = GetUnlocked(id);
            if (record is null || string.IsNullOrWhiteSpace(record.CopilotSessionId))
                return;
            record.CopilotSessionId = null;
            SaveUnlocked(record);
        }
    }

    public ChatRecord? Rename(string id, string title)
    {
        lock (_gate)
        {
            var record = GetUnlocked(id);
            if (record is null) return null;
            record.Title = title.Trim();
            record.UpdatedAt = DateTimeOffset.UtcNow;
            SaveUnlocked(record);
            return record;
        }
    }

    public bool Delete(string id)
    {
        lock (_gate)
        {
            var path = PathFor(id);
            if (!File.Exists(path)) return false;
            File.Delete(path);
            return true;
        }
    }

    public void ClearCopilotSessionIds()
    {
        lock (_gate)
        {
            var chatsDir = EnsureChatsDir();
            foreach (var path in Directory.EnumerateFiles(chatsDir, "*.json"))
            {
                var record = LoadUnlocked(path);
                if (record is null || string.IsNullOrWhiteSpace(record.CopilotSessionId))
                    continue;
                record.CopilotSessionId = null;
                SaveUnlocked(record);
            }
        }
    }

    public ChatRecord Save(ChatRecord record)
    {
        lock (_gate)
        {
            record.UpdatedAt = DateTimeOffset.UtcNow;
            SaveUnlocked(record);
            return record;
        }
    }

    public ChatRecord SaveImported(ChatRecord record)
    {
        lock (_gate)
        {
            SaveUnlocked(record);
            return record;
        }
    }

    private ChatRecord? GetUnlocked(string id)
    {
        var path = PathFor(id);
        return File.Exists(path) ? LoadUnlocked(path) : null;
    }

    public void MoveFallbackChatsToWorkspace()
    {
        lock (_gate)
        {
            var workspaceChatsDir = EnsureChatsDir();
            if (string.Equals(workspaceChatsDir, _fallbackChatsDir, StringComparison.OrdinalIgnoreCase) ||
                !Directory.Exists(_fallbackChatsDir))
                return;

            foreach (var sourcePath in Directory.EnumerateFiles(_fallbackChatsDir, "*.json"))
            {
                var targetPath = Path.Combine(workspaceChatsDir, Path.GetFileName(sourcePath));
                if (File.Exists(targetPath))
                    continue;

                File.Move(sourcePath, targetPath);
            }
        }
    }

    private void PurgeExpiredUnlocked()
    {
        var chatsDir = EnsureChatsDir();
        var cutoff = DateTimeOffset.UtcNow - HistoryRetention;
        foreach (var path in Directory.EnumerateFiles(chatsDir, "*.json"))
        {
            var record = LoadUnlocked(path);
            if (record is null || record.UpdatedAt < cutoff)
            {
                try { File.Delete(path); }
                catch { /* ignore locked/missing files */ }
            }
        }
    }

    private ChatRecord? LoadUnlocked(string path)
    {
        try
        {
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<ChatRecord>(json, JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    private void SaveUnlocked(ChatRecord record)
    {
        var json = JsonSerializer.Serialize(record, JsonOptions);
        File.WriteAllText(PathFor(record.Id), json);
    }

    private string EnsureChatsDir()
    {
        var path = Path.Combine(_workspace.Root, WorkspaceService.MiniIdeFolderName, WorkspaceService.ChatsFolderName);
        Directory.CreateDirectory(path);
        return path;
    }

    private string PathFor(string id) => Path.Combine(EnsureChatsDir(), $"{id}.json");
}

public sealed class ChatRecord
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "New Chat";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string? CopilotSessionId { get; set; }
    public string? Provider { get; set; }
    public string? Model { get; set; }
    public List<ChatMessageRecord> Messages { get; set; } = [];

    public ChatSummaryDto ToSummary() =>
        new(Id, Title, CreatedAt, UpdatedAt, CopilotSessionId, Provider, Model);

    public ChatDetailDto ToDetail() =>
        new(Id, Title, CreatedAt, UpdatedAt, CopilotSessionId,
            Messages.Select(m => m.ToDto()).ToList(), Provider, Model);
}

public sealed class ChatMessageRecord
{
    public string Id { get; set; } = "";
    public string Role { get; set; } = "user";
    public string Content { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public List<ChatAttachmentRecord>? Attachments { get; set; }
    public List<ChatToolCallDto>? ToolCalls { get; set; }

    public ChatMessageDto ToDto() =>
        new(Id, Role, Content, CreatedAt,
            Attachments?.Select(a => a.ToDto()).ToList(),
            ToolCalls);
}

public sealed class ChatAttachmentRecord
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "file";
    public string? Path { get; set; }
    public string? MimeType { get; set; }
    public string? DataBase64 { get; set; }

    public ChatAttachmentDto ToDto() => new(Id, Name, Kind, Path, MimeType, DataBase64);
}
