import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { wsUrl } from '../api/client'

interface Props {
  active: boolean
  workspaceRoot?: string
}

export interface InteractiveTerminalHandle {
  getSelectionOrBuffer: () => string
}

export const InteractiveTerminal = forwardRef<InteractiveTerminalHandle, Props>(function InteractiveTerminal(
  { active, workspaceRoot }: Props,
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      getSelectionOrBuffer: () => {
        const term = termRef.current
        if (!term) return ''
        const selection = term.getSelection()
        if (selection) return selection
        const lines: string[] = []
        for (let i = 0; i < term.buffer.active.length; i += 1) {
          lines.push(term.buffer.active.getLine(i)?.translateToString(true) ?? '')
        }
        return lines.join('\n')
      },
    }),
    [],
  )

  useEffect(() => {
    if (!hostRef.current || termRef.current) return

    const term = new XTerm({
      convertEol: true,
      fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
      fontSize: 12,
      theme: {
        background: '#12151b',
        foreground: '#c8d0dc',
        cursor: '#58a6ff',
      },
      cursorBlink: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const sendResize = () => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }

    const connect = () => {
      const ws = new WebSocket(wsUrl('/api/terminal'))
      wsRef.current = ws
      ws.onopen = () => {
        term.writeln('\x1b[90mConnected to shell.\x1b[0m')
        fit.fit()
        sendResize()
      }
      ws.onmessage = (ev) => {
        term.write(typeof ev.data === 'string' ? ev.data : '')
      }
      ws.onclose = () => {
        term.writeln('\r\n\x1b[90mShell disconnected.\x1b[0m')
      }
      ws.onerror = () => {
        term.writeln('\r\n\x1b[31mShell connection error.\x1b[0m')
      }
    }

    connect()

    term.onData((data) => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ data }))
      }
    })

    term.onResize(() => {
      sendResize()
    })

    const onWindowResize = () => {
      fit.fit()
      sendResize()
    }
    window.addEventListener('resize', onWindowResize)

    return () => {
      window.removeEventListener('resize', onWindowResize)
      wsRef.current?.close()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    if (active) {
      fitRef.current?.fit()
      const term = termRef.current
      const ws = wsRef.current
      if (term && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
      termRef.current?.focus()
    }
  }, [active, workspaceRoot])

  return <div className="xterm-host" ref={hostRef} data-active={active} />
})
