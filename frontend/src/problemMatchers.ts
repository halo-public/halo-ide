import type { ProblemItem } from './api/types'

const PATTERNS: { re: RegExp; severity: ProblemItem['severity'] }[] = [
  {
    re: /^(?<path>.+?):(?<line>\d+):(?<column>\d+):\s*(?<sev>error|warning|info|note)[:\s]+(?<message>.+)$/i,
    severity: 'error',
  },
  {
    re: /^(?<path>.+?)\((?<line>\d+),(?<column>\d+)\):\s*(?<sev>error|warning|info)\s+(?<message>.+)$/i,
    severity: 'error',
  },
  {
    re: /^(?<path>.+?):(?<line>\d+):\s*(?<sev>error|warning)[:\s]+(?<message>.+)$/i,
    severity: 'error',
  },
]

function normalizeSeverity(value: string | undefined, fallback: ProblemItem['severity']): ProblemItem['severity'] {
  const v = (value ?? '').toLowerCase()
  if (v.startsWith('warn')) return 'warning'
  if (v === 'info' || v === 'note') return 'info'
  if (v.startsWith('err')) return 'error'
  return fallback
}

export function parseProblemOutput(output: string): ProblemItem[] {
  const problems: ProblemItem[] = []
  const lines = output.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    for (const { re, severity } of PATTERNS) {
      const match = re.exec(line)
      if (!match?.groups) continue
      const path = match.groups.path.replace(/^["']|["']$/g, '').replace(/\\/g, '/')
      if (path.includes(' ') && !path.includes('/') && !path.includes('.')) continue
      problems.push({
        id: `launch:${i}:${path}:${match.groups.line}`,
        path,
        line: Number(match.groups.line) || 1,
        column: Number(match.groups.column) || 1,
        severity: normalizeSeverity(match.groups.sev, severity),
        message: match.groups.message.trim(),
      })
      break
    }
  }
  return problems.slice(0, 200)
}

export function parseOutputLocations(output: string): { path: string; line: number; column: number }[] {
  return parseProblemOutput(output).map((p) => ({ path: p.path, line: p.line, column: p.column }))
}
