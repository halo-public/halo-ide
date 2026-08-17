import { describe, expect, it } from 'vitest'
import {
  formatPullProgress,
  isLocalOllamaUrl,
  modelIsInstalled,
  normalizeOllamaUrl,
  ollamaUrlPresets,
  OLLAMA_RECOMMENDATIONS,
} from './ollamaModels'

describe('ollama helpers', () => {
  it('treats empty and loopback URLs as local', () => {
    expect(isLocalOllamaUrl('')).toBe(true)
    expect(isLocalOllamaUrl('http://127.0.0.1:11434')).toBe(true)
    expect(isLocalOllamaUrl('http://localhost:11434/')).toBe(true)
    expect(isLocalOllamaUrl('https://ollama.com')).toBe(false)
  })

  it('matches installed models with or without a tag', () => {
    expect(modelIsInstalled('qwen3:8b', ['qwen3:8b'])).toBe(true)
    expect(modelIsInstalled('qwen3', ['qwen3:8b'])).toBe(true)
    expect(modelIsInstalled('llama3.1:8b', ['qwen3:8b'])).toBe(false)
  })

  it('formats pull progress', () => {
    expect(formatPullProgress('downloading', 50, 100)).toBe('downloading (50%)')
    expect(formatPullProgress('pulling manifest')).toBe('pulling manifest')
  })

  it('recommends distinct thinking and tools models', () => {
    expect(OLLAMA_RECOMMENDATIONS.some((r) => r.kind === 'thinking')).toBe(true)
    expect(OLLAMA_RECOMMENDATIONS.some((r) => r.kind === 'tools')).toBe(true)
  })

  it('lists Cloud and Local as pinned endpoint presets', () => {
    const presets = ollamaUrlPresets(['https://gpu.lan:11434/', 'https://ollama.com'])
    expect(presets[0]).toMatchObject({ kind: 'cloud', url: 'https://ollama.com', label: 'Ollama Cloud' })
    expect(presets[1]).toMatchObject({ kind: 'local', url: 'http://127.0.0.1:11434' })
    expect(presets.some((p) => p.url === 'https://gpu.lan:11434')).toBe(true)
    expect(presets.filter((p) => p.url === 'https://ollama.com')).toHaveLength(1)
  })

  it('strips trailing slashes from Ollama URLs', () => {
    expect(normalizeOllamaUrl('https://ollama.com/')).toBe('https://ollama.com')
  })
})
