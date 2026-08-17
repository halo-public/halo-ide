export const TOOLBAR_IDS = ['run', 'editor', 'explorer', 'git', 'chat'] as const
export type ToolbarId = (typeof TOOLBAR_IDS)[number]

export type ChromePrefs = {
  toolbars: Record<ToolbarId, boolean>
}

const STORAGE_KEY = 'mini-cursor.chrome'

export const CHROME_DEFAULTS: ChromePrefs = {
  toolbars: {
    run: true,
    editor: true,
    explorer: true,
    git: true,
    chat: true,
  },
}

export const TOOLBAR_LABELS: Record<ToolbarId, string> = {
  run: 'Run Toolbar',
  editor: 'Editor Toolbar',
  explorer: 'Explorer Toolbar',
  git: 'Git Toolbar',
  chat: 'Chat Toolbar',
}

function normalize(raw: Partial<ChromePrefs> | null | undefined): ChromePrefs {
  const toolbars = { ...CHROME_DEFAULTS.toolbars }
  const incoming = raw?.toolbars
  if (incoming && typeof incoming === 'object') {
    for (const id of TOOLBAR_IDS) {
      if (typeof incoming[id] === 'boolean') toolbars[id] = incoming[id]
    }
  }
  return { toolbars }
}

export function loadChrome(): ChromePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { toolbars: { ...CHROME_DEFAULTS.toolbars } }
    return normalize(JSON.parse(raw) as Partial<ChromePrefs>)
  } catch {
    return { toolbars: { ...CHROME_DEFAULTS.toolbars } }
  }
}

export function saveChrome(prefs: ChromePrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(prefs)))
}

export function toggleToolbar(prefs: ChromePrefs, id: ToolbarId): ChromePrefs {
  const next = normalize({
    toolbars: { ...prefs.toolbars, [id]: !prefs.toolbars[id] },
  })
  saveChrome(next)
  return next
}
