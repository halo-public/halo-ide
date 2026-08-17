using System.Text.Json;
using MiniCursor.Api.Models;
using MiniCursor.Api.Options;
using MiniCursor.Api.Services;
using Microsoft.AspNetCore.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<MiniCursorOptions>(
    builder.Configuration.GetSection(MiniCursorOptions.SectionName));

builder.Services.AddSingleton<WorkspaceService>();
builder.Services.AddSingleton<LaunchService>();
builder.Services.AddSingleton<TaskService>();
builder.Services.AddSingleton<TerminalService>();
builder.Services.AddSingleton<AppSecretsService>();
builder.Services.AddSingleton<GitService>();
builder.Services.AddSingleton<ChatStore>();
builder.Services.AddSingleton<CopilotService>();
builder.Services.AddSingleton<AuraWireDetector>();
builder.Services.AddSingleton<AiProviderService>();
builder.Services.AddSingleton<ProviderChatService>();
builder.Services.AddSingleton<WorkspaceProcessRunner>();
builder.Services.AddSingleton<ChatToolExecutor>();
builder.Services.AddSingleton<ChatService>();
builder.Services.AddSingleton<CursorChatImportService>();
builder.Services.AddSingleton<PluginService>();
builder.Services.AddSingleton<WorkspaceWatchService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<CopilotService>());
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin());
});

var app = builder.Build();
app.UseExceptionHandler(exceptionHandlerApp =>
{
    exceptionHandlerApp.Run(async context =>
    {
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>()
            .CreateLogger("GlobalExceptionHandler");
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        if (feature?.Error is not null)
        {
            logger.LogError(feature.Error, "Unhandled request exception for {Method} {Path}", context.Request.Method, context.Request.Path);
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";

        var error = new ApiErrorDto(
            Message: "An unexpected server error occurred.",
            Code: "internal_server_error",
            Suggestion: "Try again. If the problem continues, use the request ID when reporting it.",
            RequestId: context.TraceIdentifier);
        await context.Response.WriteAsJsonAsync(error);
    });
});
app.UseCors();
app.UseWebSockets();

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
};

static ApiErrorDto ApiError(HttpContext httpContext, string message, string? code = null, string? suggestion = null) =>
    new(message, code, suggestion, httpContext.TraceIdentifier);

static IResult BadRequestError(HttpContext httpContext, string message, string? code = null, string? suggestion = null) =>
    Results.BadRequest(ApiError(httpContext, message, code, suggestion));

static IResult NotFoundError(HttpContext httpContext, string message, string? code = null, string? suggestion = null) =>
    Results.NotFound(ApiError(httpContext, message, code, suggestion));

// --- Workspace / files ---
app.MapGet("/api/workspace", (WorkspaceService workspace) => Results.Ok(workspace.GetInfo()));

app.MapPut("/api/workspace", async (SetWorkspaceRequest request, WorkspaceService workspace, CopilotService copilot, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        var info = workspace.SetRoot(request.Root);
        await copilot.SetWorkingDirectoryAsync(info.Root);
        return Results.Ok(info);
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to update workspace root to {Root}", request.Root);
        return BadRequestError(http, "The workspace folder could not be opened.", "workspace_update_failed");
    }
});

app.MapGet("/api/workspace/chats", (ChatService chats) => Results.Ok(chats.GetWorkspaceChatInfo()));

app.MapGet("/api/files", (string? path, bool? gitignore, WorkspaceService workspace, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(workspace.List(path, gitignore ?? true));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to list files for path {Path}", path);
        return BadRequestError(http, "The requested folder could not be listed.", "file_list_failed");
    }
});

app.MapGet("/api/files/tree", (bool? gitignore, WorkspaceService workspace, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(workspace.ListTree(gitignore ?? true));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to build workspace file tree");
        return BadRequestError(http, "The workspace file tree could not be loaded.", "file_tree_failed");
    }
});

app.MapGet("/api/search", (string q, bool? gitignore, bool? regex, bool? matchCase, string? include, string? exclude, WorkspaceService workspace, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(workspace.Search(
            q ?? "",
            gitignore ?? true,
            regex ?? false,
            matchCase ?? false,
            include,
            exclude));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Workspace search failed for query {Query}", q);
        return BadRequestError(http, "The search could not be completed.", "workspace_search_failed");
    }
});

