import { useEffect, useRef, useState } from 'react'
import { MENU_LABELS, type MenuName, type MenuTemplateItem } from '../appMenu'

interface Props {
  template: MenuTemplateItem[]
  onSelect: (item: MenuTemplateItem) => void
}

export function AppMenuBar({ template, onSelect }: Props) {
  const [open, setOpen] = useState<MenuName | null>(null)
  const barRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <nav className="app-menubar" ref={barRef} aria-label="Application menu">
      {template.map((menu) => {
        const name = Object.entries(MENU_LABELS).find(([, label]) => label === menu.label)?.[0] as MenuName | undefined
        const isOpen = name != null && open === name
        return (
          <div key={menu.label} className="app-menubar-item">
            <button
              className={`app-menubar-btn ${isOpen ? 'open' : ''}`}
              onClick={() => setOpen(isOpen ? null : name ?? null)}
              onMouseEnter={() => {
                if (open && name) setOpen(name)
              }}
            >
              {menu.label}
            </button>
            {isOpen && menu.submenu && (
              <MenuPanel
                items={menu.submenu}
                onSelect={(item) => {
                  setOpen(null)
                  onSelect(item)
                }}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}

function MenuPanel({
  items,
  onSelect,
  nested = false,
}: {
  items: MenuTemplateItem[]
  onSelect: (item: MenuTemplateItem) => void
  nested?: boolean
}) {
  return (
    <div className={`app-menubar-panel ${nested ? 'nested' : ''}`} role="menu">
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <div key={`sep-${index}`} className="app-menubar-sep" />
        }
        if (item.submenu) {
          return (
            <div key={item.label ?? index} className="app-menubar-sub">
              <div className="app-menubar-row sub-label">
                <span>{item.label}</span>
                <span className="app-menubar-caret">›</span>
              </div>
              <MenuPanel items={item.submenu} onSelect={onSelect} nested />
            </div>
          )
        }
        const disabled = item.enabled === false
        return (
          <button
            key={`${item.id ?? item.role ?? item.label}-${index}`}
            className="app-menubar-row"
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              if (!disabled && (item.id || item.role)) onSelect(item)
            }}
          >
            <span className="app-menubar-check">{item.checked ? '✓' : ''}</span>
            <span className="app-menubar-label">{item.label}</span>
            {item.accelerator && <span className="app-menubar-accel">{item.accelerator.replaceAll('CmdOrCtrl', 'Ctrl')}</span>}
          </button>
        )
      })}
    </div>
  )
}
