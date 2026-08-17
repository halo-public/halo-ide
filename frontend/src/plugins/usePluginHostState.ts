import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { filterContextMenuItems, filterTitleItems, type ContextMenuMatchInput } from './match'
import { detectLanguageFrom } from './languages'
import { createPluginSession, type PluginHostCapabilities } from './session'
import type {
  ContextMenuContext,
  MarkdownDocument,
  PluginRecord,
  RegisteredContextMenuItem,
  RegisteredLanguage,
  RegisteredTitleItem,
} from './types'

export function usePluginHostState(
  workspaceRoot: string | undefined,
  onLog: (message: string) => void,
) {
  const [items, setItems] = useState<RegisteredContextMenuItem[]>([])
  const [titleItems, setTitleItems] = useState<RegisteredTitleItem[]>([])
  const [languages, setLanguages] = useState<RegisteredLanguage[]>([])
  const [plugins, setPlugins] = useState<PluginRecord[]>([])
  const [markdownPreview, setMarkdownPreview] = useState<MarkdownDocument | null>(null)
  const [nonce, setNonce] = useState(0)
  const onLogRef = useRef(onLog)
  onLogRef.current = onLog
  const hostRef = useRef<PluginHostCapabilities>({
    readFile: async (path) => {
      const file = await api.readFile(path)
      return { path: file.path, content: file.content }
    },
    showMarkdown: () => undefined,
  })
  hostRef.current.showMarkdown = (doc) => {
    setMarkdownPreview({
      title: doc.title?.trim() || 'Markdown',
      content: doc.content ?? '',
      path: doc.path,
    })
  }

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const closeMarkdownPreview = useCallback(() => setMarkdownPreview(null), [])

  useEffect(() => {
    let cancelled = false
    const log = (message: string) => {
      if (!cancelled) onLogRef.current(message)
    }

    ;(async () => {
      const session = createPluginSession(log, {
        readFile: (path) => hostRef.current.readFile(path),
        showMarkdown: (doc) => hostRef.current.showMarkdown(doc),
      })
      if (workspaceRoot) {
        try {
          const listed = await api.listPlugins()
          for (const info of listed) {
            try {
              const source = await api.getPlugin(info.id)
              session.activateWorkspacePlugin(source)
            } catch (e) {
              log(`Failed to load plugin "${info.id}": ${e instanceof Error ? e.message : e}`)
            }
          }
        } catch (e) {
          log(`Failed to list plugins: ${e instanceof Error ? e.message : e}`)
        }
      }
      if (cancelled) return
      setItems(session.items)
      setTitleItems(session.titleItems)
      setLanguages(session.languages)
      setPlugins(session.plugins)
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceRoot, nonce])

  useEffect(() => {
    setMarkdownPreview(null)
  }, [workspaceRoot])

  const runItem = useCallback(
    (
      item: RegisteredContextMenuItem | RegisteredTitleItem,
      ctx: Omit<ContextMenuContext, 'workspaceRoot'>,
    ) => {
      const full: ContextMenuContext = {
        ...ctx,
        workspaceRoot: workspaceRoot ?? '',
      }
      void Promise.resolve(item.run(full)).catch((e: unknown) => {
        onLogRef.current(
          `Plugin "${item.pluginName}" item "${item.title}" failed: ${e instanceof Error ? e.message : e}`,
        )
      })
    },
    [workspaceRoot],
  )

  const detectLanguage = useCallback(
    (path: string) => detectLanguageFrom(path, languages),
    [languages],
  )

  return useMemo(
    () => ({
      workspaceRoot: workspaceRoot ?? '',
      plugins,
      items,
      titleItems,
      languages,
      detectLanguage,
      reload,
      runItem,
      markdownPreview,
      closeMarkdownPreview,
      itemsFor: (input: ContextMenuMatchInput) => filterContextMenuItems(items, input),
      titleItemsFor: (input: ContextMenuMatchInput) => filterTitleItems(titleItems, input),
    }),
    [
      workspaceRoot,
      plugins,
      items,
      titleItems,
      languages,
      detectLanguage,
      reload,
      runItem,
      markdownPreview,
      closeMarkdownPreview,
    ],
  )
}
