import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import {
  fencedCodeFromPreChildren,
  isDiagramLanguage,
  languageFromClassName,
} from './markdownFences'

describe('languageFromClassName', () => {
  it('reads a language-* class', () => {
    expect(languageFromClassName('language-mermaid')).toBe('mermaid')
    expect(languageFromClassName('language-js')).toBe('js')
    expect(languageFromClassName('hljs language-MERMAID')).toBe('mermaid')
    expect(languageFromClassName('')).toBe('')
  })
})

describe('isDiagramLanguage', () => {
  it('treats mermaid fences as diagrams', () => {
    expect(isDiagramLanguage('mermaid')).toBe(true)
    expect(isDiagramLanguage('mmd')).toBe(true)
    expect(isDiagramLanguage('javascript')).toBe(false)
  })
})

describe('fencedCodeFromPreChildren', () => {
  it('unwraps a fenced code element', () => {
    const children = createElement('code', { className: 'language-mermaid' }, 'flowchart LR\nA-->B\n')
    expect(fencedCodeFromPreChildren(children)).toEqual({
      language: 'mermaid',
      source: 'flowchart LR\nA-->B',
    })
  })

  it('returns null for plain pre content', () => {
    expect(fencedCodeFromPreChildren('plain')).toBeNull()
  })
})
