import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { fuzzyFilter } from '../editorUtils'

function fileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? path
}

interface Props {
  open: boolean
  respectGitignore: boolean
  onClose: () => void
  onOpenFile: (path: string) => void
}

export function QuickOpen({ open, respectGitignore, onClose, onOpenFile }: Props) {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    void api.listTree(respectGitignore).then(setFiles).catch(() => setFiles([]))
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open, respectGitignore])

  const filtered = useMemo(
    () => fuzzyFilter(files, query, (f) => f, 60),
    [files, query],
  )

  useEffect(() => setIndex(0), [query])

  if (!open) return null

  const choose = (path: string) => {
    onClose()
    onOpenFile(path)
  }

  return (
    <div className="overlay-backdrop" onMouseDown={onClose}>
      <div
        className="overlay-panel"
        role="dialog"
        aria-label="Go to file"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="overlay-input"
          placeholder="Search files by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(filtered.length - 1, i + 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(0, i - 1))
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              const path = filtered[index]
              if (path) choose(path)
            }
          }}
        />
        <div className="overlay-list">
          {filtered.length === 0 && <div className="overlay-empty">No files found</div>}
          {filtered.map((path, i) => (
            <button
              key={path}
              className={`overlay-item ${i === index ? 'active' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(path)}
            >
              <span className="overlay-label">{fileName(path)}</span>
              <span className="overlay-detail">{path}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
