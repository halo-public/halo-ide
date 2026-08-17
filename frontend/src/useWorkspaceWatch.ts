import { useEffect, useRef } from 'react'
import { wsUrl } from './api/client'

export interface WorkspaceWatchEvent {
  type: string
  path: string
  isDirectory: boolean
  oldPath?: string | null
}

export function useWorkspaceWatch(
  workspaceRoot: string | undefined,
  onEvents: (events: WorkspaceWatchEvent[]) => void,
) {
  const onEventsRef = useRef(onEvents)
  onEventsRef.current = onEvents

  useEffect(() => {
    if (!workspaceRoot) return
    let closed = false
    let socket: WebSocket | null = null
    let reconnect: number | undefined

    const connect = () => {
      if (closed) return
      const ws = new WebSocket(wsUrl('/api/workspace/watch'))
      socket = ws
      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as WorkspaceWatchEvent[]
          if (Array.isArray(payload) && payload.length) onEventsRef.current(payload)
        } catch {
          /* ignore malformed */
        }
      }
      ws.onclose = () => {
        if (closed) return
        reconnect = window.setTimeout(connect, 1500)
      }
    }

    connect()
    return () => {
      closed = true
      if (reconnect) window.clearTimeout(reconnect)
      socket?.close()
    }
  }, [workspaceRoot])
}
