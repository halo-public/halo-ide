import { ChevronDown, ChevronRight, Download, History, Image as ImageIcon, Paperclip, Plus, SendHorizontal, Wrench, X } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api/client'
import type {
  ChatAttachment,
  ChatDetail,
  ChatMessage,
  ChatSummary,
  ChatToolCall,
  CopilotModel,
  MessageAttachmentRequest,
  PendingAttachment,
  ProviderOption,
  WorkspaceInfo,
} from '../api/types'
import { loadChatTabsState, saveChatTabsState } from '../chatTabsPrefs'
import { ImportCursorChatsModal } from './ImportCursorChatsModal'
import type { HorizontalDock } from '../layoutPrefs'

interface Props {
  activeFilePath?: string
  workspace?: WorkspaceInfo | null
  importOpen?: boolean
  onImportOpenChange?: (open: boolean) => void
  dock: HorizontalDock
  onDockChange: (dock: HorizontalDock) => void
  onTurnChange?: (turn: ChatTurnIndicator | null) => void
}

interface ChatRuntime {
  sending: boolean
  streaming: string
  error: string | null
  toolCalls: ChatToolCall[]
}

export interface ChatTurnIndicator {
  actor: 'user' | 'assistant'
  label: string
  chatTitle: string
}

const emptyRuntime = (): ChatRuntime => ({ sending: false, streaming: '', error: null, toolCalls: [] })

const DEFAULT_PROVIDERS: ProviderOption[] = [
  { id: 'copilot', name: 'Copilot', configured: true },
]

export interface ChatPanelHandle {
  insertIntoComposer: (text: string) => void
}

