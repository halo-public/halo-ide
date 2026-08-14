import type { OutlineSymbol } from './api/types'

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'class', re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/ },
  { kind: 'interface', re: /^\s*(?:export\s+)?interface\s+(\w+)/ },
  { kind: 'type', re: /^\s*(?:export\s+)?type\s+(\w+)\s*=/ },
  { kind: 'enum', re: /^\s*(?:export\s+)?enum\s+(\w+)/ },
  { kind: 'function', re: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/ },
  { kind: 'function', re: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/ },
  { kind: 'function', re: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/ },
  { kind: 'method', re: /^\s+(?:public|private|protected|internal|static|async|\s)*(\w+)\s*\([^;]*\)\s*\{?\s*$/ },
  { kind: 'function', re: /^\s*def\s+(\w+)\s*\(/ },
  { kind: 'class', re: /^\s*class\s+(\w+)\s*[:(]/ },
  { kind: 'function', re: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/ },
  { kind: 'struct', re: /^\s*(?:pub\s+)?struct\s+(\w+)/ },
]

export function extractOutline(content: string, _language: string): OutlineSymbol[] {
  const lines = content.split('\n')
  const symbols: OutlineSymbol[] = []
  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const { kind, re } of PATTERNS) {
      const m = re.exec(line)
      if (!m?.[1]) continue
      if (['if', 'for', 'while', 'switch', 'catch', 'return', 'new'].includes(m[1])) continue
      const key = `${m[1]}:${i}`
      if (seen.has(key)) continue
      seen.add(key)
      symbols.push({ name: m[1], kind, line: i + 1 })
      break
    }
  }

  return symbols.slice(0, 200)
}

export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim()
  const t = text.toLowerCase()
  if (!q) return 1
  if (t === q) return 1000
  if (t.startsWith(q)) return 500 + (100 - Math.min(100, t.length))
  if (t.includes(q)) return 200 + (100 - Math.min(100, t.indexOf(q)))

  let ti = 0
  let score = 0
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    const found = t.indexOf(ch, ti)
    if (found < 0) return -1
    score += 10 - Math.min(9, found - ti)
    ti = found + 1
  }
  return score
}

export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string, limit = 50): T[] {
  const scored = items
    .map((item) => ({ item, score: fuzzyScore(query, getText(item)) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((x) => x.item)
}
