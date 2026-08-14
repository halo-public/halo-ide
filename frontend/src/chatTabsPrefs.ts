export interface ChatTabsState {
  openIds: string[]
  activeId: string | null
}

const STORAGE_KEY = 'mini-cursor.chat-open-tabs'

export function loadChatTabsState(): ChatTabsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { openIds: [], activeId: null }
    const parsed = JSON.parse(raw) as Partial<ChatTabsState>
    const openIds = Array.isArray(parsed.openIds)
      ? parsed.openIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    const activeId =
      typeof parsed.activeId === 'string' && parsed.activeId.length > 0 ? parsed.activeId : null
    return { openIds, activeId }
  } catch {
    return { openIds: [], activeId: null }
  }
}

export function saveChatTabsState(state: ChatTabsState): void {
  const openIds = [...new Set(state.openIds.filter(Boolean))]
  const activeId = state.activeId && openIds.includes(state.activeId) ? state.activeId : openIds[0] ?? null
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ openIds, activeId }))
}
