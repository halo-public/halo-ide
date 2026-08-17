import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { filterContextMenuItems, filterTitleItems, type ContextMenuMatchInput } from './match'
import { detectLanguageFrom } from './languages'
import { createPluginSession } from './session'
import type {
  ContextMenuContext,
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
  const [nonce, setNonce] = useState(0)
  const onLogRef = useRef(onLog)
  onLogRef.current = onLog

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const log = (message: string) => {
      if (!cancelled) onLogRef.current(message)
    }

    ;(async () => {
      const session = createPluginSession(log)
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
      itemsFor: (input: ContextMenuMatchInput) => filterContextMenuItems(items, input),
      titleItemsFor: (input: ContextMenuMatchInput) => filterTitleItems(titleItems, input),
    }),
    [workspaceRoot, plugins, items, titleItems, languages, detectLanguage, reload, runItem],
  )
}

