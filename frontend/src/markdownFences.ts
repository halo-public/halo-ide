import { Children, isValidElement, type ReactNode } from 'react'

const DIAGRAM_LANGUAGES = new Set(['mermaid', 'mmd'])

export function languageFromClassName(className?: string): string {
  const match = /(?:^|\s)language-([a-z0-9_+-]+)/i.exec(className ?? '')
  return match?.[1]?.toLowerCase() ?? ''
}

export function isDiagramLanguage(language: string): boolean {
  return DIAGRAM_LANGUAGES.has(language.toLowerCase())
}

export function fencedCodeFromPreChildren(
  children: ReactNode,
): { language: string; source: string } | null {
  const child = Children.toArray(children)[0]
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return null
  const language = languageFromClassName(child.props.className)
  if (!language) return null
  const source = String(child.props.children ?? '').replace(/\n$/, '')
  return { language, source }
}
