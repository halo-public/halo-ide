# Mini Cursor

A minimal Cursor/VS Code–style IDE as an **Electron** app: React UI + ASP.NET Core backend, powered by **GitHub Copilot only**.

## Features

- Native Electron shell with app icon and Cursor-inspired dark UI
- Backend starts and stops with the Electron window
- Open any folder as the workspace (with recent folders)
- File/folder explorer with create, rename, delete, copy/paste
- Monaco editor: syntax highlighting, find, multi-cursor, wrap, brackets, indent guides
- Tabs with dirty close confirm, reopen closed editor, split view, and diff vs saved
- Breadcrumbs, outline symbols, status bar (line/col, language, saved state)
- Quick open (Ctrl+P), command palette (Ctrl+Shift+P), workspace search (Ctrl+Shift+F)
- Settings for font size, wrap, tab size, minimap, and `.gitignore` filtering
- Launch configurations from `.vscode/launch.json` with Run/Stop
- Tasks from `.vscode/tasks.json`
- Bottom panel: Output, interactive Terminal, Problems
- Copilot chat with session tabs (close hides, does not delete), 3-day history, streaming replies, and attachments

## Not included

- Other AI providers
- Extensions/plugins
- Version control UI
- Language Server Protocol / full IntelliSense
- Full PTY/ConPTY terminal (stdio shell instead)

## Prerequisites

- .NET 10 SDK
- Node.js 20+
- GitHub Copilot subscription
- Copilot CLI authenticated (`gh auth login` / Copilot login), **or** set `MiniCursor:GitHubToken` in `backend/appsettings.json`

## Run

In Cursor/VS Code, choose **Mini Cursor** and press F5.

Or:

```powershell
cd frontend
npm install
npm run electron:dev
```

Electron builds the API, starts Vite, launches the window, and owns the backend lifecycle (start on open, stop on quit).

Default workspace is `sample-workspace/` until you use **Open Folder**.

## Keybindings

| Shortcut | Action |
|----------|--------|
| Ctrl+P | Quick open file |
| Ctrl+Shift+P | Command palette |
| Ctrl+Shift+F | Workspace search |
| Ctrl+S | Save |
| Ctrl+Shift+T | Reopen closed editor |
| Ctrl+` | Focus terminal |
| Ctrl+B | Toggle bottom panel |
| Ctrl+F | Find in file (Monaco) |

## Configuration

`backend/appsettings.json`:

```json
{
  "MiniCursor": {
    "WorkspaceRoot": "",
    "DataDirectory": "AppData",
    "CopilotModel": "gpt-5",
    "GitHubToken": ""
  }
}
```

Leave `WorkspaceRoot` empty to use `sample-workspace`. Chat history is stored under `backend/AppData/chats` and retained for 3 days.
