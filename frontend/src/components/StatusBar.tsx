import type { CopilotStatus, EditorCursor } from '../api/types'
import type { ChatTurnIndicator } from './ChatPanel'

interface Props {
  language?: string
  dirty?: boolean
  cursor: EditorCursor | null
  encoding?: string
  problemCount: number
  turnIndicator?: ChatTurnIndicator | null
  onProblemsClick: () => void
  appVersion?: string
  updateState?: MiniCursorUpdateState | null
  onInstallUpdate?: () => void
  copilotStatus?: CopilotStatus | null
}

export function StatusBar({
  language,
  dirty,
  cursor,
  encoding = 'UTF-8',
  problemCount,
  turnIndicator,
  onProblemsClick,
  appVersion,
  updateState,
  onInstallUpdate,
  copilotStatus,
}: Props) {
  return (
    <footer className="status-bar">
      <button className="status-item" onClick={onProblemsClick}>
        {problemCount ? `${problemCount} problem${problemCount === 1 ? '' : 's'}` : 'No problems'}
      </button>
      {turnIndicator && (
        <span className={`status-item status-turn ${turnIndicator.actor}`} title={turnIndicator.chatTitle}>
          <span className="status-turn-dot" aria-hidden />
          {turnIndicator.label}
        </span>
      )}
      <div className="status-spacer" />
      {copilotStatus && (
        <span className="status-item" title={copilotStatus.message ?? ''}>
          <span className={`status-dot ${copilotStatus.connected ? 'on' : 'off'}`} />
          Copilot {copilotStatus.connected ? 'connected' : 'offline'}
        </span>
      )}
      {dirty != null && (
        <span className="status-item">{dirty ? 'Unsaved' : 'Saved'}</span>
      )}
      {language && <span className="status-item">{language}</span>}
      <span className="status-item">{encoding}</span>
      {cursor && (
        <span className="status-item">
          Ln {cursor.line}, Col {cursor.column}
        </span>
      )}
      {updateState?.status === 'downloading' && (
        <span className="status-item">
          Updating {Math.round(updateState.percent ?? 0)}%
        </span>
      )}
      {updateState?.status === 'downloaded' && (
        <button className="status-item" onClick={() => onInstallUpdate?.()}>
          Restart to update
        </button>
      )}
      {appVersion && <span className="status-item">v{appVersion}</span>}
    </footer>
  )
}
