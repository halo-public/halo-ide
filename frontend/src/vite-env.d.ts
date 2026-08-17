export {}

declare global {
  const __APP_VERSION__: string

  type MiniCursorUpdateStatus =
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'

  interface MiniCursorUpdateState {
    status: MiniCursorUpdateStatus
    currentVersion: string
    version?: string
    percent?: number
    error?: string
  }

  interface Window {
    miniCursor?: {
      platform: string
      isElectron: boolean
      apiBase: string
      openWorkspaceFolder: () => Promise<string | null>
      getWorkspaceMru: () => Promise<string[]>
      rememberWorkspace: (folder: string) => Promise<string[]>
      getVersion: () => Promise<string>
      getUpdateState: () => Promise<MiniCursorUpdateState>
      checkForUpdates: () => Promise<MiniCursorUpdateState | null>
      installUpdate: () => Promise<boolean>
      onUpdate: (callback: (state: MiniCursorUpdateState) => void) => () => void
      setApplicationMenu: (template: unknown) => void
      onMenuCommand: (callback: (payload: { id: string; data?: string }) => void) => () => void
    }
  }
}
