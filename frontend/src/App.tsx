import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { acceleratorDetail, paletteCommands, type AppCommand } from './appMenu'
import { api } from './api/client'
import type { CopilotStatus, EditorCursor, FileContent, LaunchRun, ProblemItem, WorkspaceInfo } from './api/types'
import { loadChrome, toggleToolbar, TOOLBAR_IDS, TOOLBAR_LABELS, type ChromePrefs } from './chromePrefs'
import { ActivityBar, type Activity } from './components/ActivityBar'
import { AppMenuBar } from './components/AppMenuBar'
import { BottomPanel, type BottomPanelHandle, type BottomTab } from './components/BottomPanel'
import { ChatPanel, type ChatPanelHandle, type ChatTurnIndicator } from './components/ChatPanel'
import { CommandPalette } from './components/CommandPalette'
import { EditorArea, type EditorGroupId, type OpenTab } from './components/EditorArea'
import { FileTree } from './components/FileTree'
import { GitPanel } from './components/GitPanel'
import { QuickOpen } from './components/QuickOpen'
import { SearchPanel } from './components/SearchPanel'
import { SettingsModal } from './components/SettingsModal'
import { Splitter } from './components/Splitter'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { clampLayout, loadLayout, saveLayout, type HorizontalDock, type LayoutPrefs } from './layoutPrefs'
import { loadSettings, saveSettings, type EditorSettings } from './settingsPrefs'
import { applyTheme, THEMES } from './themes'
import { extractOutline } from './editorUtils'
import { loadOpenTabs, saveOpenTabs } from './openTabsPrefs'
import { parseProblemOutput } from './problemMatchers'
import { PluginHostContext } from './plugins/PluginHostContext'
import { usePluginHostState } from './plugins/usePluginHostState'
import { useAppMenu } from './useAppMenu'
import { useLaunchControls } from './useLaunchControls'
import { useWorkspaceFolder } from './useWorkspaceFolder'
import { rememberWorkspace } from './workspaceMru'
import { useWorkspaceWatch, type WorkspaceWatchEvent } from './useWorkspaceWatch'

