import { describe, expect, it } from 'vitest'
import {
  applyPluginLanguages,
  detectLanguageFrom,
  normalizeExtension,
  normalizeLanguage,
  resetAppliedMonarchForTests,
  type MonacoLanguageHost,
} from './languages'
import type { RegisteredLanguage } from './types'

function lang(partial: Partial<RegisteredLanguage> & Pick<RegisteredLanguage, 'id'>): RegisteredLanguage {
  return {
    pluginId: partial.pluginId ?? 'builtin',
    pluginName: partial.pluginName ?? 'Halo IDE',
    id: partial.id,
    extensions: partial.extensions ?? [],
    filenames: partial.filenames ?? [],
    aliases: partial.aliases ?? [],
    monarch: partial.monarch,
  }
}

describe('normalizeExtension', () => {
  it('adds a leading dot and lowercases', () => {
    expect(normalizeExtension('JS')).toBe('.js')
    expect(normalizeExtension('.Cpp')).toBe('.cpp')
  })
})

describe('normalizeLanguage', () => {
  it('requires an id and extensions or filenames', () => {
    expect(() => normalizeLanguage('p', 'P', { id: '' })).toThrow(/id/)
    expect(() => normalizeLanguage('p', 'P', { id: 'x' })).toThrow(/extensions or filenames/)
  })
})

describe('detectLanguageFrom', () => {
  const languages = [
    lang({ id: 'typescript', extensions: ['.ts', '.tsx'] }),
    lang({ id: 'dockerfile', filenames: ['Dockerfile'] }),
    lang({ id: 'javascript', extensions: ['.ts'], pluginId: 'override' }),
  ]

  it('uses filenames then extensions, with later registrations winning', () => {
    expect(detectLanguageFrom('Dockerfile', languages)).toBe('dockerfile')
    expect(detectLanguageFrom('src/app.ts', languages)).toBe('javascript')
    expect(detectLanguageFrom('src/app.tsx', languages)).toBe('typescript')
    expect(detectLanguageFrom('nope.bin', languages)).toBe('plaintext')
  })
})

describe('applyPluginLanguages', () => {
  it('registers unknown ids and monarch tokenizers once', () => {
    resetAppliedMonarchForTests()
    const registered: string[] = []
    const monarchs: string[] = []
    const monaco: MonacoLanguageHost = {
      languages: {
        getLanguages: () => [{ id: 'javascript' }],
        register: (spec) => {
          registered.push(spec.id)
        },
        setMonarchTokensProvider: (id) => {
          monarchs.push(id)
        },
      },
    }

    const languages = [
      lang({ id: 'hello', extensions: ['.hello'], monarch: { tokenizer: { root: [] } } }),
      lang({ id: 'javascript', extensions: ['.js'] }),
    ]

    applyPluginLanguages(monaco, languages)
    applyPluginLanguages(monaco, languages)

    expect(registered).toEqual(['hello'])
    expect(monarchs).toEqual(['hello'])
  })
})
