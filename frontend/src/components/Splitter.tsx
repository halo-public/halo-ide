import { useCallback, useRef, type PointerEvent } from 'react'

type Orientation = 'vertical' | 'horizontal'

type SplitterProps = {
  orientation: Orientation
  /** Positive delta follows pointer movement (right / down). */
  onDrag: (deltaPx: number) => void
  onDragEnd?: () => void
  'aria-label'?: string
}

export function Splitter({
  orientation,
  onDrag,
  onDragEnd,
  'aria-label': ariaLabel,
}: SplitterProps) {
  const dragging = useRef(false)
  const lastPos = useRef(0)

  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    document.body.classList.remove(
      orientation === 'vertical' ? 'is-resizing-col' : 'is-resizing-row',
    )
    onDragEnd?.()
  }, [onDragEnd, orientation])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragging.current = true
    lastPos.current = orientation === 'vertical' ? e.clientX : e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.classList.add(
      orientation === 'vertical' ? 'is-resizing-col' : 'is-resizing-row',
    )
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const pos = orientation === 'vertical' ? e.clientX : e.clientY
    const delta = pos - lastPos.current
    lastPos.current = pos
    if (delta !== 0) onDrag(delta)
  }

  return (
    <div
      className={`splitter splitter-${orientation === 'vertical' ? 'v' : 'h'}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  )
}
