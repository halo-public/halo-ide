# Mini Cursor

A minimal Cursor/VS Code–style IDE as an **Electron** app: React + Monaco on the front, ASP.NET Core on the back.

Open a folder, edit files, run launch configs and tasks, use a real PTY terminal, manage Git, and chat with Copilot, OpenAI, Claude, or Ollama.

## Features

- Native Electron shell with a Cursor-inspired dark UI
- Backend starts and stops with the window
- Open any folder as the workspace (recent folders remembered)
- File explorer: create, rename, delete, copy/paste; optional `.gitignore` filtering
- Monaco editor: syntax highlighting, find, multi-cursor, wrap, brackets, indent guides
- Tabs with dirty close confirm, reopen closed editor, split view, and diff vs saved
- Breadcrumbs, outline symbols, status bar (line/col, language, saved state)
- Quick open (`Ctrl+P`), command palette (`Ctrl+Shift+P`), workspace search (`Ctrl+Shift+F`)
- Dockable sidebar, editor, chat, and bottom panel
- Settings for font size, wrap, tab size, minimap, `.gitignore`, and AI credentials
- Launch configurations from `.vscode/launch.json` with Run/Stop
- Tasks from `.vscode/tasks.json`
- Bottom panel: Output, interactive PTY terminal (xterm.js), Problems
- Git sidebar: status, branches, stage/unstage/discard, commit, fetch/pull/push
- AI chat with session tabs (close hides, X deletes), 3-day history, streaming replies, and file/image attachments
- Import chats from a local Cursor install

## Not included

- Extensions / plugins
- Language Server Protocol / full IntelliSense
- Debug Adapter Protocol (launch configs run; they do not attach a debugger)
- Packaged builds for macOS or Linux (dev works; the portable exe script is Windows-only)

## Prerequisites

- Windows (packaged build is win-x64)
- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org/) 20+
- Git (for the Git panel)

For AI chat, configure at least one provider in **Settings**:

| Provider | What you need |
|----------|----------------|
| GitHub Copilot | Copilot subscription, plus Copilot CLI auth (`gh auth login`) **or** a GitHub PAT |
| OpenAI | API key |
| Claude | API key |
| Ollama | Local Ollama at `http://127.0.0.1:11434`, or an [Ollama Cloud](https://ollama.com) API key |

## Run

In Cursor/VS Code, choose **Mini Cursor** and press F5.

Or from a terminal:

```powershell
cd frontend
npm install
npm run electron:dev
```

Electron builds the API, starts Vite, launches the window, and owns the backend lifecycle (start on open, stop on quit).

The default workspace is `sample-workspace/` until you use **Open Folder**. The last opened folder is restored on the next launch.

To run the API alone (for example while iterating on the backend):

```powershell
cd backend
dotnet run
```

The API listens on `http://127.0.0.1:5154`. Pair it with `npm run dev` in `frontend/` if you want the Vite UI without Electron.

## Build a portable exe

Produces `frontend/release/win-unpacked/Mini Cursor.exe` (no installer):

```powershell
.\scripts\build-exe.ps1
```

Or run the **Build Mini Cursor EXE** launch config. Same thing via npm:

```powershell
cd frontend
npm run electron:build
```

The script publishes a self-contained win-x64 API, builds the renderer, and packages both with electron-builder.

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

Leave `WorkspaceRoot` empty to use `sample-workspace`. Prefer setting a GitHub PAT in **Settings** rather than committing it here.

Chat history lives in `<workspace>/.mini-cursor/chats` and is retained for 3 days. App secrets and AI settings are stored under the data directory (`backend/AppData` in development; Electron user data when packaged).

## Keybindings

| Shortcut | Action |
|----------|--------|
| Ctrl+P | Quick open file |
| Ctrl+Shift+P | Command palette |
| Ctrl+Shift+F | Workspace search |
| Ctrl+Shift+E | Show explorer |
| Ctrl+S | Save |
| Ctrl+K S | Save all |
| Ctrl+Shift+T | Reopen closed editor |
| Ctrl+` | Focus terminal |
| Ctrl+B | Toggle bottom panel |
| Ctrl+L | Insert selected terminal/output text into chat |
| Ctrl+F | Find in file (Monaco) |

## Repo layout

```
backend/            ASP.NET Core API (workspace, git, launch, tasks, terminal, chat)
frontend/            Electron + React + Monaco UI
sample-workspace/    Default folder opened on first run
scripts/build-exe.ps1
```

## License

[GNU General Public License v3.0](LICENSE)
