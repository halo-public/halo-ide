import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { api } from './api/client'
import type { EditorCursor, FileContent, LaunchRun, ProblemItem, WorkspaceInfo } from './api/types'
import { ActivityBar, type Activity } from './components/ActivityBar'
import { BottomPanel, type BottomPanelHandle, type BottomTab } from './components/BottomPanel'
import { ChatPanel, type ChatPanelHandle, type ChatTurnIndicator } from './components/ChatPanel'
import { CommandPalette, type Command } from './components/CommandPalette'
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
import { rememberWorkspace } from './workspaceMru'

export default function App() {
  const appTitle = 'Mini Cursor'
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
  const [revealFolder, setRevealFolder] = useState<string | null>(null)
  const [layout, setLayout] = useState<LayoutPrefs>(() => loadLayout())
  const [settings, setSettings] = useState<EditorSettings>(() => loadSettings())
  const [cursor, setCursor] = useState<EditorCursor | null>(null)
  const [problems, setProblems] = useState<ProblemItem[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importCursorOpen, setImportCursorOpen] = useState(false)
  const [reveal, setReveal] = useState<{ path: string; line: number; column?: number } | null>(null)
  const [chatTurn, setChatTurn] = useState<ChatTurnIndicator | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const bottomPanelRef = useRef<BottomPanelHandle>(null)
  const chatPanelRef = useRef<ChatPanelHandle>(null)

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
      language: file.language,
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

  const saveAll = useCallback(async () => {
    for (const tab of tabsRef.current.filter((t) => t.dirty)) {
      try {
        const saved = await api.writeFile(tab.path, tab.content)
        setTabs((prev) =>
          prev.map((t) =>
            t.path === saved.path
              ? { ...t, content: saved.content, originalContent: saved.content, language: saved.language, dirty: false }
              : t,
          ),
        )
      } catch (e) {
        setTerminal(`Save failed for ${tab.path}: ${(e as Error).message}\n`)
        setBottomTab('output')
      }
    }
  }, [])

  const onOutput = useCallback((text: string, nextRun: LaunchRun | null) => {
    setRun(nextRun)
    const header = nextRun
      ? `[${nextRun.configName}] ${nextRun.status}${nextRun.exitCode != null ? ` (exit ${nextRun.exitCode})` : ''}\n`
      : ''
    setTerminal(header + (text || '(no output yet)\n'))
    setBottomTab('output')
    setPanelVisible(true)
  }, [])

  const commands: Command[] = useMemo(
    () => [
      { id: 'quickOpen', label: 'Go to File…', detail: 'Ctrl+P', run: () => setQuickOpen(true) },
      { id: 'search', label: 'Search in Workspace', detail: 'Ctrl+Shift+F', run: () => setActivity('search') },
      { id: 'git', label: 'Show Git', run: () => setActivity('git') },
      { id: 'save', label: 'Save', detail: 'Ctrl+S', run: () => void saveAll() },
      { id: 'saveAll', label: 'Save All', detail: 'Ctrl+K S', run: () => void saveAll() },
      { id: 'reopen', label: 'Reopen Closed Editor', detail: 'Ctrl+Shift+T', run: reopenClosed },
      { id: 'split', label: 'Toggle Split Editor', run: () => setSplitEnabled((v) => !v) },
      { id: 'diff', label: 'Toggle Diff with Saved', run: () => setShowDiff((v) => !v) },
      { id: 'outline', label: 'Toggle Outline', run: () => setShowOutline((v) => !v) },
      { id: 'wrap', label: 'Toggle Word Wrap', run: () => setSettings((s) => {
        const next = { ...s, wordWrap: !s.wordWrap }
        saveSettings(next)
        return next
      }) },
      { id: 'terminal', label: 'Focus Terminal', detail: 'Ctrl+`', run: () => { setPanelVisible(true); setBottomTab('terminal') } },
      { id: 'problems', label: 'Show Problems', run: () => { setPanelVisible(true); setBottomTab('problems') } },
      { id: 'togglePanel', label: 'Toggle Panel', run: () => setPanelVisible((v) => !v) },
      { id: 'settings', label: 'Open Settings', run: () => setSettingsOpen(true) },
      { id: 'importCursorChats', label: 'Import Chats from Cursor…', run: () => setImportCursorOpen(true) },
      { id: 'explorer', label: 'Show Explorer', run: () => setActivity('files') },
    ],
    [reopenClosed, saveAll],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
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
  }, [reopenClosed])

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
    <div className={`app-shell ${panelVisible ? '' : 'panel-collapsed'}`} style={shellStyle}>
      <TitleBar
        workspace={workspace}
        onWorkspaceChange={onWorkspaceChange}
        onOutput={onOutput}
      />
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
              />
            ) : activity === 'search' ? (
              <SearchPanel
                respectGitignore={settings.respectGitignore}
                onOpenAt={(path, line, column) => void openFile(path, undefined, line, column)}
              />
            ) : activity === 'git' ? (
              <GitPanel onOutput={onOutput} />
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
                        language: file.language,
                        dirty: false,
                      }
                    : t,
                ),
              )
              setTreeKey((k) => k + 1)
            }}
            onCursorChange={setCursor}
            onProblems={setProblems}
            onToggleSplit={() => setSplitEnabled((v) => !v)}
            onToggleDiff={() => setShowDiff((v) => !v)}
            onToggleOutline={() => setShowOutline((v) => !v)}
            onRevealRequest={reveal}
            onRevealHandled={() => setReveal(null)}
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
        onProblemsClick={() => {
          setPanelVisible(true)
          setBottomTab('problems')
        }}
      />

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
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
      />
    </div>
  )
}
