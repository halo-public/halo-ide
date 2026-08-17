const KEY = 'mini-cursor.open-tabs'

export type OpenTabsState = {
  paths: string[]
  activePath?: string
  secondaryPath?: string
}

export function loadOpenTabs(workspaceRoot: string): OpenTabsState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { paths: [] }
    const parsed = JSON.parse(raw) as Record<string, OpenTabsState>
    return parsed[workspaceRoot] ?? { paths: [] }
  } catch {
    return { paths: [] }
  }
}

export function saveOpenTabs(workspaceRoot: string, state: OpenTabsState): void {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, OpenTabsState>) : {}
    parsed[workspaceRoot] = {
      paths: state.paths.slice(0, 30),
      activePath: state.activePath,
      secondaryPath: state.secondaryPath,
    }
    localStorage.setItem(KEY, JSON.stringify(parsed))
  } catch {
    /* ignore quota */
  }
}
