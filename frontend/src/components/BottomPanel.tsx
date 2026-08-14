import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import type { ProblemItem } from '../api/types'
import {
  loadBottomTabOrder,
  saveBottomTabOrder,
  type BottomTab,
} from '../bottomTabPrefs'
import type { HorizontalDock } from '../layoutPrefs'
import { InteractiveTerminal, type InteractiveTerminalHandle } from './InteractiveTerminal'

export type { BottomTab }

const DRAG_MIME = 'application/x-mini-cursor-bottom-tab'

interface Props {
  className?: string
  tab: BottomTab
  onTabChange: (tab: BottomTab) => void
  output: string
  runLabel?: string
  problems: ProblemItem[]
  workspaceRoot?: string
  onOpenProblem: (problem: ProblemItem) => void
  dock: HorizontalDock
  onDockChange: (dock: HorizontalDock) => void
}

export interface BottomPanelHandle {
  getSelectedTextOrAll: () => string
}

function moveTab(order: BottomTab[], from: BottomTab, to: BottomTab): BottomTab[] {
  if (from === to) return order
  const fromIdx = order.indexOf(from)
  const toIdx = order.indexOf(to)
  if (fromIdx < 0 || toIdx < 0) return order
  const next = [...order]
  next.splice(fromIdx, 1)
  next.splice(toIdx, 0, from)
  return next
}

export const BottomPanel = forwardRef<BottomPanelHandle, Props>(function BottomPanel({
  className,
  tab,
  onTabChange,
  output,
  runLabel,
  problems,
  workspaceRoot,
  onOpenProblem,
  dock,
  onDockChange,
}: Props, ref) {
  const outputRef = useRef<HTMLPreElement>(null)
  const terminalRef = useRef<InteractiveTerminalHandle>(null)
  const [tabOrder, setTabOrder] = useState<BottomTab[]>(() => loadBottomTabOrder())
  const [draggingTab, setDraggingTab] = useState<BottomTab | null>(null)
  const [dragOverTab, setDragOverTab] = useState<BottomTab | null>(null)
  const didDragRef = useRef(false)

  useImperativeHandle(
    ref,
    () => ({
      getSelectedTextOrAll: () => {
        if (tab === 'terminal') return terminalRef.current?.getSelectionOrBuffer() ?? ''
        if (tab !== 'output') return ''
        const selection = window.getSelection()?.toString() ?? ''
        return selection || outputRef.current?.innerText || ''
      },
    }),
    [tab, output],
  )

  const tabLabel = (id: BottomTab) => {
    if (id === 'output') return `Output${runLabel ? ` — ${runLabel}` : ''}`
    if (id === 'terminal') return 'Terminal'
    return `Problems${problems.length ? ` (${problems.length})` : ''}`
  }

  const onTabDragStart = (id: BottomTab) => (e: DragEvent<HTMLButtonElement>) => {
    didDragRef.current = false
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DRAG_MIME, id)
    e.dataTransfer.setData('text/plain', id)
    setDraggingTab(id)
  }

  const onTabDragOver = (id: BottomTab) => (e: DragEvent<HTMLButtonElement>) => {
    const types = Array.from(e.dataTransfer.types)
    if (!draggingTab && !types.includes(DRAG_MIME) && !types.includes('text/plain')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverTab !== id) setDragOverTab(id)
  }

  const onTabDrop = (id: BottomTab) => (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const from = (e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')) as BottomTab
    setDragOverTab(null)
    setDraggingTab(null)
    if (!from || from === id) return
    didDragRef.current = true
    setTabOrder((prev) => {
      const next = moveTab(prev, from, id)
      saveBottomTabOrder(next)
      return next
    })
  }

  const onTabDragEnd = () => {
    setDraggingTab(null)
    setDragOverTab(null)
  }

  const onTabClick = (id: BottomTab) => {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    onTabChange(id)
  }

  return (
    <section className={`bottom-panel${className ? ` ${className}` : ''}`}>
      <div className="bottom-tabs">
        {tabOrder.map((id) => (
          <button
            key={id}
            type="button"
            draggable
            className={[
              'bottom-tab',
              tab === id ? 'active-tab' : '',
              draggingTab === id ? 'is-dragging' : '',
              dragOverTab === id && draggingTab !== id ? 'drag-over' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onTabClick(id)}
            onDragStart={onTabDragStart(id)}
            onDragOver={onTabDragOver(id)}
            onDrop={onTabDrop(id)}
            onDragEnd={onTabDragEnd}
            onDragLeave={() => {
              if (dragOverTab === id) setDragOverTab(null)
            }}
            title="Drag to reorder"
          >
            {tabLabel(id)}
          </button>
        ))}
        <span className="bottom-tabs-spacer" />
        <select
          className="dock-select"
          value={dock}
          onChange={(e) => onDockChange(e.target.value as HorizontalDock)}
          aria-label="Dock bottom panel"
        >
          <option value="left">Left</option>
          <option value="middle">Middle</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div className="bottom-body">
        {tab === 'output' && <pre className="terminal-output" ref={outputRef}>{output}</pre>}
        <div className={tab === 'terminal' ? 'terminal-visible' : 'terminal-hidden'}>
          <InteractiveTerminal ref={terminalRef} active={tab === 'terminal'} workspaceRoot={workspaceRoot} />
        </div>
        {tab === 'problems' && (
          <div className="problems-list">
            {problems.length === 0 ? (
              <div className="muted" style={{ padding: 10, fontSize: 12 }}>
                No problems detected
              </div>
            ) : (
              problems.map((p) => (
                <button
                  key={p.id}
                  className={`problem-item severity-${p.severity}`}
                  onClick={() => onOpenProblem(p)}
                >
                  <span className="problem-sev">{p.severity}</span>
                  <span className="problem-msg">{p.message}</span>
                  <span className="problem-loc">
                    {p.path}:{p.line}:{p.column}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  )
})
