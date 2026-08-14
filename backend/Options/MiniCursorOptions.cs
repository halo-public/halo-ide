namespace MiniCursor.Api.Options;

public sealed class MiniCursorOptions
{
    public const string SectionName = "MiniCursor";

    public string WorkspaceRoot { get; set; } = "";
    public string DataDirectory { get; set; } = "AppData";
    public string CopilotModel { get; set; } = "gpt-5";
    public string GitHubToken { get; set; } = "";
}