app.MapPost("/api/search/replace", (SearchReplaceRequest request, WorkspaceService workspace, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(workspace.ReplaceInFiles(
            request.Query ?? "",
            request.Replacement ?? "",
            request.Gitignore,
            request.Regex,
            request.MatchCase,
            request.Include,
            request.Exclude));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Workspace replace failed for query {Query}", request.Query);
        return BadRequestError(http, "The replace could not be completed.", "workspace_replace_failed");
    }
});

app.MapGet("/api/files/content", (string path, WorkspaceService workspace, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(workspace.ReadFile(path));
    }
    catch (FileNotFoundException ex)
    {
        logger.LogInformation(ex, "Requested file was not found: {Path}", path);
        return NotFoundError(http, "The requested file was not found.", "file_not_found");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to read file {Path}", path);
        return BadRequestError(http, "The file could not be opened.", "file_read_failed");
    }
});

app.MapPut("/api/files/content", (WriteFileRequest request, WorkspaceService workspace, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(workspace.WriteFile(request.Path, request.Content));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to write file {Path}", request.Path);
        return BadRequestError(http, "The file could not be saved.", "file_write_failed");
    }
});

app.MapPost("/api/files", (CreatePathRequest request, WorkspaceService workspace, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(workspace.Create(request.Path, request.IsDirectory));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to create path {Path}", request.Path);
        return BadRequestError(http, "The file or folder could not be created.", "path_create_failed");
    }
});

app.MapPost("/api/files/rename", (RenamePathRequest request, WorkspaceService workspace, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(workspace.Rename(request.Path, request.NewPath));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to rename path {Path} to {NewPath}", request.Path, request.NewPath);
        return BadRequestError(http, "The item could not be renamed.", "path_rename_failed");
    }
});

app.MapPost("/api/files/copy", (CopyPathRequest request, WorkspaceService workspace, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(workspace.Copy(request.Path, request.NewPath));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to copy path {Path} to {NewPath}", request.Path, request.NewPath);
        return BadRequestError(http, "The item could not be copied.", "path_copy_failed");
    }
});

app.MapDelete("/api/files", (string path, WorkspaceService workspace, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        workspace.Delete(path);
        return Results.NoContent();
    }
    catch (FileNotFoundException ex)
    {
        logger.LogInformation(ex, "Requested path was not found for delete: {Path}", path);
        return NotFoundError(http, "The requested file or folder was not found.", "path_not_found");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to delete path {Path}", path);
        return BadRequestError(http, "The file or folder could not be deleted.", "path_delete_failed");
    }
});

// --- Plugins ---
app.MapGet("/api/plugins", (PluginService plugins) => Results.Ok(plugins.List()));

app.MapGet("/api/plugins/{id}", (string id, PluginService plugins, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(plugins.Read(id));
    }
    catch (FileNotFoundException ex)
    {
        logger.LogInformation(ex, "Requested plugin was not found: {Id}", id);
        return NotFoundError(http, "The requested plugin was not found.", "plugin_not_found");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to load plugin {Id}", id);
        return BadRequestError(http, "The plugin could not be loaded.", "plugin_read_failed");
    }
});

// --- Launch ---
app.MapGet("/api/launch", (LaunchService launch) => Results.Ok(launch.GetConfigurations()));

app.MapGet("/api/launch/runs", (LaunchService launch) => Results.Ok(launch.ListRuns()));

app.MapPost("/api/launch/{name}/run", (string name, LaunchService launch, TaskService tasks, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(launch.Start(Uri.UnescapeDataString(name), tasks));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to start launch configuration {Name}", name);
        return BadRequestError(http, "The launch configuration could not be started.", "launch_start_failed");
    }
});

app.MapGet("/api/launch/runs/{id}", (string id, LaunchService launch) =>
{
    var run = launch.GetRun(id);
    return run is null ? Results.NotFound() : Results.Ok(run);
});

app.MapGet("/api/launch/runs/{id}/output", (string id, LaunchService launch) =>
{
    if (launch.GetRun(id) is null) return Results.NotFound();
    return Results.Ok(new { output = launch.GetOutput(id) });
});

app.MapPost("/api/launch/runs/{id}/stop", (string id, LaunchService launch) =>
    launch.Stop(id) ? Results.Ok() : Results.NotFound());

// --- Tasks ---
app.MapGet("/api/tasks", (TaskService tasks) => Results.Ok(tasks.GetTasks()));

app.MapPost("/api/tasks/{name}/run", (string name, TaskService tasks, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(tasks.Start(Uri.UnescapeDataString(name)));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to start task {Name}", name);
        return BadRequestError(http, "The task could not be started.", "task_start_failed");
    }
});

