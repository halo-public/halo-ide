export type BottomTab = 'output' | 'terminal' | 'problems'

const STORAGE_KEY = 'mini-cursor.bottom-tab-order'

export const DEFAULT_BOTTOM_TAB_ORDER: BottomTab[] = ['terminal', 'output', 'problems']

const ALL_TABS = new Set<BottomTab>(DEFAULT_BOTTOM_TAB_ORDER)

export function normalizeBottomTabOrder(value: unknown): BottomTab[] {
  const seen = new Set<BottomTab>()
  const ordered: BottomTab[] = []

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string') continue
      if (!ALL_TABS.has(item as BottomTab)) continue
      const tab = item as BottomTab
      if (seen.has(tab)) continue
      seen.add(tab)
      ordered.push(tab)
    }
  }

  for (const tab of DEFAULT_BOTTOM_TAB_ORDER) {
    if (!seen.has(tab)) ordered.push(tab)
  }

  return ordered
}

export function loadBottomTabOrder(): BottomTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...DEFAULT_BOTTOM_TAB_ORDER]
    return normalizeBottomTabOrder(JSON.parse(raw))
  } catch {
    return [...DEFAULT_BOTTOM_TAB_ORDER]
  }
}

export function saveBottomTabOrder(order: BottomTab[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeBottomTabOrder(order)))
}
