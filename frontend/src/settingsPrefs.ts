export type EditorSettings = {
  fontSize: number
  wordWrap: boolean
  tabSize: number
  minimap: boolean
  respectGitignore: boolean
}

const STORAGE_KEY = 'mini-cursor.settings'

export const SETTINGS_DEFAULTS: EditorSettings = {
  fontSize: 13,
  wordWrap: true,
  tabSize: 2,
  minimap: false,
  respectGitignore: true,
}

export function loadSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...SETTINGS_DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<EditorSettings>
    return {
      fontSize: clamp(parsed.fontSize ?? SETTINGS_DEFAULTS.fontSize, 10, 24),
      wordWrap: parsed.wordWrap ?? SETTINGS_DEFAULTS.wordWrap,
      tabSize: clamp(parsed.tabSize ?? SETTINGS_DEFAULTS.tabSize, 1, 8),
      minimap: parsed.minimap ?? SETTINGS_DEFAULTS.minimap,
      respectGitignore: parsed.respectGitignore ?? SETTINGS_DEFAULTS.respectGitignore,
    }
  } catch {
    return { ...SETTINGS_DEFAULTS }
  }
}

export function saveSettings(settings: EditorSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}
