export type LayoutPrefs = {
  sidebarWidth: number
  chatWidth: number
  terminalHeight: number
  documentsDock: HorizontalDock
  sidebarsDock: HorizontalDock
  bottomPanelDock: HorizontalDock
}

export type HorizontalDock = 'left' | 'middle' | 'right'

const STORAGE_KEY = 'mini-cursor.layout'

export const LAYOUT_DEFAULTS: LayoutPrefs = {
  sidebarWidth: 260,
  chatWidth: 380,
  terminalHeight: 180,
  documentsDock: 'middle',
  sidebarsDock: 'left',
  bottomPanelDock: 'right',
}

export const LAYOUT_LIMITS = {
  sidebarWidth: { min: 160 },
  chatWidth: { min: 280 },
  terminalHeight: { min: 100 },
} as const

type SizeLimit = {
  min: number
  max?: number
}

function clamp(value: number, min: number, max?: number): number {
  const rounded = Math.round(value)
  return max == null ? Math.max(min, rounded) : Math.min(max, Math.max(min, rounded))
}

function clampByLimit(value: number, limit: SizeLimit): number {
  return clamp(value, limit.min, limit.max)
}

export function clampLayout(prefs: Partial<LayoutPrefs>): LayoutPrefs {
  let documentsDock = normalizeDock(prefs.documentsDock, LAYOUT_DEFAULTS.documentsDock)
  let sidebarsDock = normalizeDock(prefs.sidebarsDock, LAYOUT_DEFAULTS.sidebarsDock)
  const bottomPanelDock = normalizeDock(prefs.bottomPanelDock, LAYOUT_DEFAULTS.bottomPanelDock)

  if (documentsDock === sidebarsDock) {
    sidebarsDock = firstAvailableDock(documentsDock)
  }

  return {
    sidebarWidth: clampByLimit(prefs.sidebarWidth ?? LAYOUT_DEFAULTS.sidebarWidth, LAYOUT_LIMITS.sidebarWidth),
    chatWidth: clampByLimit(prefs.chatWidth ?? LAYOUT_DEFAULTS.chatWidth, LAYOUT_LIMITS.chatWidth),
    terminalHeight: clampByLimit(
      prefs.terminalHeight ?? LAYOUT_DEFAULTS.terminalHeight,
      LAYOUT_LIMITS.terminalHeight,
    ),
    documentsDock,
    sidebarsDock,
    bottomPanelDock,
  }
}

function normalizeDock(value: string | undefined, fallback: HorizontalDock): HorizontalDock {
  if (value === 'left' || value === 'middle' || value === 'right') return value
  return fallback
}

function firstAvailableDock(used: HorizontalDock): HorizontalDock {
  return used === 'left' ? 'middle' : used === 'middle' ? 'right' : 'left'
}

export function loadLayout(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...LAYOUT_DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<LayoutPrefs>
    return clampLayout(parsed)
  } catch {
    return { ...LAYOUT_DEFAULTS }
  }
}

export function saveLayout(prefs: LayoutPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clampLayout(prefs)))
}
