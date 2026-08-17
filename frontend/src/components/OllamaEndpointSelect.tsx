import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  formatOllamaHost,
  loadOllamaUrlMru,
  LOCAL_OLLAMA,
  normalizeOllamaUrl,
  ollamaUrlPresets,
  rememberOllamaUrl,
} from '../ollamaModels'

interface Props {
  value: string
  onChange: (url: string) => void
  variant?: 'compact' | 'field'
}

export function OllamaEndpointSelect({ value, onChange, variant = 'compact' }: Props) {
  const [open, setOpen] = useState(false)
  const [mru, setMru] = useState<string[]>(() => loadOllamaUrlMru())
  const [custom, setCustom] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const presets = useMemo(() => ollamaUrlPresets(mru), [mru])
  const current = normalizeOllamaUrl(value) || LOCAL_OLLAMA
  const currentHost = formatOllamaHost(value)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const apply = (url: string) => {
    const next = normalizeOllamaUrl(url)
    if (!next) return false
    onChange(next)
    setMru(rememberOllamaUrl(next))
    setOpen(false)
    setCustom('')
    return true
  }

  const submitCustom = (event?: FormEvent) => {
    event?.preventDefault()
    apply(custom)
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
  }

  return (
    <div className={`ollama-endpoint-select ${variant}`} ref={rootRef}>
      <button
        type="button"
        className="ollama-endpoint-trigger"
        aria-label="Ollama endpoint"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current || currentHost}
        onClick={() => setOpen((next) => !next)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="ollama-endpoint-host">{currentHost}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="mru-menu ollama-endpoint-menu" role="listbox" aria-label="Ollama endpoints">
          {presets.map((item) => {
            const active = current.toLowerCase() === item.url.toLowerCase()
            return (
              <button
                key={`${item.kind}:${item.url}`}
                type="button"
                className={`mru-item ${active ? 'active' : ''}`}
                role="option"
                aria-selected={active}
                onClick={() => apply(item.url)}
              >
                <span className="mru-name">{item.kind === 'recent' ? formatOllamaHost(item.url) : item.label}</span>
                <span className="mru-path">{item.kind === 'recent' ? item.url : formatOllamaHost(item.url)}</span>
              </button>
            )
          })}
          <form className="ollama-endpoint-custom" onSubmit={submitCustom}>
            <input
              type="text"
              spellCheck={false}
              placeholder="Add host, e.g. 10.0.0.8:11434"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              aria-label="Custom Ollama endpoint"
            />
            <button type="submit" className="primary-btn" disabled={!custom.trim()}>
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
