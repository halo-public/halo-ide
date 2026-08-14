import type {
  ChatDetail,
  ChatSummary,
  AiSettings,
  CredentialsSettings,
  CopilotModel,
  CopilotStatus,
  CursorChatImportCandidate,
  FileContent,
  FileNode,
  LaunchConfig,
  LaunchRun,
  GitSidebar,
  MessageAttachmentRequest,
  ProviderOption,
  SearchMatch,
  TaskConfig,
  WorkspaceInfo,
  WorkspaceChatInfo,
} from './types'

function apiUrl(path: string): string {
  const base = window.miniCursor?.apiBase?.replace(/\/$/, '') ?? ''
  return `${base}${path}`
}

export function wsUrl(path: string): string {
  const base = window.miniCursor?.apiBase?.replace(/\/$/, '') ?? ''
  if (base) {
    const u = new URL(base)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = path
    u.search = ''
    u.hash = ''
    return u.toString()
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body.message ?? message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  getWorkspace: () => request<WorkspaceInfo>('/api/workspace'),
  getWorkspaceChats: () => request<WorkspaceChatInfo>('/api/workspace/chats'),
  setWorkspace: (root: string) =>
    request<WorkspaceInfo>('/api/workspace', {
      method: 'PUT',
      body: JSON.stringify({ root }),
    }),
  notifyWorkspaceOpened: () =>
    request<WorkspaceChatInfo>('/api/chats/workspace-opened', {
      method: 'POST',
    }),
  listFiles: (path?: string, gitignore = true) =>
    request<FileNode[]>(
      `/api/files${path ? `?path=${encodeURIComponent(path)}&` : '?'}gitignore=${gitignore}`,
    ),
  listTree: (gitignore = true) =>
    request<string[]>(`/api/files/tree?gitignore=${gitignore}`),
  search: (q: string, gitignore = true) =>
    request<SearchMatch[]>(`/api/search?q=${encodeURIComponent(q)}&gitignore=${gitignore}`),
  readFile: (path: string) =>
    request<FileContent>(`/api/files/content?path=${encodeURIComponent(path)}`),
  writeFile: (path: string, content: string) =>
    request<FileContent>('/api/files/content', {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    }),
  createPath: (path: string, isDirectory: boolean) =>
    request<FileNode>('/api/files', {
      method: 'POST',
      body: JSON.stringify({ path, isDirectory }),
    }),
  renamePath: (path: string, newPath: string) =>
    request<FileNode>('/api/files/rename', {
      method: 'POST',
      body: JSON.stringify({ path, newPath }),
    }),
  copyPath: (path: string, newPath: string) =>
    request<FileNode>('/api/files/copy', {
      method: 'POST',
      body: JSON.stringify({ path, newPath }),
    }),
  deletePath: (path: string) =>
    request<void>(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  getLaunchConfigs: () => request<LaunchConfig[]>('/api/launch'),
  getTasks: () => request<TaskConfig[]>('/api/tasks'),
  startTask: (name: string) =>
    request<LaunchRun>(`/api/tasks/${encodeURIComponent(name)}/run`, { method: 'POST' }),
  getLaunchRun: (id: string) => request<LaunchRun>(`/api/launch/runs/${id}`),
  startLaunch: (name: string) =>
    request<LaunchRun>(`/api/launch/${encodeURIComponent(name)}/run`, { method: 'POST' }),
  getLaunchOutput: (id: string) =>
    request<{ output: string }>(`/api/launch/runs/${id}/output`),
  stopLaunch: (id: string) =>
    request<void>(`/api/launch/runs/${id}/stop`, { method: 'POST' }),
  getGitStatus: () => request<GitSidebar>('/api/git/status'),
  runGitOperation: (operation: string, argument?: string, paths?: string[]) =>
    request<LaunchRun>('/api/git/operations', {
      method: 'POST',
      body: JSON.stringify({ operation, argument, paths }),
    }),
  getCopilotStatus: () => request<CopilotStatus>('/api/copilot/status'),
  listAiProviders: () => request<ProviderOption[]>('/api/ai/providers'),
  listModels: (provider: string) => request<CopilotModel[]>(`/api/ai/models?provider=${encodeURIComponent(provider)}`),
  getAiSettings: () => request<AiSettings>('/api/settings/ai'),
  saveAiSettings: (settings: AiSettings) =>
    request<AiSettings>('/api/settings/ai', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  getCredentials: () => request<CredentialsSettings>('/api/settings/credentials'),
  saveCredentials: (settings: CredentialsSettings) =>
    request<CredentialsSettings>('/api/settings/credentials', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  setCopilotModel: (provider: string, model: string, chatId?: string | null) =>
    request<CopilotStatus>('/api/copilot/model', {
      method: 'PUT',
      body: JSON.stringify({ provider, model, chatId: chatId || undefined }),
    }),
  listChats: () => request<ChatSummary[]>('/api/chats'),
  createChat: (title?: string) =>
    request<ChatDetail>('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  getChat: (id: string) => request<ChatDetail>(`/api/chats/${id}`),
  deleteChat: (id: string) => request<void>(`/api/chats/${id}`, { method: 'DELETE' }),
  listCursorChats: (currentWorkspaceOnly = false) =>
    request<CursorChatImportCandidate[]>(
      `/api/chats/import/cursor?currentWorkspaceOnly=${currentWorkspaceOnly}`,
    ),
  importCursorChats: (ids: string[]) =>
    request<ChatDetail[]>('/api/chats/import/cursor', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  sendMessage: async (
    chatId: string,
    content: string,
    attachments: MessageAttachmentRequest[],
    onEvent: (type: string, payload: unknown) => void,
  ) => {
    const res = await fetch(apiUrl(`/api/chats/${chatId}/messages`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, attachments }),
    })
    if (!res.ok || !res.body) {
      throw new Error('Failed to send message')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data:')) continue
        const json = line.slice(5).trim()
        if (!json) continue
        try {
          const evt = JSON.parse(json) as { type: string; payload: unknown }
          onEvent(evt.type, evt.payload)
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  },
}
