export {}

declare global {
  interface Window {
    miniCursor?: {
      platform: string
      isElectron: boolean
      apiBase: string
      openWorkspaceFolder: () => Promise<string | null>
      getWorkspaceMru: () => Promise<string[]>
      rememberWorkspace: (folder: string) => Promise<string[]>
    }
  }
}
