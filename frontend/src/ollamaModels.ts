export const LOCAL_OLLAMA = 'http://127.0.0.1:11434'
export const CLOUD_OLLAMA = 'https://ollama.com'

const URL_MRU_KEY = 'mini-cursor.ollama-url-mru'
const URL_MRU_MAX = 8

export type OllamaUrlPreset = {
  url: string
  label: string
  kind: 'cloud' | 'local' | 'recent'
}

export function normalizeOllamaUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const parsed = new URL(withScheme)
    if (parsed.hostname.toLowerCase() === 'ollama.com' && parsed.protocol === 'http:') {
      parsed.protocol = 'https:'
    }
    const path = parsed.pathname.replace(/\/+$/, '')
    return path && path !== '/' ? `${parsed.origin}${path}` : parsed.origin
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

export function formatOllamaHost(url: string): string {
  const full = normalizeOllamaUrl(url) || LOCAL_OLLAMA
  try {
    const parsed = new URL(full)
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname
  } catch {
    return full.replace(/^https?:\/\//i, '')
  }
}

export function isCloudOllamaUrl(baseUrl: string | null | undefined): boolean {
  const value = normalizeOllamaUrl(baseUrl ?? '')
  if (!value) return false
  try {
    return new URL(value).hostname.toLowerCase() === 'ollama.com'
  } catch {
    return value.toLowerCase().includes('ollama.com')
  }
}

export function loadOllamaUrlMru(): string[] {
  try {
    const raw = localStorage.getItem(URL_MRU_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && !!normalizeOllamaUrl(item)).slice(0, URL_MRU_MAX)
      : []
  } catch {
    return []
  }
}

export function rememberOllamaUrl(url: string): string[] {
  const full = normalizeOllamaUrl(url)
  if (!full) return loadOllamaUrlMru()
  const next = [full, ...loadOllamaUrlMru().filter((item) => normalizeOllamaUrl(item).toLowerCase() !== full.toLowerCase())].slice(0, URL_MRU_MAX)
  try {
    localStorage.setItem(URL_MRU_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
  return next
}

export function ollamaUrlPresets(recent: string[] = loadOllamaUrlMru()): OllamaUrlPreset[] {
  const pinned: OllamaUrlPreset[] = [
    { url: CLOUD_OLLAMA, label: 'Ollama Cloud', kind: 'cloud' },
    { url: LOCAL_OLLAMA, label: 'Local Ollama', kind: 'local' },
  ]
  const pinnedIds = new Set(pinned.map((item) => item.url.toLowerCase()))
  const extras = recent
    .map(normalizeOllamaUrl)
    .filter((url) => url && !pinnedIds.has(url.toLowerCase()))
    .map((url) => ({ url, label: url, kind: 'recent' as const }))
  return [...pinned, ...extras]
}

export type OllamaRecommendKind = 'thinking' | 'tools'

export type OllamaRecommendation = {
  id: string
  kind: OllamaRecommendKind
  title: string
  blurb: string
  ram: string
}

export const OLLAMA_RECOMMENDATIONS: OllamaRecommendation[] = [
  {
    id: 'qwen3:8b',
    kind: 'thinking',
    title: 'Qwen3 8B',
    blurb: 'Best default for reasoning and thinking mode on a laptop GPU.',
    ram: '8–16 GB',
  },
  {
    id: 'qwen3:14b',
    kind: 'thinking',
    title: 'Qwen3 14B',
    blurb: 'Stronger chain-of-thought when you have more VRAM.',
    ram: '16 GB+',
  },
  {
    id: 'deepseek-r1:8b',
    kind: 'thinking',
    title: 'DeepSeek R1 8B',
    blurb: 'R1 distill with explicit step-by-step thinking.',
    ram: '8–16 GB',
  },
  {
    id: 'deepseek-r1:14b',
    kind: 'thinking',
    title: 'DeepSeek R1 14B',
    blurb: 'Heavier R1 distill for harder reasoning.',
    ram: '16 GB+',
  },
  {
    id: 'qwen3:8b',
    kind: 'tools',
    title: 'Qwen3 8B',
    blurb: 'Strong tool calling and coding in the same family as thinking.',
    ram: '8–16 GB',
  },
  {
    id: 'qwen2.5-coder:7b',
    kind: 'tools',
    title: 'Qwen2.5 Coder 7B',
    blurb: 'Coding specialist; good for edits and local tool use.',
    ram: '~8 GB',
  },
  {
    id: 'qwen2.5-coder:14b',
    kind: 'tools',
    title: 'Qwen2.5 Coder 14B',
    blurb: 'Larger coder if you want better multi-file edits.',
    ram: '16 GB+',
  },
  {
    id: 'llama3.1:8b',
    kind: 'tools',
    title: 'Llama 3.1 8B',
    blurb: 'Mature OpenAI-style function calling; widely compatible.',
    ram: '~8 GB',
  },
]

export function isLocalOllamaUrl(baseUrl: string | null | undefined): boolean {
  const value = (baseUrl ?? '').trim().toLowerCase().replace(/\/$/, '')
  if (!value) return true
  try {
    const host = new URL(value).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return value.includes('127.0.0.1') || value.includes('localhost')
  }
}

export function modelIsInstalled(name: string, installed: string[]): boolean {
  const needle = name.trim().toLowerCase()
  if (!needle) return false
  return installed.some((id) => {
    const have = id.trim().toLowerCase()
    return have === needle || have.startsWith(`${needle}:`) || needle.startsWith(`${have}:`)
  })
}

export function formatPullProgress(status?: string | null, completed?: number | null, total?: number | null): string {
  if (total && total > 0 && completed != null) {
    const pct = Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
    return status ? `${status} (${pct}%)` : `${pct}%`
  }
  return status?.trim() || 'Pulling…'
}