// --- Git ---
app.MapGet("/api/git/status", (GitService git, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(git.GetSidebar());
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to read git status");
        return BadRequestError(http, "Git status is unavailable for this workspace.", "git_status_failed");
    }
});

app.MapGet("/api/git/file", (string path, GitService git, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(git.GetHeadFile(path));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to read git file {Path}", path);
        return BadRequestError(http, "The file could not be read from Git.", "git_file_failed");
    }
});

app.MapPost("/api/git/operations", (GitOperationRequest request, GitService git, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(git.StartOperation(request));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to start git operation {Operation}", request.Operation);
        return BadRequestError(http, "The Git operation could not be started.", "git_operation_failed");
    }
});

app.Map("/api/workspace/watch", async (HttpContext http, WorkspaceWatchService watch) =>
{
    if (!http.WebSockets.IsWebSocketRequest)
    {
        http.Response.StatusCode = StatusCodes.Status400BadRequest;
        await http.Response.WriteAsync("Expected WebSocket request.");
        return;
    }

    using var socket = await http.WebSockets.AcceptWebSocketAsync();
    await watch.HandleWebSocketAsync(socket, http.RequestAborted);
});

// --- Interactive terminal (WebSocket) ---
app.Map("/api/terminal", async (HttpContext http, TerminalService terminal) =>
{
    if (!http.WebSockets.IsWebSocketRequest)
    {
        http.Response.StatusCode = StatusCodes.Status400BadRequest;
        await http.Response.WriteAsync("Expected WebSocket request.");
        return;
    }

    using var socket = await http.WebSockets.AcceptWebSocketAsync();
    await terminal.HandleWebSocketAsync(socket, http.RequestAborted);
});

// --- Copilot ---
app.MapGet("/api/copilot/status", (CopilotService copilot) => Results.Ok(copilot.GetStatus()));

app.MapGet("/api/ai/providers", async (AiProviderService providers, CancellationToken ct) =>
    Results.Ok(await providers.ListProvidersAsync(ct)));

app.MapPost("/api/ai/wire/detect", async (AiProviderService providers, ILogger<Program> logger, HttpContext http, CancellationToken ct) =>
{
    try
    {
        return Results.Ok(await providers.DetectWireAsync(persist: true, ct));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to detect Aura Wire");
        return BadRequestError(http, "Aura Wire could not be detected.", "aura_wire_detect_failed");
    }
});

app.MapGet("/api/ai/models", async (string provider, AiProviderService providers, ILogger<Program> logger, HttpContext http, CancellationToken ct) =>
{
    try
    {
        return Results.Ok(await providers.ListModelsAsync(provider, ct));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to list AI models for provider {Provider}", provider);
        return BadRequestError(http, "The model list could not be loaded for that provider.", "ai_models_failed");
    }
});

app.MapPost("/api/ollama/pull", async (OllamaModelRequest request, HttpContext http, AiProviderService providers, ILogger<Program> logger) =>
{
    http.Response.ContentType = "application/x-ndjson";
    http.Response.Headers.CacheControl = "no-cache";
    var json = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    try
    {
        await foreach (var evt in providers.PullOllamaAsync(request.Model, http.RequestAborted))
        {
            await http.Response.WriteAsync(JsonSerializer.Serialize(evt, json) + "\n", http.RequestAborted);
            await http.Response.Body.FlushAsync(http.RequestAborted);
        }
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Ollama pull failed for {Model}", request.Model);
        if (!http.Response.HasStarted)
        {
            http.Response.StatusCode = StatusCodes.Status400BadRequest;
            await http.Response.WriteAsJsonAsync(ApiError(http, ex.Message, "ollama_pull_failed"));
            return;
        }

        await http.Response.WriteAsync(JsonSerializer.Serialize(new OllamaPullEventDto(Error: ex.Message), json) + "\n", http.RequestAborted);
    }
});

app.MapPost("/api/ollama/test", async (OllamaModelRequest request, AiProviderService providers, ILogger<Program> logger, HttpContext http, CancellationToken ct) =>
{
    try
    {
        return Results.Ok(await providers.TestOllamaAsync(request.Model, ct));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Ollama test failed for {Model}", request.Model);
        return BadRequestError(http, ex.Message, "ollama_test_failed");
    }
});

app.MapGet("/api/settings/ai", (AiProviderService providers) => Results.Ok(providers.GetSettings()));

