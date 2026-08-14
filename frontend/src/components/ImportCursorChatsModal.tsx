import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { CursorChatImportCandidate } from '../api/types'

interface Props {
  open: boolean
  onClose: () => void
  onImported: (chatIds: string[]) => void
}

export function ImportCursorChatsModal({ open, onClose, onImported }: Props) {
  const [candidates, setCandidates] = useState<CursorChatImportCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [currentWorkspaceOnly, setCurrentWorkspaceOnly] = useState(true)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(new Set())
    setError(null)
    setLoading(true)
    api
      .listCursorChats(currentWorkspaceOnly)
      .then((list) => setCandidates(list))
      .catch((e: Error) => {
        setCandidates([])
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }, [open, currentWorkspaceOnly])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter((c) => {
      const hay = `${c.title} ${c.subtitle ?? ''} ${c.workspacePath ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [candidates, query])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id))

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const c of filtered) next.delete(c.id)
      } else {
        for (const c of filtered) next.add(c.id)
      }
      return next
    })
  }

  const importSelected = async () => {
    if (selected.size === 0 || importing) return
    setImporting(true)
    setError(null)
    try {
      const imported = await api.importCursorChats([...selected])
      if (imported.length === 0) {
        setError('No messages could be imported from the selected chats.')
        return
      }
      onImported(imported.map((c) => c.id))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="overlay-backdrop" onMouseDown={onClose}>
      <div
        className="overlay-panel import-cursor-panel"
        role="dialog"
        aria-label="Import Cursor chats"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-header" style={{ padding: '12px 16px 0' }}>
          <h3>Import from Cursor</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <input
          className="overlay-input"
          placeholder="Filter by title, subtitle, or workspace…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="import-cursor-toolbar">
          <label className="settings-row checkbox" style={{ padding: 0 }}>
            <input
              type="checkbox"
              checked={currentWorkspaceOnly}
              onChange={(e) => setCurrentWorkspaceOnly(e.target.checked)}
            />
            <span>This workspace only</span>
          </label>
          <button className="text-btn" onClick={toggleAllFiltered} disabled={filtered.length === 0}>
            {allFilteredSelected ? 'Clear visible' : 'Select visible'}
          </button>
        </div>

        <div className="overlay-list import-cursor-list">
          {loading && <div className="overlay-empty">Loading Cursor chats…</div>}
          {!loading && filtered.length === 0 && (
            <div className="overlay-empty">
              {error ? error : 'No Cursor chats found.'}
            </div>
          )}
          {!loading &&
            filtered.map((c) => (
              <label key={c.id} className={`import-cursor-item ${selected.has(c.id) ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span className="import-cursor-meta">
                  <span className="overlay-label">{c.title}</span>
                  {c.subtitle && <span className="overlay-detail">{c.subtitle}</span>}
                  <span className="overlay-detail">
                    {formatWhen(c.updatedAt)}
                    {c.workspacePath ? ` · ${folderLabel(c.workspacePath)}` : ''}
                    {c.mode ? ` · ${c.mode}` : ''}
                  </span>
                </span>
              </label>
            ))}
        </div>

        {error && !loading && filtered.length > 0 && (
          <div className="error-text" style={{ padding: '0 16px 8px' }}>
            {error}
          </div>
        )}

        <div className="import-cursor-footer">
          <span className="muted">{selected.size} selected</span>
          <div className="import-cursor-footer-actions">
            <button className="text-btn" onClick={onClose} disabled={importing}>
              Cancel
            </button>
            <button
              className="primary-btn"
              onClick={() => void importSelected()}
              disabled={selected.size === 0 || importing}
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function folderLabel(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}
