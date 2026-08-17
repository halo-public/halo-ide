import { describe, expect, it } from 'vitest'
import {
  detectLanguage,
  matchesFilePattern,
  matchesFilePatterns,
  normalizeFilePatterns,
} from './fileTypes'

describe('detectLanguage', () => {
  it('maps common extensions to Monaco language ids', () => {
    expect(detectLanguage('src/app.tsx')).toBe('typescript')
    expect(detectLanguage('hello.js')).toBe('javascript')
    expect(detectLanguage('a.JSON')).toBe('json')
    expect(detectLanguage('notes.markdown')).toBe('markdown')
    expect(detectLanguage('noext')).toBe('plaintext')
  })
})

describe('normalizeFilePatterns', () => {
  it('accepts a string or array and drops blanks', () => {
    expect(normalizeFilePatterns('.js')).toEqual(['.js'])
    expect(normalizeFilePatterns([' json ', '', '.md'])).toEqual(['json', '.md'])
    expect(normalizeFilePatterns(undefined)).toEqual([])
  })
})

describe('matchesFilePattern', () => {
  it('matches extensions with or without a dot', () => {
    expect(matchesFilePattern('.js', 'src/a.js', 'javascript')).toBe(true)
    expect(matchesFilePattern('js', 'src/a.js', 'javascript')).toBe(true)
    expect(matchesFilePattern('.ts', 'src/a.js', 'javascript')).toBe(false)
  })

  it('matches Monaco language ids', () => {
    expect(matchesFilePattern('javascript', 'a.jsx', 'javascript')).toBe(true)
    expect(matchesFilePattern('typescript', 'a.tsx', 'typescript')).toBe(true)
    expect(matchesFilePattern('json', 'a.ts', 'typescript')).toBe(false)
  })

  it('matches a file name or glob', () => {
    expect(matchesFilePattern('package.json', 'package.json', 'json')).toBe(true)
    expect(matchesFilePattern('package.json', 'app/package.json', 'json')).toBe(true)
    expect(matchesFilePattern('*.test.ts', 'src/foo.test.ts', 'typescript')).toBe(true)
    expect(matchesFilePattern('**/*.md', 'docs/a.md', 'markdown')).toBe(true)
    expect(matchesFilePattern('*.js', 'src/a.ts', 'typescript')).toBe(false)
  })
})

describe('matchesFilePatterns', () => {
  it('matches all files when no patterns are set', () => {
    expect(matchesFilePatterns([], 'a.ts', false)).toBe(true)
    expect(matchesFilePatterns([], 'src', true)).toBe(true)
  })

  it('does not apply file-type filters to folders', () => {
    expect(matchesFilePatterns(['.js'], 'src', true)).toBe(false)
  })

  it('matches if any pattern hits', () => {
    expect(matchesFilePatterns(['.md', 'javascript'], 'a.js', false, 'javascript')).toBe(true)
    expect(matchesFilePatterns(['.md'], 'a.js', false, 'javascript')).toBe(false)
  })
})
