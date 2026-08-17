const LANGUAGE_BY_EXT: Record<string, string> = {
  '.cs': 'csharp',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.css': 'css',
  '.html': 'html',
  '.htm': 'html',
  '.py': 'python',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.xml': 'xml',
  '.sh': 'shell',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.scss': 'scss',
  '.less': 'less',
  '.toml': 'ini',
  '.ini': 'ini',
  '.txt': 'plaintext',
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function fileName(path: string): string {
  const rel = normalizePath(path)
  return rel.split('/').pop() ?? rel
}

export function fileExtension(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot).toLowerCase()
}

export function detectLanguage(path: string): string {
  return LANGUAGE_BY_EXT[fileExtension(path)] ?? 'plaintext'
}

export function normalizeFilePatterns(files?: string | string[]): string[] {
  if (files == null) return []
  const list = Array.isArray(files) ? files : [files]
  return list.map((p) => p.trim()).filter(Boolean)
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/\\/g, '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`, 'i')
}

export function matchesFilePattern(pattern: string, path: string, language: string): boolean {
  const rel = normalizePath(path)
  const base = fileName(rel)
  const ext = fileExtension(rel)
  const raw = pattern.trim()
  if (!raw) return false
  const lower = raw.toLowerCase()

  const isGlob = /[*?]/.test(raw) || raw.includes('/')
  if (!isGlob && raw.startsWith('.') && raw !== '.') {
    return ext === lower
  }

  if (!isGlob && !raw.startsWith('.')) {
    if (lower === language.toLowerCase()) return true
    if (lower === base.toLowerCase()) return true
    if (ext && ext.slice(1) === lower) return true
    return false
  }

  const glob = raw.includes('/') || raw.startsWith('**') ? raw : `**/${raw}`
  const full = globToRegExp(glob)
  const nameGlob = globToRegExp(raw.includes('/') ? (raw.split('/').pop() ?? raw) : raw)
  return full.test(rel) || nameGlob.test(base)
}

export function matchesFilePatterns(
  patterns: string[],
  path: string,
  isDirectory: boolean,
  language?: string,
): boolean {
  if (patterns.length === 0) return true
  if (isDirectory) return false
  const lang = language || detectLanguage(path)
  return patterns.some((pattern) => matchesFilePattern(pattern, path, lang))
}
