# Halo IDE

A minimal Cursor/VS Code–style IDE as an **Electron** app: React + Monaco on the front, ASP.NET Core on the back.

Open a folder, edit files, run launch configs and tasks, use a real PTY terminal, manage Git, and chat with Copilot, OpenAI, Claude, or Ollama.

## Features

- Native Electron shell with a Cursor-inspired dark UI
- Application menu (File, Edit, View, Go, Run, Terminal, Help); toolbars are hidable
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
- Mini plugins: workspace scripts that add context-menu items, editor/explorer title buttons, and syntax coloring

## Not included

- VS Code / Open VSX extensions
- Language Server Protocol / full IntelliSense
- Debug Adapter Protocol (launch configs run; they do not attach a debugger)
- Packaged builds for macOS or Linux (dev works; Windows installer and portable exe scripts are win-x64 only)

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
| Ollama | **Settings → Ollama**: local URL (`http://127.0.0.1:11434`) or [Ollama Cloud](https://ollama.com) API key. Pick or type a model, **Pull / install** on a local server, then **Test model**. |

## Run

In Cursor/VS Code, choose **Halo IDE** and press F5.

Or from a terminal:

```powershell
cd frontend
npm install
npm run electron:dev
```

Electron builds the API, starts Vite, launches the window, and owns the backend lifecycle (start on open, stop on quit).

The default workspace is `sample-workspace/` until you use **File → Open Folder**. The last opened folder is restored on the next launch.

To run the API alone (for example while iterating on the backend):

```powershell
cd backend
dotnet run
```

The API listens on `http://127.0.0.1:45154`. Pair it with `npm run dev` in `frontend/` if you want the Vite UI without Electron.

## Build a portable exe

Produces `frontend/release/win-unpacked/Halo IDE.exe` (no installer):

```powershell
.\scripts\build-exe.ps1
```

Or run the **Build Halo IDE EXE** launch config. Same thing via npm:

```powershell
cd frontend
npm run electron:build
```

The script publishes a self-contained win-x64 API, builds the renderer, and packages both with electron-builder.

## Versioning

The app version is `frontend/package.json` (currently `0.1.0`). The API project version is kept in sync.

Patch releases (notes, tests, installer, git tag, GitHub Release):

```powershell
.\scripts\release.ps1
.\scripts\release.ps1 -DryRun
```

Major or minor bump without cutting a release:

```powershell
.\scripts\bump.ps1 minor
.\scripts\bump.ps1 major
```

Then run `.\scripts\release.ps1` — it will not bump again until that version is tagged.

To stamp an exact version:

```powershell
.\scripts\set-version.ps1 0.2.0
```

## Build a Windows installer

Produces `frontend/release/mini-cursor-setup-<version>.exe` plus `latest.yml` (the auto-update feed):

```powershell
.\scripts\build-installer.ps1
.\scripts\build-installer.ps1 -Version 0.2.0
```

Or run the **Build Halo IDE Installer** launch config. Same thing via npm:

```powershell
cd frontend
npm run electron:installer
```

Installed builds check [GitHub Releases](https://github.com/halo-public/mini-cursor/releases) for updates on startup. Settings → About can check again, and the status bar offers **Restart to update** when a download is ready.

## GitHub releases

The **Release** workflow builds the Windows installer and publishes a GitHub Release (installer, blockmap, and `latest.yml` for auto-update). Merge the workflow to the default branch before the first tagged release.

**Cut a release locally** (preferred). The script writes `CHANGELOG.md`, runs tests, patch-bumps if the current version is already tagged, builds the installer, tags `v<version>`, publishes the GitHub Release, and pushes:

```powershell
.\scripts\release.ps1
```

If you already bumped with `.\scripts\bump.ps1 minor`, `release.ps1` ships that version as-is.

**Or tag by hand** and let CI build:

```powershell
.\scripts\set-version.ps1 0.2.0
git add frontend/package.json frontend/package-lock.json backend/MiniCursor.Api.csproj CHANGELOG.md
git commit -m "Release 0.2.0"
git tag v0.2.0
git push origin HEAD v0.2.0
```

**Or run it from the Actions tab:** Actions → Release → Run workflow, enter `0.2.0` (no `v`). That stamps the version on the selected branch, builds, and creates tag `v0.2.0` plus the GitHub Release.

A version with a hyphen (`0.2.0-beta.1`) is published as a GitHub prerelease; installed apps ignore those until you ship a stable tag.

CI also runs `.\scripts\test.ps1` on pull requests. Add backend tests under `tests/MiniCursor.Api.Tests/` and frontend tests next to the code as `*.test.ts`.

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

Chat history lives in `<workspace>/.mini-cursor/chats` and is retained for 3 days. App secrets and AI settings are stored under the data directory (`backend/AppData` in development; Electron user data when packaged). Workspace plugins live in `<workspace>/.mini-cursor/plugins`.

## Plugins

Halo IDE does not load VS Code extensions. It loads **workspace plugins**: a folder under `.mini-cursor/plugins/<id>/` with `plugin.json` and a script.

`plugin.json`:

```json
{
  "id": "hello",
  "name": "Hello",
  "version": "0.1.0",
  "main": "plugin.js"
}
```

`plugin.js` must define `function activate(api)`. Contribution points are context menus, up to five title-bar buttons on the explorer and editor, and syntax coloring:

```js
function activate(api) {
  api.registerContextMenuItem({
    id: 'logPath',
    title: 'Log Path',
    locations: ['explorer', 'editor'], // optional; default both
    target: 'any', // optional: 'file' | 'folder' | 'any'
    files: ['.js', 'javascript'], // optional: extensions, language ids, names, or globs
    run: function (ctx) {
      api.log(ctx.path || ctx.workspaceRoot)
    },
  })

  api.registerTitleItem({
    id: 'logPathTitle',
    title: 'Log Path',
    locations: ['explorer', 'editor'], // optional; default editor
    run: function (ctx) {
      api.log(ctx.path || ctx.workspaceRoot)
    },
  })
}
```

`run` receives `{ location, path, workspaceRoot, isDirectory, language, selection, line, column }`. `api.clipboard.write(text)` copies text. Messages from `api.log` show in the Output panel.

`files` limits an item to certain files. Each entry can be an extension (`.json` or `json`), a Monaco language id (`javascript`), a file name (`package.json`), or a glob (`**/*.test.ts`). If `files` is omitted, the item is shown for every file and folder (still subject to `target`). A `files` filter never matches folders.

Plugins can also register syntax coloring. Omit `monarch` to map extensions onto a language Monaco already ships; include it for a custom tokenizer:

```js
function activate(api) {
  api.registerLanguage({
    id: 'cpp',
    extensions: ['.c', '.h', '.cpp', '.hpp'],
    aliases: ['C++'],
  })

  api.registerLanguage({
    id: 'hello',
    extensions: ['.hello'],
    monarch: {
      tokenizer: {
        root: [
          [/#[^\n]*/, 'comment'],
          [/\b(hello|world)\b/, 'keyword'],
        ],
      },
    },
  })
}
```

Later registrations win for the same extension or file name, so a workspace plugin can override the built-in map. Built-in items (Copy Path, Copy Absolute Path, Copy File Name) and popular language maps are always available. The sample workspace ships a **Hello** plugin with **Log Path**, **Log JS Path**, a title-bar **Log Path** button, and a `.hello` language. After editing a plugin, save it or run **Reload Plugins** from the Help menu or command palette.

Hide the Run, Editor, Explorer, Git, or Chat toolbars from **View → Appearance**. Those commands stay in the application menu and command palette.

## Keybindings

| Shortcut | Action |
|----------|--------|
| Ctrl+O | Open folder |
| Ctrl+P | Quick open file |
| Ctrl+Shift+P | Command palette (includes Go to Symbol in File) |
| Ctrl+Shift+F | Workspace search |
| Ctrl+Shift+E | Show explorer |
| Ctrl+S | Save |
| Ctrl+K S | Save all |
| Ctrl+G | Go to line |
| Shift+Alt+F | Format document |
| Ctrl+Shift+T | Reopen closed editor |
| Ctrl+` | Focus terminal |
| Ctrl+B | Toggle bottom panel |
| Ctrl+L | Insert selected terminal/output text into chat |
| Ctrl+F | Find in file (Monaco) |

## Repo layout

```
backend/            ASP.NET Core API (workspace, git, launch, tasks, terminal, chat)
tests/               xUnit tests for the API
frontend/            Electron + React + Monaco UI
sample-workspace/    Default folder opened on first run
scripts/release.ps1
scripts/bump.ps1
scripts/test.ps1
scripts/build-exe.ps1
scripts/build-installer.ps1
scripts/publish-github-release.ps1
scripts/set-version.ps1
```

## License

[GNU General Public License v3.0](LICENSE)