app.MapPut("/api/settings/ai", (AiSettingsDto request, AiProviderService providers, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(providers.SaveSettings(request));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to save AI settings");
        return BadRequestError(http, "The AI settings could not be saved.", "ai_settings_save_failed");
    }
});

app.MapGet("/api/settings/credentials", (AppSecretsService secrets) => Results.Ok(secrets.GetCredentials()));

app.MapPut("/api/settings/credentials", async (
    CredentialsSettingsDto request,
    AppSecretsService secrets,
    CopilotService copilot,
    ILogger<Program> logger,
    HttpContext http) =>
{
    try
    {
        var saved = secrets.SaveCredentials(request);
        await copilot.ReconnectAsync();
        return Results.Ok(saved);
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to save credentials");
        return BadRequestError(http, "The credentials could not be saved.", "credentials_save_failed");
    }
});

app.MapPut("/api/copilot/model", async (SetChatProviderModelRequest request, ChatService chats, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        var status = await chats.SetProviderModelAsync(request.Provider, request.Model, request.ChatId);
        return Results.Ok(status);
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to set model {Model} for provider {Provider}", request.Model, request.Provider);
        return BadRequestError(http, "The selected model could not be applied.", "copilot_model_update_failed");
    }
});

// --- Chats ---
app.MapGet("/api/chats", (ChatService chats) => Results.Ok(chats.List()));

app.MapPost("/api/chats", (CreateChatRequest? request, ChatService chats) =>
    Results.Ok(chats.Create(request?.Title, request?.Provider, request?.Model)));

app.MapGet("/api/chats/{id}", (string id, ChatService chats) =>
{
    var chat = chats.Get(id);
    return chat is null ? Results.NotFound() : Results.Ok(chat);
});

app.MapPatch("/api/chats/{id}", (string id, RenameChatRequest request, ChatService chats) =>
{
    var chat = chats.Rename(id, request.Title);
    return chat is null ? Results.NotFound() : Results.Ok(chat);
});

app.MapDelete("/api/chats/{id}", async (string id, ChatService chats) =>
    await chats.DeleteAsync(id) ? Results.NoContent() : Results.NotFound());

app.MapGet("/api/chats/import/cursor", (bool? currentWorkspaceOnly, CursorChatImportService importer, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        return Results.Ok(importer.List(currentWorkspaceOnly ?? false));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to list Cursor chats for import");
        return BadRequestError(http, "Cursor chats could not be loaded for import.", "cursor_import_list_failed");
    }
});

app.MapPost("/api/chats/import/cursor", (ImportCursorChatsRequest? request, CursorChatImportService importer, ILogger<Program> logger, HttpContext http) =>
{
    try
    {
        var ids = request?.Ids ?? [];
        return Results.Ok(importer.Import(ids));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to import Cursor chats");
        return BadRequestError(http, "The selected Cursor chats could not be imported.", "cursor_import_failed");
    }
});

app.MapPost("/api/chats/{id}/messages", async (string id, SendMessageRequest request, ChatService chats, HttpContext http) =>
{
    http.Response.Headers.ContentType = "text/event-stream";
    http.Response.Headers.CacheControl = "no-cache";
    http.Response.Headers.Connection = "keep-alive";

    try
    {
        await foreach (var evt in chats.SendAsync(id, request, http.RequestAborted))
        {
            var payload = JsonSerializer.Serialize(new { type = evt.Type, payload = evt.Payload }, jsonOptions);
            await http.Response.WriteAsync($"data: {payload}\n\n", http.RequestAborted);
            await http.Response.Body.FlushAsync(http.RequestAborted);
        }
    }
    catch (KeyNotFoundException)
    {
        http.Response.StatusCode = StatusCodes.Status404NotFound;
        await http.Response.WriteAsync($"data: {JsonSerializer.Serialize(new { type = "error", payload = ApiError(http, "Chat not found.", "chat_not_found") }, jsonOptions)}\n\n");
    }
    catch (Exception ex)
    {
        var logger = http.RequestServices.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "Chat message streaming failed for chat {ChatId}", id);
        var payload = JsonSerializer.Serialize(new
        {
            type = "error",
            payload = ApiError(http, "The chat request could not be completed.", "chat_send_failed")
        }, jsonOptions);
        await http.Response.WriteAsync($"data: {payload}\n\n", http.RequestAborted);
    }
});

app.MapPost("/api/chats/workspace-opened", (ChatService chats) => Results.Ok(chats.OnWorkspaceChanged()));

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.Run();
