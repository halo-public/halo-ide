import { ChevronDown, FolderOpen, ListTodo, Play, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { CopilotStatus, LaunchConfig, LaunchRun, TaskConfig, WorkspaceInfo } from '../api/types'
import { folderLabel, getWorkspaceMru, rememberWorkspace } from '../workspaceMru'

interface Props {
  workspace: WorkspaceInfo | null
  onWorkspaceChange: (workspace: WorkspaceInfo) => void
  onOutput: (text: string, run: LaunchRun | null) => void
}

export function TitleBar({ workspace, onWorkspaceChange, onOutput }: Props) {
  const [configs, setConfigs] = useState<LaunchConfig[]>([])
  const [tasks, setTasks] = useState<TaskConfig[]>([])
  const [selected, setSelected] = useState('')
  const [selectedTask, setSelectedTask] = useState('')
  const [run, setRun] = useState<LaunchRun | null>(null)
  const [status, setStatus] = useState<CopilotStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [mru, setMru] = useState<string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const refreshMru = async () => {
    try {
      setMru(await getWorkspaceMru())
    } catch {
      setMru([])
    }
  }

  useEffect(() => {
    void refreshMru()
  }, [workspace?.root])

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    api.getLaunchConfigs().then((list) => {
      setConfigs(list)
      setSelected((prev) => (list.some((c) => c.name === prev) ? prev : list[0]?.name ?? ''))
    }).catch(() => setConfigs([]))

    api.getTasks().then((list) => {
      setTasks(list)
      setSelectedTask((prev) => (list.some((t) => t.label === prev) ? prev : list[0]?.label ?? ''))
    }).catch(() => setTasks([]))

    api.getCopilotStatus().then(setStatus).catch(() => setStatus(null))
  }, [workspace?.root])

  useEffect(() => {
    if (!run || run.status !== 'running') return
    const timer = setInterval(async () => {
      try {
        const latest = await api.getLaunchOutput(run.id)
        onOutput(latest.output, run)
        const next = await api.getLaunchRun(run.id)
        setRun(next)
        if (next.status !== 'running') {
          const out = await api.getLaunchOutput(next.id)
          onOutput(out.output, next)
        }
      } catch {
        /* ignore */
      }
    }, 500)
    return () => clearInterval(timer)
  }, [run, onOutput])

  const play = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const started = await api.startLaunch(selected)
      setRun(started)
      onOutput('', started)
    } catch (e) {
      onOutput(e instanceof Error ? e.message : 'Failed to start', null)
    } finally {
      setBusy(false)
    }
  }

  const runTask = async () => {
    if (!selectedTask) return
    setBusy(true)
    try {
      const started = await api.startTask(selectedTask)
      setRun(started)
      onOutput('', started)
    } catch (e) {
      onOutput(e instanceof Error ? e.message : 'Failed to start task', null)
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    if (!run) return
    await api.stopLaunch(run.id)
    const out = await api.getLaunchOutput(run.id)
    const stopped = { ...run, status: 'failed' }
    setRun(stopped)
    onOutput(out.output, stopped)
  }

  const openPath = async (folder: string) => {
    setOpening(true)
    setMenuOpen(false)
    try {
      const next = await api.setWorkspace(folder)
      setMru(await rememberWorkspace(next.root))
      onWorkspaceChange(next)
    } catch (e) {
      onOutput(e instanceof Error ? e.message : 'Failed to open folder', null)
      await refreshMru()
    } finally {
      setOpening(false)
    }
  }

  const browseFolder = async () => {
    setMenuOpen(false)
    try {
      let folder: string | null = null
      if (window.miniCursor?.openWorkspaceFolder) {
        folder = await window.miniCursor.openWorkspaceFolder()
      } else {
        folder = window.prompt('Enter workspace folder path')?.trim() || null
      }
      if (!folder) return
      await openPath(folder)
    } catch (e) {
      onOutput(e instanceof Error ? e.message : 'Failed to open folder', null)
    }
  }

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <img className="titlebar-icon" src={`${import.meta.env.BASE_URL}icon.png`} alt="" width={18} height={18} />
        <span>Mini Cursor</span>
      </div>

      <div className="mru-dropdown" ref={menuRef}>
        <div className="mru-trigger">
          <button
            className="primary-btn mru-main"
            onClick={() => void browseFolder()}
            disabled={opening}
            title="Open Folder"
          >
            <FolderOpen size={14} />
            Open Folder
          </button>
          <button
            className="primary-btn mru-chevron"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={opening}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="Recent folders"
          >
            <ChevronDown size={14} />
          </button>
        </div>
        {menuOpen && (
          <div className="mru-menu" role="menu">
            {mru.length === 0 ? (
              <div className="mru-empty">No recent folders</div>
            ) : (
              mru.map((folder) => (
                <button
                  key={folder}
                  className={`mru-item ${workspace?.root === folder ? 'active' : ''}`}
                  role="menuitem"
                  onClick={() => void openPath(folder)}
                  title={folder}
                >
                  <span className="mru-name">{folderLabel(folder)}</span>
                  <span className="mru-path">{folder}</span>
                </button>
              ))
            )}
            <div className="mru-sep" />
            <button className="mru-item" role="menuitem" onClick={() => void browseFolder()}>
              <span className="mru-name">Browse…</span>
            </button>
          </div>
        )}
      </div>

      <div className="titlebar-workspace" title={workspace?.root}>
        {workspace?.name ?? 'No workspace'}
      </div>
      <div className="titlebar-spacer" />
      <div className="launch-controls">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!configs.length}>
          {configs.length === 0 && <option value="">No launch configs</option>}
          {configs.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {run?.status === 'running' ? (
          <button className="primary-btn" onClick={() => void stop()} title="Stop">
            <Square size={14} />
            Stop
          </button>
        ) : (
          <button className="primary-btn play" onClick={() => void play()} disabled={!selected || busy} title="Run">
            <Play size={14} />
            Run
          </button>
        )}
        <select
          value={selectedTask}
          onChange={(e) => setSelectedTask(e.target.value)}
          disabled={!tasks.length}
          title="Tasks"
        >
          {tasks.length === 0 && <option value="">No tasks</option>}
          {tasks.map((t) => (
            <option key={t.label} value={t.label}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          className="primary-btn"
          onClick={() => void runTask()}
          disabled={!selectedTask || busy || run?.status === 'running'}
          title="Run Task"
        >
          <ListTodo size={14} />
          Task
        </button>
      </div>
      <div className="status-pill" title={status?.message ?? ''}>
        <span className={`status-dot ${status?.connected ? 'on' : 'off'}`} />
        Copilot {status?.connected ? 'connected' : 'offline'}
      </div>
    </header>
  )
}
