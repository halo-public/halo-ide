import { useEffect, useMemo, useRef, useState } from 'react'
import { fuzzyFilter } from '../editorUtils'
import type { AppCommand } from '../appMenu'

export type Command = AppCommand

interface Props {
  open: boolean
  commands: Command[]
  onClose: () => void
}

export function CommandPalette({ open, commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(
    () => fuzzyFilter(commands, query, (c) => `${c.label} ${c.detail ?? ''}`, 40),
    [commands, query],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    setIndex(0)
  }, [query])

  if (!open) return null

  const runAt = (i: number) => {
    const cmd = filtered[i]
    if (!cmd) return
    onClose()
    cmd.run()
  }

  return (
    <div className="overlay-backdrop" onMouseDown={onClose}>
      <div
        className="overlay-panel"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="overlay-input"
          placeholder="Type a command…"
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
              runAt(index)
            }
          }}
        />
        <div className="overlay-list">
          {filtered.length === 0 && <div className="overlay-empty">No matching commands</div>}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`overlay-item ${i === index ? 'active' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => runAt(i)}
            >
              <span className="overlay-label">{cmd.label}</span>
              {cmd.detail && <span className="overlay-detail">{cmd.detail}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
