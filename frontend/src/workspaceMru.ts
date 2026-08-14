const STORAGE_KEY = 'mini-cursor.workspace-mru'
const MAX_MRU = 10

function normalize(folder: string): string {
  return folder.replace(/[\\/]+$/, '')
}

function samePath(a: string, b: string): boolean {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase()
}

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, MAX_MRU)
      : []
  } catch {
    return []
  }
}

function writeLocal(folders: string[]): string[] {
  const next = folders.slice(0, MAX_MRU)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export async function getWorkspaceMru(): Promise<string[]> {
  if (window.miniCursor?.getWorkspaceMru) {
    return window.miniCursor.getWorkspaceMru()
  }
  return readLocal()
}

export async function rememberWorkspace(folder: string): Promise<string[]> {
  if (window.miniCursor?.rememberWorkspace) {
    return window.miniCursor.rememberWorkspace(folder)
  }
  const full = normalize(folder)
  return writeLocal([full, ...readLocal().filter((item) => !samePath(item, full))])
}

export function folderLabel(folder: string): string {
  const parts = folder.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || folder
}
