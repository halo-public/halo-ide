namespace MiniCursor.Api.Models;

public sealed record WorkspaceInfoDto(string Root, string Name);

public sealed record WorkspaceChatInfoDto(string Root, string ChatsPath);

public sealed record FileNodeDto(
    string Name,
    string Path,
    bool IsDirectory,
    long? Size = null,
    DateTimeOffset? Modified = null);

public sealed record FileContentDto(string Path, string Content, string Language);

public sealed record WriteFileRequest(string Path, string Content);

public sealed record SetWorkspaceRequest(string Root);

public sealed record CreatePathRequest(string Path, bool IsDirectory);

public sealed record RenamePathRequest(string Path, string NewPath);

public sealed record CopyPathRequest(string Path, string NewPath);

public sealed record SearchMatchDto(string Path, int Line, int Column, string Preview);

public sealed record SearchReplaceRequest(
    string Query,
    string Replacement,
    bool Gitignore = true,
    bool Regex = false,
    bool MatchCase = false,
    string? Include = null,
    string? Exclude = null);

public sealed record SearchReplaceResultDto(
    int FileCount,
    int ReplacementCount,
    IReadOnlyList<string> Paths);

public sealed record GitStatusFileDto(
    string Path,
    string StagedStatus,
    string WorktreeStatus);

public sealed record GitStatusDto(
    string Branch,
    string? Upstream,
    bool IsDetached,
    bool HasUncommittedChanges,
    bool HasUntrackedFiles,
    int AheadBy,
    int BehindBy,
    IReadOnlyList<GitStatusFileDto> Files);

public sealed record GitRefDto(string Name, bool IsCurrent, bool IsRemote);

public sealed record GitSidebarDto(
    GitStatusDto Status,
    IReadOnlyList<GitRefDto> Branches);

public sealed record GitOperationRequest(
    string Operation,
    string? Argument = null,
    IReadOnlyList<string>? Paths = null);

public sealed record TaskConfigDto(
    string Label,
    string Type,
    string? Command,
    string? Cwd,
    IReadOnlyList<string>? Args);

public sealed record LaunchConfigDto(
    string Name,
    string Type,
    string Request,
    string? Program,
    string? Cwd,
    IReadOnlyList<string>? Args,
    IDictionary<string, string>? Env,
    string? PreLaunchTask = null);

public sealed record LaunchRunDto(
    string Id,
    string ConfigName,
    string Status,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    int? ExitCode);

public sealed record ChatSummaryDto(
    string Id,
    string Title,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? CopilotSessionId,
    string? Provider = null,
    string? Model = null);

public sealed record ChatAttachmentDto(
    string Id,
    string Name,
    string Kind,
    string? Path = null,
    string? MimeType = null,
    string? DataBase64 = null);

public sealed record ChatToolCallDto(
    string Id,
    string Name,
    string Status,
    string? Detail = null,
    string? Arguments = null,
    string? Result = null,
    string? Error = null);

public sealed record ChatMessageDto(
    string Id,
    string Role,
    string Content,
    DateTimeOffset CreatedAt,
    IReadOnlyList<ChatAttachmentDto>? Attachments = null,
    IReadOnlyList<ChatToolCallDto>? ToolCalls = null);

public sealed record ChatDetailDto(
    string Id,
    string Title,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? CopilotSessionId,
    IReadOnlyList<ChatMessageDto> Messages,
    string? Provider = null,
    string? Model = null);

public sealed record CreateChatRequest(string? Title, string? Provider = null, string? Model = null);

public sealed record SendMessageRequest(
    string Content,
    IReadOnlyList<MessageAttachmentRequest>? Attachments = null,
    string? Provider = null,
    string? Model = null);

public sealed record MessageAttachmentRequest(
    string Kind,
    string? Path = null,
    string? Name = null,
    string? MimeType = null,
    string? DataBase64 = null);

public sealed record RenameChatRequest(string Title);

public sealed record CopilotStatusDto(
    bool Connected,
    bool Authenticated,
    string? Message,
    string? Provider,
    string? Model);

public sealed record CopilotModelDto(
    string Id,
    string Name,
    string? Provider,
    string? PolicyState = null);

public sealed record ProviderOptionDto(
    string Id,
    string Name,
    bool RequiresApiKey = false,
    bool Configured = false);

public sealed record ProviderSettingsDto(
    string Provider,
    string? ApiKey = null,
    string? BaseUrl = null,
    string? Model = null);

public sealed record OllamaModelRequest(string Model);

public sealed record OllamaPullEventDto(
    string? Status = null,
    string? Error = null,
    long? Total = null,
    long? Completed = null,
    string? Digest = null);

public sealed record OllamaTestResultDto(
    bool Ok,
    string? Reply = null,
    string? Message = null,
    int ElapsedMs = 0);

public sealed record AiSettingsDto(IReadOnlyList<ProviderSettingsDto> Providers);

public sealed record AuraWireDetectDto(
    bool Installed,
    bool Running,
    string? BaseUrl = null,
    string? Message = null);

public sealed record CredentialsSettingsDto(string? GitHubPat = null);

public sealed record SetChatProviderModelRequest(string Provider, string Model, string? ChatId = null);

public sealed record ApiErrorDto(
    string Message,
    string? Code = null,
    string? Suggestion = null,
    string? RequestId = null);

public sealed record CursorChatImportCandidateDto(
    string Id,
    string Title,
    string? Subtitle,
    string? WorkspacePath,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? Mode = null);

public sealed record ImportCursorChatsRequest(IReadOnlyList<string> Ids);

public sealed record PluginInfoDto(
    string Id,
    string Name,
    string Version,
    string Main,
    string Path);

public sealed record PluginSourceDto(
    string Id,
    string Name,
    string Version,
    string Main,
    string Source);

public sealed record WorkspaceWatchEventDto(
    string Type,
    string Path,
    bool IsDirectory,
    string? OldPath = null);
