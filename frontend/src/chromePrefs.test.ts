import { beforeEach, describe, expect, it } from 'vitest'
import { CHROME_DEFAULTS, loadChrome, saveChrome, toggleToolbar } from './chromePrefs'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      clear: () => store.clear(),
    },
  })
})

describe('chromePrefs', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadChrome()).toEqual(CHROME_DEFAULTS)
  })

  it('persists toolbar visibility', () => {
    saveChrome({ toolbars: { ...CHROME_DEFAULTS.toolbars, run: false, editor: false } })
    expect(loadChrome().toolbars.run).toBe(false)
    expect(loadChrome().toolbars.editor).toBe(false)
    expect(loadChrome().toolbars.explorer).toBe(true)
  })

  it('toggles a single toolbar and saves', () => {
    const next = toggleToolbar(CHROME_DEFAULTS, 'git')
    expect(next.toolbars.git).toBe(false)
    expect(loadChrome().toolbars.git).toBe(false)
    expect(toggleToolbar(next, 'git').toolbars.git).toBe(true)
  })

  it('ignores unknown keys and non-boolean values', () => {
    localStorage.setItem(
      'mini-cursor.chrome',
      JSON.stringify({ toolbars: { run: 'no', extra: true }, other: 1 }),
    )
    expect(loadChrome().toolbars.run).toBe(true)
  })
})