export default function App() {
  const appTitle = 'Halo IDE'
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [activity, setActivity] = useState<Activity>('files')
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activePath, setActivePath] = useState<string | undefined>()
  const [secondaryPath, setSecondaryPath] = useState<string | undefined>()
  const [activeGroup, setActiveGroup] = useState<EditorGroupId>('primary')
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [closedStack, setClosedStack] = useState<OpenTab[]>([])
  const closedStackRef = useRef(closedStack)
  closedStackRef.current = closedStack
  const [terminal, setTerminal] = useState('Ready.\n')
  const [run, setRun] = useState<LaunchRun | null>(null)
  const [bottomTab, setBottomTab] = useState<BottomTab>('output')
  const [panelVisible, setPanelVisible] = useState(true)
  const [treeKey, setTreeKey] = useState(0)
  const [gitRefreshKey, setGitRefreshKey] = useState(0)
  const [revealFolder, setRevealFolder] = useState<string | null>(null)
  const [layout, setLayout] = useState<LayoutPrefs>(() => loadLayout())
  const [settings, setSettings] = useState<EditorSettings>(() => loadSettings())
  const [chrome, setChrome] = useState<ChromePrefs>(() => loadChrome())
  const [cursor, setCursor] = useState<EditorCursor | null>(null)
  const [copilotStatus, setCopilotStatus] = useState<CopilotStatus | null>(null)
  const [editorProblems, setEditorProblems] = useState<ProblemItem[]>([])
  const [launchProblems, setLaunchProblems] = useState<ProblemItem[]>([])
  const problems = useMemo(() => [...editorProblems, ...launchProblems], [editorProblems, launchProblems])
  const [formatRequest, setFormatRequest] = useState(0)
  const [tabsReady, setTabsReady] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importCursorOpen, setImportCursorOpen] = useState(false)
  const [reveal, setReveal] = useState<{ path: string; line: number; column?: number } | null>(null)
  const [chatTurn, setChatTurn] = useState<ChatTurnIndicator | null>(null)
  const [appVersion, setAppVersion] = useState(__APP_VERSION__)
  const [updateState, setUpdateState] = useState<MiniCursorUpdateState | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const bottomPanelRef = useRef<BottomPanelHandle>(null)
  const chatPanelRef = useRef<ChatPanelHandle>(null)
  const detectLanguageRef = useRef<(path: string) => string>(() => 'plaintext')
  const pendingChordRef = useRef(false)

  const focusedTab = useMemo(() => {
    const path = activeGroup === 'secondary' && splitEnabled ? secondaryPath : activePath
    return tabs.find((t) => t.path === path)
  }, [tabs, activePath, secondaryPath, activeGroup, splitEnabled])

  const resizeSidebar = useCallback((delta: number) => {
    setLayout((prev) => {
      const next = clampLayout({ ...prev, sidebarWidth: prev.sidebarWidth + delta })
      layoutRef.current = next
      return next
    })
  }, [])

  const resizeChat = useCallback((delta: number) => {
    setLayout((prev) => {
      const next = clampLayout({ ...prev, chatWidth: prev.chatWidth - delta })
      layoutRef.current = next
      return next
    })
  }, [])

  const resizeTerminal = useCallback((delta: number) => {
    setLayout((prev) => {
      const next = clampLayout({ ...prev, terminalHeight: prev.terminalHeight - delta })
      layoutRef.current = next
      return next
    })
  }, [])

  const persistLayout = useCallback(() => {
    saveLayout(layoutRef.current)
  }, [])

  const checkForUpdates = useCallback(() => {
    void window.miniCursor?.checkForUpdates()
  }, [])

  const installUpdate = useCallback(() => {
    void window.miniCursor?.installUpdate()
  }, [])

  useEffect(() => {
    const shell = window.miniCursor
    if (!shell?.getVersion) return
    void shell.getVersion().then(setAppVersion)
    void shell.getUpdateState?.().then(setUpdateState)
    return shell.onUpdate?.(setUpdateState)
  }, [])

  const setDock = useCallback((key: 'documentsDock' | 'sidebarsDock' | 'bottomPanelDock', value: HorizontalDock) => {
    setLayout((prev) => {
      const candidate =
        key === 'documentsDock'
          ? { ...prev, documentsDock: value }
          : key === 'sidebarsDock'
            ? { ...prev, sidebarsDock: value }
            : { ...prev, bottomPanelDock: value }
      const next = clampLayout(candidate)
      layoutRef.current = next
      saveLayout(next)
      return next
    })
  }, [])

  const onWorkspaceChange = useCallback((next: WorkspaceInfo) => {
    setWorkspace(next)
    setTabs([])
    setActivePath(undefined)
    setSecondaryPath(undefined)
    setClosedStack([])
    setTreeKey((k) => k + 1)
    setTabsReady(false)
    setTerminal(`Opened workspace: ${next.root}\n`)
    setBottomTab('output')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ws = await api.getWorkspace()
        if (cancelled) return
        setWorkspace(ws)
        await rememberWorkspace(ws.root)
      } catch (e) {
        if (!cancelled) {
          setTerminal(`Failed to load workspace: ${(e as Error).message}\n`)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.title = workspace?.name ? `${appTitle} - ${workspace.name}` : appTitle
  }, [workspace?.name])

  useEffect(() => {
    if (!workspace?.root) return
    let cancelled = false
    setTabsReady(false)
    const saved = loadOpenTabs(workspace.root)
    ;(async () => {
      for (const path of saved.paths) {
        if (cancelled) return
        try {
          await openFileRef.current(path)
        } catch {
          /* missing */
        }
      }
      if (cancelled) return
      if (saved.activePath) setActivePath(saved.activePath)
      if (saved.secondaryPath) {
        setSecondaryPath(saved.secondaryPath)
        setSplitEnabled(true)
      }
      setTabsReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [workspace?.root])

  useEffect(() => {
    if (!workspace || !tabsReady) return
    saveOpenTabs(workspace.root, {
      paths: tabs.map((t) => t.path),
      activePath,
      secondaryPath,
    })
  }, [tabs, activePath, secondaryPath, workspace, tabsReady])

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  const openFile = async (path: string, group?: EditorGroupId, line?: number, column?: number) => {
    const targetGroup = group ?? activeGroup
    const existing = tabsRef.current.find((t) => t.path === path)
    if (existing) {
      if (targetGroup === 'secondary') setSecondaryPath(path)
      else setActivePath(path)
      setActiveGroup(targetGroup)
      if (line != null) setReveal({ path, line, column })
      return
    }
    const file = await api.readFile(path)
    const tab: OpenTab = {
      path: file.path,
      content: file.content,
      originalContent: file.content,
      language: detectLanguageRef.current(file.path),
      dirty: false,
    }
    setTabs((prev) => [...prev, tab])
    if (targetGroup === 'secondary') setSecondaryPath(file.path)
    else setActivePath(file.path)
    setActiveGroup(targetGroup)
    if (line != null) setReveal({ path: file.path, line, column })
  }
  const openFileRef = useRef(openFile)
  openFileRef.current = openFile

  const reloadPaths = useCallback(async (paths: string[]) => {
    for (const path of paths) {
      const tab = tabsRef.current.find((t) => t.path === path)
      if (!tab || tab.dirty) continue
      try {
        const file = await api.readFile(path)
        setTabs((prev) =>
          prev.map((t) =>
            t.path === path
              ? {
                  ...t,
                  content: file.content,
                  originalContent: file.content,
                  language: detectLanguageRef.current(file.path),
                  dirty: false,
                }
              : t,
          ),
        )
      } catch {
        /* ignore */
      }
    }
  }, [])

  const openGitDiff = async (path: string) => {
    await openFileRef.current(path)
    try {
      const head = await api.getGitFile(path)
      setTabs((prev) =>
        prev.map((t) => (t.path === path ? { ...t, originalContent: head.content } : t)),
      )
      setShowDiff(true)
    } catch {
      setShowDiff(true)
    }
  }

  const closeTab = (path: string) => {
    const tab = tabsRef.current.find((t) => t.path === path)
    if (!tab) return
    if (tab.dirty) {
      const ok = window.confirm(`${tab.path} has unsaved changes. Close anyway?`)
      if (!ok) return
    }
    setClosedStack((prev) => [tab, ...prev].slice(0, 20))
    setTabs((prev) => {
      const next = prev.filter((t) => t.path !== path)
      if (activePath === path) setActivePath(next[next.length - 1]?.path)
      if (secondaryPath === path) setSecondaryPath(next.find((t) => t.path !== path)?.path)
      return next
    })
  }

  const reopenClosed = useCallback(() => {
    const [first, ...rest] = closedStackRef.current
    if (!first) return
    setClosedStack(rest)
    void openFileRef.current(first.path)
  }, [])

  const logPlugin = useCallback((message: string) => {
    setTerminal((prev) => `${prev}${prev.endsWith('\n') || !prev ? '' : '\n'}[plugin] ${message}\n`)
    setBottomTab('output')
  }, [])

  const pluginHost = usePluginHostState(workspace?.root, logPlugin)
  const reloadPluginsRef = useRef(pluginHost.reload)
  reloadPluginsRef.current = pluginHost.reload
  detectLanguageRef.current = pluginHost.detectLanguage

  useEffect(() => {
    setTabs((prev) =>
      prev.map((tab) => {
        const language = detectLanguageRef.current(tab.path)
        return tab.language === language ? tab : { ...tab, language }
      }),
    )
  }, [pluginHost.languages])

  const applyWatchEvents = useCallback((events: WorkspaceWatchEvent[]) => {
    if (!events.length) return
    setTreeKey((k) => k + 1)
    setGitRefreshKey((k) => k + 1)
    if (events.some((ev) => ev.path.replace(/\\/g, '/').startsWith('.mini-cursor/plugins/'))) {
      reloadPluginsRef.current()
    }

    for (const ev of events) {
      if (ev.isDirectory) continue
      const path = ev.path.replace(/\\/g, '/')
      const oldPath = ev.oldPath?.replace(/\\/g, '/')
      const tab = tabsRef.current.find((t) => t.path === path || (oldPath && t.path === oldPath))
      if (!tab) continue

      if (ev.type === 'deleted') {
        if (window.confirm(`${tab.path} was deleted on disk. Close the tab?`)) {
          setTabs((prev) => prev.filter((t) => t.path !== tab.path))
        }
        continue
      }

      if (ev.type === 'renamed' && oldPath) {
        setTabs((prev) => prev.map((t) => (t.path === oldPath ? { ...t, path } : t)))
        setActivePath((current) => (current === oldPath ? path : current))
        setSecondaryPath((current) => (current === oldPath ? path : current))
        continue
      }

      const reload = async () => {
        try {
          const file = await api.readFile(path)
          setTabs((prev) =>
            prev.map((t) =>
              t.path === path
                ? {
                    ...t,
                    content: file.content,
                    originalContent: file.content,
                    language: detectLanguageRef.current(file.path),
                    dirty: false,
                  }
                : t,
            ),
          )
        } catch {
          /* file may have vanished */
        }
      }

      if (!tab.dirty) void reload()
      else if (window.confirm(`${tab.path} changed on disk. Reload and discard unsaved changes?`)) void reload()
    }
  }, [])

  useWorkspaceWatch(workspace?.root, applyWatchEvents)

  const saveAll = useCallback(async () => {
    let reloadPlugins = false
    for (const tab of tabsRef.current.filter((t) => t.dirty)) {
      try {
        const saved = await api.writeFile(tab.path, tab.content)
        if (saved.path.replace(/\\/g, '/').startsWith('.mini-cursor/plugins/')) reloadPlugins = true
        setTabs((prev) =>
          prev.map((t) =>
            t.path === saved.path
              ? { ...t, content: saved.content, originalContent: saved.content, language: detectLanguageRef.current(saved.path), dirty: false }
              : t,
          ),
        )
      } catch (e) {
        setTerminal(`Save failed for ${tab.path}: ${(e as Error).message}\n`)
        setBottomTab('output')
      }
    }
    if (reloadPlugins) reloadPluginsRef.current()
  }, [])

  const onOutput = useCallback((text: string, nextRun: LaunchRun | null) => {
    setRun(nextRun)
    const header = nextRun
      ? `[${nextRun.configName}] ${nextRun.status}${nextRun.exitCode != null ? ` (exit ${nextRun.exitCode})` : ''}\n`
      : ''
    setTerminal(header + (text || '(no output yet)\n'))
    setLaunchProblems(parseProblemOutput(text))
    setBottomTab('output')
    setPanelVisible(true)
  }, [])

  const onFolderError = useCallback((message: string) => {
    onOutput(message, null)
  }, [onOutput])
  const workspaceFolder = useWorkspaceFolder(workspace, onWorkspaceChange, onFolderError)
  const launch = useLaunchControls(workspace?.root, onOutput)

  useEffect(() => {
    api.getCopilotStatus().then(setCopilotStatus).catch(() => setCopilotStatus(null))
  }, [workspace?.root])

  const goToLine = useCallback(() => {
    const tab = tabsRef.current.find((t) => t.path === (activeGroup === 'secondary' && splitEnabled ? secondaryPath : activePath))
    if (!tab) return
    const raw = window.prompt('Go to line')
    const line = Number(raw)
    if (!Number.isFinite(line) || line < 1) return
    setReveal({ path: tab.path, line, column: 1 })
  }, [activeGroup, splitEnabled, secondaryPath, activePath])

  const commands: AppCommand[] = useMemo(
    () => {
      const platform = window.miniCursor?.platform ?? 'win32'
      const shortcut = (accel: string) => acceleratorDetail(accel, platform)
      const running = launch.run?.status === 'running'
      return [
        {
          id: 'openFolder',
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+O',
          detail: shortcut('CmdOrCtrl+O'),
          menu: { menu: 'file', order: 10 },
          run: () => void workspaceFolder.browseFolder(),
        },
        {
          id: 'save',
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          detail: shortcut('CmdOrCtrl+S'),
          menu: { menu: 'file', order: 20, separatorBefore: true },
          run: () => void saveAll(),
        },
        {
          id: 'saveAll',
          label: 'Save All',
          detail: shortcut('CmdOrCtrl+K') + ' S',
          menu: { menu: 'file', order: 21 },
          run: () => void saveAll(),
        },
        {
          id: 'reopen',
          label: 'Reopen Closed Editor',
          accelerator: 'CmdOrCtrl+Shift+T',
          detail: shortcut('CmdOrCtrl+Shift+T'),
          menu: { menu: 'file', order: 22 },
          run: reopenClosed,
        },
        {
          id: 'importCursorChats',
          label: 'Import Chats from Cursor…',
          menu: { menu: 'file', order: 30, separatorBefore: true },
          run: () => setImportCursorOpen(true),
        },
        {
          id: 'newChat',
          label: 'New Chat',
          menu: { menu: 'file', order: 31 },
          run: () => chatPanelRef.current?.startNewChat(),
        },
        {
          id: 'format',
          label: 'Format Document',
          accelerator: 'Shift+Alt+F',
          detail: 'Shift+Alt+F',
          menu: { menu: 'edit', order: 10 },
          run: () => setFormatRequest((n) => n + 1),
        },
        {
          id: 'commandPalette',
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+Shift+P',
          detail: shortcut('CmdOrCtrl+Shift+P'),
          menu: { menu: 'view', order: 10 },
          run: () => setPaletteOpen(true),
        },
        {
          id: 'explorer',
          label: 'Show Explorer',
          accelerator: 'CmdOrCtrl+Shift+E',
          detail: shortcut('CmdOrCtrl+Shift+E'),
          menu: { menu: 'view', order: 20, separatorBefore: true },
          run: () => setActivity('files'),
        },
        {
          id: 'search',
          label: 'Search in Workspace',
          accelerator: 'CmdOrCtrl+Shift+F',
          detail: shortcut('CmdOrCtrl+Shift+F'),
          menu: { menu: 'view', order: 21 },
          run: () => setActivity('search'),
        },
        {
          id: 'git',
          label: 'Show Git',
          menu: { menu: 'view', order: 22 },
          run: () => setActivity('git'),
        },
        {
          id: 'togglePanel',
          label: 'Toggle Panel',
          accelerator: 'CmdOrCtrl+B',
          detail: shortcut('CmdOrCtrl+B'),
          menu: { menu: 'view', order: 30, separatorBefore: true },
          run: () => setPanelVisible((v) => !v),
        },
        ...TOOLBAR_IDS.map((id, index) => ({
          id: `toolbar.${id}`,
          label: `Toggle ${TOOLBAR_LABELS[id]}`,
          menu: {
            menu: 'view' as const,
            order: 40 + index,
            submenu: 'appearance',
            label: TOOLBAR_LABELS[id],
            separatorBefore: index === 0,
          },
          checked: chrome.toolbars[id],
          run: () => setChrome((prev) => toggleToolbar(prev, id)),
        })),
        {
          id: 'split',
          label: 'Toggle Split Editor',
          menu: { menu: 'view', order: 50, separatorBefore: true },
          run: () => setSplitEnabled((v) => !v),
        },
        {
          id: 'diff',
          label: 'Toggle Diff with Saved',
          menu: { menu: 'view', order: 51 },
          run: () => setShowDiff((v) => !v),
        },
        {
          id: 'outline',
          label: 'Toggle Outline',
          menu: { menu: 'view', order: 52 },
          run: () => setShowOutline((v) => !v),
        },
        {
          id: 'wrap',
          label: 'Toggle Word Wrap',
          menu: { menu: 'view', order: 53 },
          checked: settings.wordWrap,
          run: () =>
            setSettings((s) => {
              const next = { ...s, wordWrap: !s.wordWrap }
              saveSettings(next)
              return next
            }),
        },
        ...THEMES.map((theme, index) => ({
          id: `theme:${theme.id}`,
          label: `Color Theme: ${theme.name}`,
          menu: {
            menu: 'view' as const,
            order: 80,
            submenu: 'colorTheme',
            label: theme.name,
            separatorBefore: index === 0,
          },
          checked: settings.theme === theme.id,
          run: () =>
            setSettings((s) => {
              const next = { ...s, theme: theme.id }
              saveSettings(next)
              return next
            }),
        })),
        {
          id: 'quickOpen',
          label: 'Go to File…',
          accelerator: 'CmdOrCtrl+P',
          detail: shortcut('CmdOrCtrl+P'),
          menu: { menu: 'go', order: 10 },
          run: () => setQuickOpen(true),
        },
        {
          id: 'gotoLine',
          label: 'Go to Line…',
          accelerator: 'CmdOrCtrl+G',
          detail: shortcut('CmdOrCtrl+G'),
          menu: { menu: 'go', order: 11 },
          run: goToLine,
        },
        {
          id: 'gotoSymbol',
          label: 'Go to Symbol in File…',
          menu: { menu: 'go', order: 12 },
          run: () => setPaletteOpen(true),
        },
        {
          id: 'run',
          label: launch.selected ? `Run ${launch.selected}` : 'Run',
          menu: { menu: 'run', order: 10 },
          enabled: !!launch.selected && !running && !launch.busy,
          run: () => void launch.play(),
        },
        {
          id: 'stop',
          label: 'Stop',
          menu: { menu: 'run', order: 11 },
          enabled: running,
          run: () => void launch.stop(),
        },
        {
          id: 'runTask',
          label: launch.selectedTask ? `Run Task: ${launch.selectedTask}` : 'Run Task',
          menu: { menu: 'run', order: 20, separatorBefore: true },
          enabled: !!launch.selectedTask && !running && !launch.busy,
          run: () => void launch.runTask(),
        },
        {
          id: 'terminal',
          label: 'Focus Terminal',
          accelerator: 'CmdOrCtrl+`',
          detail: shortcut('CmdOrCtrl+`'),
          menu: { menu: 'terminal', order: 10 },
          run: () => {
            setPanelVisible(true)
            setBottomTab('terminal')
          },
        },
        {
          id: 'problems',
          label: 'Show Problems',
          menu: { menu: 'terminal', order: 11 },
          run: () => {
            setPanelVisible(true)
            setBottomTab('problems')
          },
        },
        {
          id: 'output',
          label: 'Show Output',
          menu: { menu: 'terminal', order: 12 },
          run: () => {
            setPanelVisible(true)
            setBottomTab('output')
          },
        },
        {
          id: 'settings',
          label: 'Open Settings',
          menu: { menu: 'help', order: 10 },
          run: () => setSettingsOpen(true),
        },
        {
          id: 'reloadPlugins',
          label: 'Reload Plugins',
          menu: { menu: 'help', order: 20, separatorBefore: true },
          run: pluginHost.reload,
        },
        {
          id: 'checkUpdates',
          label: 'Check for Updates',
          menu: { menu: 'help', order: 30, separatorBefore: true },
          run: checkForUpdates,
        },
        {
          id: 'installUpdate',
          label: 'Restart to Update',
          menu: { menu: 'help', order: 31 },
          enabled: updateState?.status === 'downloaded',
          run: installUpdate,
        },
        ...(focusedTab
          ? extractOutline(focusedTab.content, focusedTab.language).slice(0, 40).map((symbol) => ({
              id: `sym:${symbol.line}:${symbol.name}`,
              label: `Go to Symbol: ${symbol.name}`,
              detail: `${symbol.kind} :${symbol.line}`,
              palette: true,
              run: () => setReveal({ path: focusedTab.path, line: symbol.line, column: 1 }),
            }))
          : []),
      ]
    },
    [
      reopenClosed,
      saveAll,
      checkForUpdates,
      installUpdate,
      pluginHost.reload,
      goToLine,
      focusedTab,
      workspaceFolder.browseFolder,
      launch.selected,
      launch.selectedTask,
      launch.run?.status,
      launch.busy,
      launch.play,
      launch.stop,
      launch.runTask,
      chrome.toolbars,
      settings.wordWrap,
      settings.theme,
      updateState?.status,
    ],
  )

  const menuExtras = useMemo(
    () => ({ recentFolders: workspaceFolder.recentFolders, currentRoot: workspace?.root }),
    [workspaceFolder.recentFolders, workspace?.root],
  )
  const appMenu = useAppMenu(commands, menuExtras, (path) => void workspaceFolder.openPath(path))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (pendingChordRef.current && key === 's') {
        e.preventDefault()
        pendingChordRef.current = false
        void saveAll()
        return
      }
      if (mod && key === 'k') {
        e.preventDefault()
        pendingChordRef.current = true
        window.setTimeout(() => {
          pendingChordRef.current = false
        }, 1500)
        return
      }
      if (mod && key === 'g') {
        e.preventDefault()
        goToLine()
        return
      }
      if (e.altKey && e.shiftKey && key === 'f') {
        e.preventDefault()
        setFormatRequest((n) => n + 1)
        return
      }
      if (mod && !e.shiftKey && key === 'o') {
        e.preventDefault()
        void workspaceFolder.browseFolder()
        return
      }
      if (mod && e.shiftKey && key === 'p') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (mod && !e.shiftKey && key === 'p') {
        e.preventDefault()
        setQuickOpen(true)
        return
      }
      if (mod && e.shiftKey && key === 'f') {
        e.preventDefault()
        setActivity('search')
        return
      }
      if (mod && e.shiftKey && key === 't') {
        e.preventDefault()
        reopenClosed()
        return
      }
      if (mod && e.key === '`') {
        e.preventDefault()
        setPanelVisible(true)
        setBottomTab('terminal')
        return
      }
      if (mod && !e.shiftKey && key === 'l') {
        const sourceText = bottomPanelRef.current?.getSelectedTextOrAll().trim() ?? ''
        if (!sourceText) return
        e.preventDefault()
        chatPanelRef.current?.insertIntoComposer(sourceText)
        return
      }
      if (mod && e.shiftKey && key === 'e') {
        e.preventDefault()
        setActivity('files')
        return
      }
      if (mod && key === 'b') {
        e.preventDefault()
        setPanelVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reopenClosed, saveAll, goToLine, workspaceFolder.browseFolder])

  const shellStyle = {
    '--sidebar-width': `${layout.sidebarWidth}px`,
    '--chat-width': `${layout.chatWidth}px`,
    '--terminal-height': panelVisible ? `${layout.terminalHeight}px` : '0px',
  } as CSSProperties

  const leftPanel =
    layout.sidebarsDock === 'left'
      ? 'sidebar'
      : layout.documentsDock === 'left'
        ? 'editor'
        : 'chat'
  const middlePanel =
    layout.sidebarsDock === 'middle'
      ? 'sidebar'
      : layout.documentsDock === 'middle'
        ? 'editor'
        : 'chat'
  const rightPanel =
    layout.sidebarsDock === 'right'
      ? 'sidebar'
      : layout.documentsDock === 'right'
        ? 'editor'
        : 'chat'
  const bottomPanelClass =
    layout.bottomPanelDock === 'left'
      ? 'bottom-panel-dock-left'
      : layout.bottomPanelDock === 'middle'
        ? 'bottom-panel-dock-middle'
        : 'bottom-panel-dock-right'
  const chatDock =
    leftPanel === 'chat' ? 'left' : middlePanel === 'chat' ? 'middle' : 'right'

  return (
    <PluginHostContext.Provider value={pluginHost}>
    <div
      className={[
        'app-shell',
        panelVisible ? '' : 'panel-collapsed',
        chrome.toolbars.run ? '' : 'no-run-toolbar',
        appMenu.isElectron ? '' : 'has-html-menu',
      ].filter(Boolean).join(' ')}
      style={shellStyle}
    >
      {!appMenu.isElectron && (
        <AppMenuBar template={appMenu.template} onSelect={appMenu.runMenuItem} />
      )}
      {chrome.toolbars.run && (
        <TitleBar
          workspace={workspace}
          mru={workspaceFolder.mru}
          opening={workspaceFolder.opening}
          onBrowse={() => void workspaceFolder.browseFolder()}
          onOpenPath={(folder) => void workspaceFolder.openPath(folder)}
          configs={launch.configs}
          selected={launch.selected}
          onSelect={launch.setSelected}
          tasks={launch.tasks}
          selectedTask={launch.selectedTask}
          onSelectTask={launch.setSelectedTask}
          run={launch.run}
          busy={launch.busy}
          onPlay={() => void launch.play()}
          onStop={() => void launch.stop()}
          onRunTask={() => void launch.runTask()}
        />
      )}
      <div className={`app-main layout-${leftPanel}-${middlePanel}-${rightPanel}`}>
        <ActivityBar
          activity={activity}
          onChange={setActivity}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <aside className="sidebar">
          <div className="sidebar-header">
            <span>
              {activity === 'files' ? 'Explorer' : activity === 'search' ? 'Search' : activity === 'git' ? 'Git' : 'Chats'}
            </span>
            <select
              className="dock-select"
              value={layout.sidebarsDock}
              onChange={(e) => setDock('sidebarsDock', e.target.value as HorizontalDock)}
              aria-label="Dock sidebar"
            >
              <option value="left">Left</option>
              <option value="middle">Middle</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="sidebar-body">
            {activity === 'files' ? (
              <FileTree
                key={treeKey}
                selectedPath={activePath}
                respectGitignore={settings.respectGitignore}
                refreshKey={treeKey}
                onOpenFile={(p) => void openFile(p)}
                onRevealFolder={revealFolder}
                showToolbar={chrome.toolbars.explorer}
              />
            ) : activity === 'search' ? (
              <SearchPanel
                respectGitignore={settings.respectGitignore}
                onOpenAt={(path, line, column) => void openFile(path, undefined, line, column)}
                onReplaced={(paths) => void reloadPaths(paths)}
              />
            ) : activity === 'git' ? (
              <GitPanel
                onOutput={onOutput}
                refreshKey={gitRefreshKey}
                onOpenDiff={(p) => void openGitDiff(p)}
                showToolbar={chrome.toolbars.git}
              />
            ) : (
              <div className="muted" style={{ padding: 8, fontSize: 13 }}>
                Chat history lives in the right panel. Use + for a new chat, or Import from Cursor.
              </div>
            )}
          </div>
        </aside>

        <Splitter
          orientation="vertical"
          aria-label="Resize explorer"
          onDrag={resizeSidebar}
          onDragEnd={persistLayout}
        />

        <section className="editor-slot">
          <div className="editor-dock-bar">
            <span>Documents</span>
            <select
              className="dock-select"
              value={layout.documentsDock}
              onChange={(e) => setDock('documentsDock', e.target.value as HorizontalDock)}
              aria-label="Dock documents"
            >
              <option value="left">Left</option>
              <option value="middle">Middle</option>
              <option value="right">Right</option>
            </select>
          </div>
          <EditorArea
            tabs={tabs}
            activePath={activePath}
            secondaryPath={secondaryPath}
            activeGroup={activeGroup}
            splitEnabled={splitEnabled}
            showDiff={showDiff}
            showOutline={showOutline}
            settings={settings}
            onSelect={(path, group) => {
              const g = group ?? activeGroup
              setActiveGroup(g)
              if (g === 'secondary') setSecondaryPath(path)
              else setActivePath(path)
            }}
            onClose={closeTab}
            onChange={(path, content) => {
              setTabs((prev) =>
                prev.map((t) =>
                  t.path === path ? { ...t, content, dirty: content !== t.originalContent } : t,
                ),
              )
            }}
            onSaved={(file: FileContent) => {
              setTabs((prev) =>
                prev.map((t) =>
                  t.path === file.path
                    ? {
                        ...t,
                        content: file.content,
                        originalContent: file.content,
                        language: detectLanguageRef.current(file.path),
                        dirty: false,
                      }
                    : t,
                ),
              )
              setTreeKey((k) => k + 1)
              const rel = file.path.replace(/\\/g, '/')
              if (rel.startsWith('.mini-cursor/plugins/')) pluginHost.reload()
            }}
            onCursorChange={setCursor}
            onProblems={setEditorProblems}
            onToggleSplit={() => setSplitEnabled((v) => !v)}
            onToggleDiff={() => setShowDiff((v) => !v)}
            onToggleOutline={() => setShowOutline((v) => !v)}
            onRevealRequest={reveal}
            onRevealHandled={() => setReveal(null)}
            formatRequest={formatRequest}
            showToolbar={chrome.toolbars.editor}
            onBreadcrumbFolder={(folder) => {
              setActivity('files')
              setRevealFolder(folder)
            }}
          />
        </section>

        <Splitter
          orientation="vertical"
          aria-label="Resize chat"
          onDrag={resizeChat}
          onDragEnd={persistLayout}
        />

        <ChatPanel
          ref={chatPanelRef}
          activeFilePath={activePath}
          workspace={workspace}
          importOpen={importCursorOpen}
          onImportOpenChange={setImportCursorOpen}
          dock={chatDock}
          onDockChange={(dock) => setDock('sidebarsDock', dock)}
          onTurnChange={setChatTurn}
          showToolbar={chrome.toolbars.chat}
          onToolsDone={() => {
            const paths = tabsRef.current.filter((t) => !t.dirty).map((t) => t.path)
            void reloadPaths(paths)
          }}
        />
      </div>

      {panelVisible && (
        <Splitter
          orientation="horizontal"
          aria-label="Resize terminal"
          onDrag={resizeTerminal}
          onDragEnd={persistLayout}
        />
      )}

      {panelVisible && (
        <BottomPanel
          ref={bottomPanelRef}
          className={bottomPanelClass}
          tab={bottomTab}
          onTabChange={setBottomTab}
          output={terminal}
          runLabel={run?.configName}
          problems={problems}
          workspaceRoot={workspace?.root}
          onOpenProblem={(p) => void openFile(p.path, undefined, p.line, p.column)}
          onOpenLocation={(path, line, column) => void openFile(path, undefined, line, column)}
          dock={layout.bottomPanelDock}
          onDockChange={(dock) => setDock('bottomPanelDock', dock)}
        />
      )}

      <StatusBar
        language={focusedTab?.language}
        dirty={focusedTab?.dirty}
        cursor={cursor}
        problemCount={problems.length}
        turnIndicator={chatTurn}
        appVersion={appVersion}
        updateState={updateState}
        copilotStatus={copilotStatus}
        onInstallUpdate={installUpdate}
        onProblemsClick={() => {
          setPanelVisible(true)
          setBottomTab('problems')
        }}
      />

      <CommandPalette open={paletteOpen} commands={paletteCommands(commands)} onClose={() => setPaletteOpen(false)} />
      <QuickOpen
        open={quickOpen}
        respectGitignore={settings.respectGitignore}
        onClose={() => setQuickOpen(false)}
        onOpenFile={(p) => void openFile(p)}
      />
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
        appVersion={appVersion}
        updateState={updateState}
        onCheckForUpdates={checkForUpdates}
        onInstallUpdate={installUpdate}
      />
    </div>
    </PluginHostContext.Provider>
  )
}
