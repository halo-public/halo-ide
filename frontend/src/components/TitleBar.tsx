import { ChevronDown, FolderOpen, ListTodo, Play, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LaunchConfig, LaunchRun, TaskConfig, WorkspaceInfo } from '../api/types'
import { folderLabel } from '../workspaceMru'

interface Props {
  workspace: WorkspaceInfo | null
  mru: string[]
  opening: boolean
  onBrowse: () => void
  onOpenPath: (folder: string) => void
  configs: LaunchConfig[]
  selected: string
  onSelect: (name: string) => void
  tasks: TaskConfig[]
  selectedTask: string
  onSelectTask: (label: string) => void
  run: LaunchRun | null
  busy: boolean
  onPlay: () => void
  onStop: () => void
  onRunTask: () => void
}

export function TitleBar({
  workspace,
  mru,
  opening,
  onBrowse,
  onOpenPath,
  configs,
  selected,
  onSelect,
  tasks,
  selectedTask,
  onSelectTask,
  run,
  busy,
  onPlay,
  onStop,
  onRunTask,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  return (
    <header className="titlebar">
      <div className="mru-dropdown" ref={menuRef}>
        <div className="mru-trigger">
          <button
            className="primary-btn mru-main"
            onClick={() => {
              setMenuOpen(false)
              onBrowse()
            }}
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
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenPath(folder)
                  }}
                  title={folder}
                >
                  <span className="mru-name">{folderLabel(folder)}</span>
                  <span className="mru-path">{folder}</span>
                </button>
              ))
            )}
            <div className="mru-sep" />
            <button
              className="mru-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                onBrowse()
              }}
            >
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
        <select value={selected} onChange={(e) => onSelect(e.target.value)} disabled={!configs.length}>
          {configs.length === 0 && <option value="">No launch configs</option>}
          {configs.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {run?.status === 'running' ? (
          <button className="primary-btn" onClick={onStop} title="Stop">
            <Square size={14} />
            Stop
          </button>
        ) : (
          <button className="primary-btn play" onClick={onPlay} disabled={!selected || busy} title="Run">
            <Play size={14} />
            Run
          </button>
        )}
        <select
          value={selectedTask}
          onChange={(e) => onSelectTask(e.target.value)}
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
          onClick={onRunTask}
          disabled={!selectedTask || busy || run?.status === 'running'}
          title="Run Task"
        >
          <ListTodo size={14} />
          Task
        </button>
      </div>
    </header>
  )
}
