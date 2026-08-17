import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_ID,
  getTheme,
  isThemeId,
  monacoThemeId,
  THEMES,
  terminalTheme,
} from './themes'

describe('themes', () => {
  it('includes midnight as the default', () => {
    expect(DEFAULT_THEME_ID).toBe('midnight')
    expect(getTheme().id).toBe('midnight')
    expect(THEMES.map((theme) => theme.id)).toContain('midnight')
  })

  it('resolves known ids and falls back for unknown ones', () => {
    expect(isThemeId('nord')).toBe(true)
    expect(isThemeId('nope')).toBe(false)
    expect(getTheme('dracula').name).toBe('Dracula')
    expect(getTheme('missing').id).toBe('midnight')
    expect(getTheme(null).id).toBe('midnight')
  })

  it('uses distinct monaco theme names', () => {
    const names = THEMES.map((theme) => monacoThemeId(theme.id))
    expect(new Set(names).size).toBe(THEMES.length)
    expect(monacoThemeId('unknown')).toBe('mini-cursor-midnight')
  })

  it('maps terminal colors from theme tokens', () => {
    const nord = getTheme('nord')
    expect(terminalTheme(nord)).toMatchObject({
      background: nord.tokens.bgPanel,
      foreground: nord.tokens.text,
      cursor: nord.tokens.accent,
    })
  })

  it('includes a light theme', () => {
    expect(THEMES.some((theme) => theme.kind === 'light')).toBe(true)
    expect(getTheme('day').kind).toBe('light')
  })
})