export const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel(
  { activeFilePath, workspace, importOpen, onImportOpenChange, dock, onDockChange, onTurnChange }: Props,
  ref,
) {
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [openIds, setOpenIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [chatCache, setChatCache] = useState<Record<string, ChatDetail>>({})
  const [runtimes, setRuntimes] = useState<Record<string, ChatRuntime>>({})
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [models, setModels] = useState<CopilotModel[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>(DEFAULT_PROVIDERS)
  const [provider, setProvider] = useState('copilot')
  const [model, setModel] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [localImportOpen, setLocalImportOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const dragDepthRef = useRef(0)
  const historyRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef(activeId)
  const chatCacheRef = useRef(chatCache)
  activeIdRef.current = activeId
  chatCacheRef.current = chatCache

  const importModalOpen = importOpen ?? localImportOpen
  const setImportModalOpen = (open: boolean) => {
    onImportOpenChange?.(open)
    if (importOpen === undefined) setLocalImportOpen(open)
  }

  const chat = activeId ? (chatCache[activeId] ?? null) : null
  const runtime = activeId ? (runtimes[activeId] ?? emptyRuntime()) : emptyRuntime()
  const sending = runtime.sending
  const streaming = runtime.streaming
  const error = runtime.error
  const liveToolCalls = runtime.toolCalls

  const activeTurn = useMemo<ChatTurnIndicator | null>(() => {
    if (!chat) return null
    const running = liveToolCalls.find((t) => t.status === 'running') ?? liveToolCalls.find((t) => t.status === 'pending')
    const providerName = providers.find((p) => p.id === provider)?.name ?? 'Assistant'
    if (running) return { actor: 'assistant', label: `Running ${running.name}`, chatTitle: chat.title }
    if (streaming) return { actor: 'assistant', label: `${providerName} is thinking`, chatTitle: chat.title }
    if (sending) return { actor: 'user', label: `Waiting for ${providerName}`, chatTitle: chat.title }
    return null
  }, [chat, sending, streaming, liveToolCalls, provider, providers])

  const openChats = useMemo(() => {
    const byId = new Map(chats.map((c) => [c.id, c]))
    return openIds
      .map((id) => byId.get(id) ?? (chatCache[id] ? toSummary(chatCache[id]) : null))
      .filter((c): c is ChatSummary => c != null)
  }, [openIds, chats, chatCache])

  const normalizeModel = (value: string | null | undefined) => value?.trim() ?? ''
  const normalizeProvider = (value: string | null | undefined) => value?.trim().toLowerCase() || 'copilot'

  const resolveModel = (preferred: string | null | undefined, list: CopilotModel[], fallback: string) => {
    const preferredModel = normalizeModel(preferred)
    if (preferredModel && (list.length === 0 || list.some((m) => m.id === preferredModel))) return preferredModel
    const fallbackModel = normalizeModel(fallback)
    if (fallbackModel && (list.length === 0 || list.some((m) => m.id === fallbackModel))) return fallbackModel
    return list.find((m) => !m.policyState || m.policyState === 'enabled')?.id ?? list[0]?.id ?? preferredModel ?? fallbackModel
  }

  const persistTabs = (nextOpen: string[], nextActive: string | null) => {
    saveChatTabsState({ openIds: nextOpen, activeId: nextActive })
  }

  const patchRuntime = (id: string, patch: Partial<ChatRuntime>) => {
    setRuntimes((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyRuntime()), ...patch },
    }))
  }

  const cacheChat = (detail: ChatDetail) => {
    setChatCache((prev) => ({ ...prev, [detail.id]: detail }))
  }

  const loadModels = async (nextProvider: string, preferred?: string | null, fallback = '') => {
    const list = await api.listModels(nextProvider)
    setModels(list)
    setModel((prev) => resolveModel(preferred, list, fallback || prev))
    return list
  }

  const refreshProviders = async () => {
    try {
      const nextProviders = await api.listAiProviders()
      setProviders(nextProviders.length ? nextProviders : DEFAULT_PROVIDERS)
    } catch {
      // Keep the last known list if Wire (or another provider) cannot be probed.
    }
  }

  const applyChatSelection = async (detail: { provider?: string | null; model?: string | null }) => {
    const nextProvider = normalizeProvider(detail.provider)
    setProvider(nextProvider)
    try {
      await loadModels(nextProvider, detail.model, '')
    } catch {
      setModel((prev) => resolveModel(detail.model, [], prev))
    }
  }

  const ensureOpen = (id: string, nextOpen = openIds): string[] =>
    nextOpen.includes(id) ? nextOpen : [...nextOpen, id]

  const loadDetail = async (id: string) => {
    const detail = await api.getChat(id)
    cacheChat(detail)
    return detail
  }

  const activateChat = async (id: string, nextOpenIds?: string[]) => {
    const opened = ensureOpen(id, nextOpenIds ?? openIds)
    setOpenIds(opened)
    setActiveId(id)
    persistTabs(opened, id)
    setHistoryOpen(false)
    if (!chatCache[id]) {
      try {
        const detail = await loadDetail(id)
        await applyChatSelection(detail)
      } catch (e) {
        patchRuntime(id, { error: e instanceof Error ? e.message : 'Failed to load chat' })
      }
    } else {
      await applyChatSelection(chatCache[id])
    }
  }

  const refreshSummaries = async () => {
    const list = await api.listChats()
    setChats(list)
    return list
  }

  const bootstrap = async () => {
    const list = await refreshSummaries()
    const saved = loadChatTabsState()
    const validIds = new Set(list.map((c) => c.id))
    let nextOpen = saved.openIds.filter((id) => validIds.has(id))
    let nextActive =
      saved.activeId && nextOpen.includes(saved.activeId)
        ? saved.activeId
        : nextOpen[0] ?? null

    if (nextOpen.length === 0) {
      if (list[0]) {
        nextOpen = [list[0].id]
        nextActive = list[0].id
      } else {
        const created = await api.createChat()
        cacheChat(created)
        await refreshSummaries()
        nextOpen = [created.id]
        nextActive = created.id
        await applyChatSelection(created)
      }
    }

    setOpenIds(nextOpen)
    setActiveId(nextActive)
    persistTabs(nextOpen, nextActive)

    if (nextActive) {
      try {
        const detail = await loadDetail(nextActive)
        await applyChatSelection(detail)
      } catch (e) {
        patchRuntime(nextActive, { error: e instanceof Error ? e.message : 'Failed to load chat' })
      }
    }
  }

  useEffect(() => {
    bootstrap().catch((e: Error) => {
      patchRuntime('bootstrap', { error: e.message })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!workspace?.root) return

    setChats([])
    setOpenIds([])
    setActiveId(null)
    setChatCache({})
    setRuntimes({})
    setInput('')
    setAttachments([])
    setHistoryOpen(false)

    api.notifyWorkspaceOpened()
      .then(() => bootstrap())
      .catch((e: Error) => {
        patchRuntime('bootstrap', { error: e.message })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.root])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const load = async (attempt = 0) => {
      try {
        const [status, nextProviders] = await Promise.all([api.getCopilotStatus(), api.listAiProviders()])
        if (cancelled) return
        setProviders(nextProviders.length ? nextProviders : DEFAULT_PROVIDERS)
        const current = chatCacheRef.current[activeIdRef.current ?? '']
        const nextProvider = normalizeProvider(current?.provider ?? status.provider)
        setProvider(nextProvider)
        await loadModels(nextProvider, current?.model, status.model ?? '')
        if (cancelled) return
        if (nextProvider === 'copilot' && attempt < 8 && (!status.connected || attempt < 2)) {
          timer = window.setTimeout(() => void load(attempt + 1), 500)
        }
      } catch {
        if (cancelled) return
        setProviders((prev) => (prev.length ? prev : DEFAULT_PROVIDERS))
        if (attempt < 10) {
          timer = window.setTimeout(() => void load(attempt + 1), 500)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.root])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat?.messages, streaming, activeId])

  useEffect(() => {
    onTurnChange?.(activeTurn)
  }, [activeTurn, onTurnChange])

  useEffect(() => {
    if (!activeId || !chat) return
    const timer = window.setTimeout(() => composerRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [activeId, chat])

  useEffect(() => {
    if (!historyOpen) return
    const onPointer = (e: MouseEvent) => {
      if (!historyRef.current?.contains(e.target as Node)) setHistoryOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistoryOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [historyOpen])

  const messages = useMemo(() => chat?.messages ?? [], [chat])

  const changeProvider = async (next: string) => {
    setProvider(next)
    try {
      await loadModels(next, chat?.model, '')
      const current = chat && activeId ? chatCache[activeId] ?? chat : null
      if (current && activeId) {
        const fallbackModel = current.model ?? ''
        const list = await api.listModels(next)
        const resolved = resolveModel('', list, fallbackModel)
        setModel(resolved)
        await api.setCopilotModel(next, resolved, activeId)
        cacheChat({ ...current, provider: next, model: resolved, copilotSessionId: null })
      }
    } catch (e) {
      if (activeId) patchRuntime(activeId, { error: e instanceof Error ? e.message : 'Failed to set provider' })
    }
  }

  const changeModel = async (next: string) => {
    setModel(next)
    if (!next || !activeId) return
    try {
      await api.setCopilotModel(provider, next, activeId)
      const current = chatCache[activeId]
      if (current) {
        cacheChat({ ...current, provider, model: next, copilotSessionId: null })
      }
    } catch (e) {
      patchRuntime(activeId, { error: e instanceof Error ? e.message : 'Failed to set model' })
    }
  }

  const newChat = async () => {
    const created = await api.createChat(undefined, provider, model)
    cacheChat(created)
    await refreshSummaries()
    const opened = ensureOpen(created.id)
    setOpenIds(opened)
    setActiveId(created.id)
    persistTabs(opened, created.id)
    await applyChatSelection(created)
    patchRuntime(created.id, emptyRuntime())
    setInput('')
    setAttachments([])
    setHistoryOpen(false)
  }

  const selectChat = async (id: string) => {
    if (id === activeId) return
    setInput('')
    setAttachments([])
    await activateChat(id)
  }

  /** Hide tab only — never deletes the session, even while in progress. */
  const closeTab = (id: string) => {
    const idx = openIds.indexOf(id)
    if (idx < 0) return
    const nextOpen = openIds.filter((x) => x !== id)
    let nextActive = activeId
    if (activeId === id) {
      const fallback = nextOpen[idx] ?? nextOpen[idx - 1] ?? nextOpen[0] ?? null
      nextActive = fallback
      setInput('')
      setAttachments([])
    }
    setOpenIds(nextOpen)
    setActiveId(nextActive)
    persistTabs(nextOpen, nextActive)
    if (nextActive && nextActive !== activeId && !chatCache[nextActive]) {
      void loadDetail(nextActive)
        .then((detail) => applyChatSelection(detail))
        .catch((e: Error) => patchRuntime(nextActive!, { error: e.message }))
    } else if (nextActive && chatCache[nextActive]) {
      void applyChatSelection(chatCache[nextActive])
    }
  }

  const reopenFromHistory = async (id: string) => {
    setInput('')
    setAttachments([])
    await activateChat(id)
  }

  /** Permanently delete a chat from history and disk. */
  const deleteChat = async (id: string) => {
    try {
      await api.deleteChat(id)
    } catch (e) {
      patchRuntime(id, { error: e instanceof Error ? e.message : 'Failed to delete chat' })
      return
    }

    const idx = openIds.indexOf(id)
    const nextOpen = openIds.filter((x) => x !== id)
    let nextActive = activeId
    if (activeId === id) {
      nextActive = nextOpen[idx] ?? nextOpen[idx - 1] ?? nextOpen[0] ?? null
      setInput('')
      setAttachments([])
    }
    setOpenIds(nextOpen)
    setActiveId(nextActive)
    persistTabs(nextOpen, nextActive)
    setChats((prev) => prev.filter((c) => c.id !== id))
    setChatCache((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setRuntimes((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

    if (nextActive && nextActive !== activeId && !chatCache[nextActive]) {
      void loadDetail(nextActive)
        .then((detail) => applyChatSelection(detail))
        .catch((e: Error) => patchRuntime(nextActive!, { error: e.message }))
    } else if (nextActive && chatCache[nextActive]) {
      void applyChatSelection(chatCache[nextActive])
    }
  }

  const onImported = async (chatIds: string[]) => {
    await refreshSummaries()
    const first = chatIds[0]
    if (!first) return
    let opened = openIds
    for (const id of chatIds) opened = ensureOpen(id, opened)
    setOpenIds(opened)
    setActiveId(first)
    persistTabs(opened, first)
    patchRuntime(first, emptyRuntime())
    try {
      const detail = await loadDetail(first)
      await applyChatSelection(detail)
    } catch (e) {
      patchRuntime(first, { error: e instanceof Error ? e.message : 'Failed to load chat' })
    }
  }

  const attachActiveFile = () => {
    if (!activeFilePath) return
    const name = activeFilePath.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? activeFilePath
    setAttachments((prev) =>
      prev.some((a) => a.kind === 'file' && a.path === activeFilePath)
        ? prev
        : [...prev, { kind: 'file', path: activeFilePath, name }],
    )
  }

  const attachFiles = async (files: File[]) => {
    if (files.length === 0) return
    const next: PendingAttachment[] = []
    for (const [index, file] of files.entries()) {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      bytes.forEach((b) => {
        binary += String.fromCharCode(b)
      })
      next.push({
        kind: 'blob',
        name: namedClipboardFile(file, index),
        mimeType: file.type || 'application/octet-stream',
        dataBase64: btoa(binary),
      })
    }
    setAttachments((prev) => [...prev, ...next])
  }

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return
    await attachFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onPaste = (e: ClipboardEvent) => {
    const files = collectTransferFiles(e.clipboardData)
    if (files.length === 0) return
    e.preventDefault()
    void attachFiles(files)
  }

  const onDragEnter = (e: DragEvent) => {
    if (!hasFileTransfer(e.dataTransfer)) return
    e.preventDefault()
    dragDepthRef.current += 1
    setDragOver(true)
  }

  const onDragLeave = (e: DragEvent) => {
    if (!hasFileTransfer(e.dataTransfer)) return
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }

  const onDragOver = (e: DragEvent) => {
    if (!hasFileTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (e: DragEvent) => {
    if (!hasFileTransfer(e.dataTransfer)) return
    e.preventDefault()
    dragDepthRef.current = 0
    setDragOver(false)
    void attachFiles(collectTransferFiles(e.dataTransfer))
  }

  useImperativeHandle(
    ref,
    () => ({
      insertIntoComposer: (text: string) => {
        if (!text) return
        setInput((prev) => {
          if (!prev) return text
          const needsGap = !prev.endsWith('\n') && !text.startsWith('\n')
          return `${prev}${needsGap ? '\n' : ''}${text}`
        })
        window.setTimeout(() => composerRef.current?.focus(), 0)
      },
    }),
    [],
  )

  const send = async () => {
    if (!chat || !activeId || sending) return
    if (!input.trim() && attachments.length === 0) return

    const chatId = activeId
    const baseChat = chatCache[chatId] ?? chat
    patchRuntime(chatId, { sending: true, error: null, streaming: '', toolCalls: [] })

    const payload: MessageAttachmentRequest[] = attachments.map((a) =>
      a.kind === 'file'
        ? { kind: 'file', path: a.path, name: a.name }
        : { kind: 'blob', name: a.name, mimeType: a.mimeType, dataBase64: a.dataBase64 },
    )

    const content = input
    setInput('')
    setAttachments([])

    let localMessages = [...(baseChat.messages ?? [])]
    let streamed = ''
    let liveTools: ChatToolCall[] = []

    try {
      await api.sendMessage(
        chatId,
        content,
        payload,
        (type, body) => {
          if (type === 'user') {
          localMessages = [...localMessages, body as ChatMessage]
          setChatCache((prev) => ({
            ...prev,
            [chatId]: {
              ...(prev[chatId] ?? baseChat),
              id: chatId,
              provider,
              model,
              messages: localMessages,
            },
          }))
        } else if (type === 'tool') {
          liveTools = upsertToolCall(liveTools, body as ChatToolCall)
          patchRuntime(chatId, { toolCalls: liveTools })
        } else if (type === 'delta') {
          const chunk = (body as { content: string }).content
          streamed += chunk
          patchRuntime(chatId, { streaming: streamed })
        } else if (type === 'done') {
          const doneMessage = body as ChatMessage
          const withTools =
            doneMessage.toolCalls?.length || !liveTools.length
              ? doneMessage
              : { ...doneMessage, toolCalls: liveTools }
          localMessages = [...localMessages, withTools]
          setChatCache((prev) => {
            const current = prev[chatId] ?? baseChat
            return {
              ...prev,
              [chatId]: {
                ...current,
                id: chatId,
                messages: localMessages,
                title:
                  current.title === 'New Chat' && content.trim()
                    ? truncateTitle(content)
                    : current.title,
              },
            }
          })
          patchRuntime(chatId, { streaming: '', toolCalls: [] })
        } else if (type === 'error') {
          patchRuntime(chatId, {
            error: (body as { message: string }).message,
            streaming: '',
          })
        }
      },
        { provider, model },
      )
      await refreshSummaries()
    } catch (e) {
      patchRuntime(chatId, { error: e instanceof Error ? e.message : 'Send failed', streaming: '' })
    } finally {
      patchRuntime(chatId, { sending: false })
    }
  }

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-title">
          <h3>Chat</h3>
          {activeTurn && (
            <div className={`chat-turn-indicator ${activeTurn.actor}`}>
              <span className="chat-turn-dot" aria-hidden />
              <span>{activeTurn.label}</span>
            </div>
          )}
        </div>
        <div className="chat-header-actions">
          <select
            className="dock-select"
            value={dock}
            onChange={(e) => onDockChange(e.target.value as HorizontalDock)}
            aria-label="Dock chat"
          >
            <option value="left">Left</option>
            <option value="middle">Middle</option>
            <option value="right">Right</option>
          </select>
          <button className="icon-btn" title="Import from Cursor" onClick={() => setImportModalOpen(true)}>
            <Download size={16} />
          </button>
          <div className="chat-history-wrap" ref={historyRef}>
            <button
              className={`icon-btn${historyOpen ? ' active' : ''}`}
              title="Chat history (last 3 days)"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              <History size={16} />
            </button>
            {historyOpen && (
              <div className="chat-history-menu" role="menu">
                <div className="chat-history-menu-title">History · last 3 days</div>
                {chats.length === 0 && <div className="chat-history-empty">No chats yet</div>}
                {chats.map((c) => {
                  const isOpen = openIds.includes(c.id)
                  const busy = runtimes[c.id]?.sending || !!runtimes[c.id]?.streaming
                  return (
                    <div
                      key={c.id}
                      className={`history-item${c.id === activeId ? ' active' : ''}`}
                    >
                      <button
                        type="button"
                        className="history-item-main"
                        onClick={() => void reopenFromHistory(c.id)}
                        title={isOpen ? 'Switch to open tab' : 'Reopen chat'}
                      >
                        <span className="name">{c.title}</span>
                        <span className="history-meta">
                          {busy ? 'live' : isOpen ? 'open' : formatRelative(c.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="history-item-delete"
                        title="Delete chat permanently"
                        onClick={(e) => {
                          e.stopPropagation()
                          void deleteChat(c.id)
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
                {chats.length > 0 && (
                  <div className="chat-history-hint">
                    Closing a tab hides it; X deletes permanently. Sessions expire after 3 days.
                  </div>
                )}
              </div>
            )}
          </div>
          <button className="icon-btn" title="New chat" onClick={() => void newChat()}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="chat-tab-bar">
        {openChats.map((c) => {
          const busy = runtimes[c.id]?.sending || !!runtimes[c.id]?.streaming
          return (
            <div
              key={c.id}
              className={`tab chat-tab${c.id === activeId ? ' active' : ''}`}
              onClick={() => void selectChat(c.id)}
              title={c.title}
            >
              <span className="tab-label">
                {busy && <span className="tab-live-dot" aria-hidden />}
                {c.title}
              </span>
              <button
                type="button"
                className="close"
                title="Close tab (keeps session in history)"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(c.id)
                }}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
        {openChats.length === 0 && (
          <div className="chat-tab-empty">No open sessions — pick one from history or start new</div>
        )}
      </div>

      <div className="chat-messages">
        {!chat && (
          <div className="empty-state">
            <h2>Copilot Chat</h2>
            <p>Open a session from history (last 3 days) or start a new chat.</p>
          </div>
        )}
        {chat && messages.length === 0 && !streaming && liveToolCalls.length === 0 && (
          <div className="empty-state">
            <h2>Copilot Chat</h2>
            <p>Ask about your workspace. Attach files with the paperclip, paste from the clipboard, or drop them here.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <div className="message-role">{m.role === 'user' ? 'You' : 'Copilot'}</div>
            {m.attachments && m.attachments.length > 0 && (
              <div className="message-attachments">
                {m.attachments.map((a) => (
                  <MessageAttachmentPreview key={a.id} attachment={a} />
                ))}
              </div>
            )}
            {m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 && (
              <ToolCallList calls={m.toolCalls} />
            )}
            {m.content && (
              <div className="bubble">
                {m.role === 'assistant' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                ) : (
                  m.content
                )}
              </div>
            )}
          </div>
        ))}
        {(streaming || liveToolCalls.length > 0) && (
          <div className="message assistant">
            <div className="message-role">Copilot</div>
            {liveToolCalls.length > 0 && <ToolCallList calls={liveToolCalls} />}
            {streaming && (
              <div className="bubble streaming-cursor">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streaming}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
        {error && <div className="error-text">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-composer">
        {attachments.length > 0 && (
          <div className="message-attachments composer-attachments">
            {attachments.map((a, i) => (
              <ComposerAttachmentPreview
                key={`${a.name}-${i}`}
                attachment={a}
                onRemove={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}
        <div
          className={`composer-box${dragOver ? ' drag-over' : ''}`}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {dragOver && <div className="composer-drop-hint">Drop files to attach</div>}
          <textarea
            ref={composerRef}
            value={input}
            placeholder={
              chat
                ? 'Message Copilot… (paste or drop images/files to attach)'
                : 'Open or create a chat to message Copilot…'
            }
            disabled={!chat}
            onChange={(e) => setInput(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <div className="composer-actions">
            <div className="composer-left">
              <button
                className="icon-btn"
                title="Attach file"
                onClick={() => fileInputRef.current?.click()}
                disabled={!chat}
              >
                <Paperclip size={16} />
              </button>
              <button
                className="icon-btn"
                title="Attach active file"
                onClick={attachActiveFile}
                disabled={!activeFilePath || !chat}
              >
                <FileChipIcon />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => void onPickFiles(e.target.files)}
              />
            </div>
            <div className="composer-right">
              <select
                className="model-select"
                value={providers.some((p) => p.id === provider) ? provider : (providers[0]?.id ?? 'copilot')}
                onChange={(e) => void changeProvider(e.target.value)}
                onFocus={() => void refreshProviders()}
                disabled={sending}
                title="AI provider"
              >
                {providers.length === 0 && <option value="copilot">Copilot</option>}
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                className="model-select"
                value={model}
                onChange={(e) => void changeModel(e.target.value)}
                disabled={sending || (!models.length && !model)}
                title="Model"
              >
                {models.length === 0 && <option value={model}>{model || 'No models'}</option>}
                {model && models.length > 0 && !models.some((m) => m.id === model) && (
                  <option value={model}>{model}</option>
                )}
                {models.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.policyState === 'disabled'}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button className="primary-btn" onClick={() => void send()} disabled={sending || !chat}>
                <SendHorizontal size={14} />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      <ImportCursorChatsModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={(ids) => void onImported(ids)}
      />
    </aside>
  )
})

function toSummary(detail: ChatDetail): ChatSummary {
  return {
    id: detail.id,
    title: detail.title,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    copilotSessionId: detail.copilotSessionId,
    model: detail.model,
  }
}

function truncateTitle(value: string, max = 48): string {
  const t = value.trim().replace(/\s+/g, ' ')
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h`
  const days = Math.round(hours / 24)
  return `${days}d`
}

function upsertToolCall(list: ChatToolCall[], call: ChatToolCall): ChatToolCall[] {
  const index = list.findIndex((item) => item.id === call.id)
  if (index < 0) return [...list, call]
  const next = [...list]
  next[index] = call
  return next
}

function toolStatusLabel(status: string) {
  if (status === 'running') return 'Running'
  if (status === 'pending') return 'Preparing'
  if (status === 'error') return 'Failed'
  return 'Done'
}

function prettyToolText(value?: string | null) {
  if (!value) return ''
  const trimmed = value.trim()
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return trimmed
  }
}

function ToolCallList({ calls }: { calls: ChatToolCall[] }) {
  return (
    <div className="tool-call-list">
      {calls.map((call) => (
        <ToolCallCard key={call.id} call={call} />
      ))}
    </div>
  )
}

function ToolCallCard({ call }: { call: ChatToolCall }) {
  const [open, setOpen] = useState(false)
  const preview = call.detail || call.error || call.arguments || call.result || ''
  const body = [call.arguments && `Arguments\n${prettyToolText(call.arguments)}`, call.result && `Result\n${prettyToolText(call.result)}`, call.error && `Error\n${call.error}`]
    .filter(Boolean)
    .join('\n\n')

  return (
    <div className={`tool-call ${call.status}`}>
      <button type="button" className="tool-call-header" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={13} />
        <span className="tool-call-name">{call.name}</span>
        <span className="tool-call-status">{toolStatusLabel(call.status)}</span>
        {!open && preview && <span className="tool-call-preview">{preview}</span>}
      </button>
      {open && body && <pre className="tool-call-body">{body}</pre>}
    </div>
  )
}

function FileChipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function MessageAttachmentPreview({ attachment }: { attachment: ChatAttachment }) {
  const src = getAttachmentPreviewSrc(attachment)
  const isImage = isImageAttachment(attachment)

  return (
    <div className={`attachment-card${isImage ? ' image' : ''}`}>
      {src ? (
        <img className="attachment-thumb" src={src} alt={attachment.name} />
      ) : (
        <div className="attachment-thumb attachment-thumb-fallback" aria-hidden="true">
          <ImageIcon size={16} />
        </div>
      )}
      <span className="attachment-name" title={attachment.name}>
        {attachment.name}
      </span>
    </div>
  )
}

function ComposerAttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment
  onRemove: () => void
}) {
  const src = getPendingAttachmentPreviewSrc(attachment)
  const isImage = isPendingImageAttachment(attachment)

  return (
    <div className={`attachment-card${isImage ? ' image' : ''}`}>
      {src ? (
        <img className="attachment-thumb" src={src} alt={attachment.name} />
      ) : (
        <div className="attachment-thumb attachment-thumb-fallback" aria-hidden="true">
          <ImageIcon size={16} />
        </div>
      )}
      <span className="attachment-name" title={attachment.name}>
        {attachment.name}
      </span>
      <button onClick={onRemove} aria-label="Remove attachment">
        <X size={12} />
      </button>
    </div>
  )
}

function hasFileTransfer(data: DataTransfer | null): boolean {
  if (!data) return false
  if (data.types.includes('Files')) return true
  return Array.from(data.items ?? []).some((item) => item.kind === 'file')
}

function collectTransferFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  const fromItems: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) fromItems.push(file)
  }
  if (fromItems.length > 0) return fromItems
  return Array.from(data.files ?? [])
}

function namedClipboardFile(file: File, index: number): string {
  const raw = file.name?.trim()
  if (raw && raw !== 'blob') return raw
  const ext = extensionForMime(file.type) ?? 'bin'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const suffix = index > 0 ? `-${index + 1}` : ''
  return `clipboard-${stamp}${suffix}.${ext}`
}

function extensionForMime(mime: string): string | null {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  }
  return map[mime] ?? null
}

function isImageAttachment(attachment: ChatAttachment): boolean {
  return attachment.mimeType?.startsWith('image/') ?? false
}

function isPendingImageAttachment(attachment: PendingAttachment): boolean {
  return attachment.kind === 'blob' && attachment.mimeType.startsWith('image/')
}

function getAttachmentPreviewSrc(attachment: ChatAttachment): string | null {
  if (!isImageAttachment(attachment) || !attachment.dataBase64) return null
  return `data:${attachment.mimeType ?? 'image/*'};base64,${attachment.dataBase64}`
}

function getPendingAttachmentPreviewSrc(attachment: PendingAttachment): string | null {
  if (attachment.kind !== 'blob' || !attachment.mimeType.startsWith('image/')) return null
  return `data:${attachment.mimeType};base64,${attachment.dataBase64}`
}
