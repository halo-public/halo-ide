import { useEffect, useRef, type ReactNode } from 'react'

export type ContextMenuEntry =
  | {
      type: 'item'
      id: string
      label: string
      icon?: ReactNode
      disabled?: boolean
      onSelect: () => void
    }
  | { type: 'separator'; id: string }

interface Props {
  x: number
  y: number
  entries: ContextMenuEntry[]
  onClose: () => void
}

export function ContextMenu({ x, y, entries, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (entries.length === 0) return null

  return (
    <div
      className="context-menu"
      ref={menuRef}
      style={{ left: x, top: y }}
      role="menu"
    >
      {entries.map((entry) =>
        entry.type === 'separator' ? (
          <div key={entry.id} className="context-menu-sep" role="separator" />
        ) : (
          <button
            key={entry.id}
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              onClose()
              entry.onSelect()
            }}
          >
            {entry.icon}
            {entry.label}
          </button>
        ),
      )}
    </div>
  )
}
