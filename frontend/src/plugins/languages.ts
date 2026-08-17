import { fileExtension, fileName, normalizePath } from './fileTypes'
import type { LanguageSpec, RegisteredLanguage } from './types'

function asList(value?: string | string[]): string[] {
  if (value == null) return []
  const list = Array.isArray(value) ? value : [value]
  return list.map((item) => item.trim()).filter(Boolean)
}

export function normalizeExtension(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
}

export function normalizeLanguage(
  pluginId: string,
  pluginName: string,
  spec: LanguageSpec,
): RegisteredLanguage {
  const id = spec.id?.trim()
  if (!id) throw new Error('Language is missing id')

  const extensions = asList(spec.extensions).map(normalizeExtension).filter(Boolean)
  const filenames = asList(spec.filenames)
  const aliases = asList(spec.aliases)
  if (extensions.length === 0 && filenames.length === 0) {
    throw new Error(`Language "${id}" needs extensions or filenames`)
  }

  const monarch =
    spec.monarch && typeof spec.monarch === 'object' && !Array.isArray(spec.monarch)
      ? spec.monarch
      : undefined

  return {
    pluginId,
    pluginName,
    id,
    extensions,
    filenames,
    aliases,
    monarch,
  }
}

export function buildLanguageLookup(languages: readonly RegisteredLanguage[]) {
  const byExt = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const language of languages) {
    for (const ext of language.extensions) byExt.set(ext, language.id)
    for (const name of language.filenames) byName.set(name.toLowerCase(), language.id)
  }
  return { byExt, byName }
}

export function detectLanguageFrom(
  path: string,
  languages: readonly RegisteredLanguage[],
): string {
  if (!path || languages.length === 0) return 'plaintext'
  const name = fileName(normalizePath(path))
  const ext = fileExtension(path)
  const lookup = buildLanguageLookup(languages)
  return lookup.byName.get(name.toLowerCase()) ?? lookup.byExt.get(ext) ?? 'plaintext'
}

export interface MonacoLanguageHost {
  languages: {
    getLanguages(): { id: string }[]
    register(language: {
      id: string
      extensions?: string[]
      filenames?: string[]
      aliases?: string[]
    }): void
    setMonarchTokensProvider(languageId: string, languageDef: object): { dispose(): void } | void
  }
}

const appliedMonarch = new Set<string>()
const registeredIds = new Set<string>()

export function applyPluginLanguages(monaco: MonacoLanguageHost, languages: readonly RegisteredLanguage[]) {
  const known = new Set([
    ...monaco.languages.getLanguages().map((language) => language.id),
    ...registeredIds,
  ])
  for (const language of languages) {
    if (!known.has(language.id)) {
      monaco.languages.register({
        id: language.id,
        extensions: language.extensions,
        filenames: language.filenames,
        aliases: language.aliases.length ? language.aliases : undefined,
      })
      known.add(language.id)
      registeredIds.add(language.id)
    }
    if (!language.monarch) continue
    const key = `${language.pluginId}:${language.id}`
    if (appliedMonarch.has(key)) continue
    monaco.languages.setMonarchTokensProvider(language.id, language.monarch)
    appliedMonarch.add(key)
  }
}

export function resetAppliedMonarchForTests() {
  appliedMonarch.clear()
  registeredIds.clear()
}
