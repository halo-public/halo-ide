import { builtinPluginMeta, registerBuiltinPlugins } from './builtins'
import { writeClipboard } from './clipboard'
import { normalizeFilePatterns } from './fileTypes'
import { detectLanguageFrom, normalizeLanguage } from './languages'
import { activatePluginSource } from './loadPlugin'
import type {
  ContextMenuItemSpec,
  LanguageSpec,
  MarkdownDocument,
  MiniPluginApi,
  PluginRecord,
  PluginSource,
  RegisteredContextMenuItem,
  RegisteredLanguage,
  RegisteredTitleItem,
  TitleItemSpec,
  WorkspaceFileContent,
} from './types'

const LOCATIONS = ['explorer', 'editor'] as const
const TITLE_LOCATIONS = ['editor'] as const

function normalizeItem(
  pluginId: string,
  pluginName: string,
  item: ContextMenuItemSpec,
): RegisteredContextMenuItem {
  const id = item.id?.trim()
  const title = item.title?.trim()
  if (!id) throw new Error('Context menu item is missing id')
  if (!title) throw new Error('Context menu item is missing title')
  if (typeof item.run !== 'function') throw new Error(`Context menu item "${id}" is missing run()`)

  const locations = item.locations?.length ? item.locations : [...LOCATIONS]
  const target = item.target ?? 'any'
  return {
    pluginId,
    pluginName,
    id,
    title,
    locations,
    target,
    files: normalizeFilePatterns(item.files),
    run: item.run,
  }
}

function normalizeTitleItem(
  pluginId: string,
  pluginName: string,
  item: TitleItemSpec,
): RegisteredTitleItem {
  const id = item.id?.trim()
  const title = item.title?.trim()
  if (!id) throw new Error('Title item is missing id')
  if (!title) throw new Error('Title item is missing title')
  if (typeof item.run !== 'function') throw new Error(`Title item "${id}" is missing run()`)

  const locations = item.locations?.length ? item.locations : [...TITLE_LOCATIONS]
  const target = item.target ?? 'any'
  return {
    pluginId,
    pluginName,
    id,
    title,
    locations,
    target,
    files: normalizeFilePatterns(item.files),
    run: item.run,
  }
}

export interface PluginHostCapabilities {
  readFile(path: string): Promise<WorkspaceFileContent>
  showMarkdown(doc: MarkdownDocument): void
}

export function createPluginSession(
  log: (message: string) => void,
  host?: PluginHostCapabilities,
) {
  const items: RegisteredContextMenuItem[] = []
  const titleItems: RegisteredTitleItem[] = []
  const languages: RegisteredLanguage[] = []
  const plugins: PluginRecord[] = []

  const createApi = (plugin: PluginRecord): MiniPluginApi => ({
    id: plugin.id,
    log: (message: string) => log(`[${plugin.name}] ${message}`),
    clipboard: { write: writeClipboard },
    workspace: {
      readFile(path: string) {
        if (!host?.readFile) throw new Error('workspace.readFile is not available')
        return host.readFile(path)
      },
    },
    showMarkdown(doc) {
      if (!host?.showMarkdown) throw new Error('showMarkdown is not available')
      host.showMarkdown(doc)
    },
    registerContextMenuItem(item) {
      items.push(normalizeItem(plugin.id, plugin.name, item))
    },
    registerTitleItem(item) {
      titleItems.push(normalizeTitleItem(plugin.id, plugin.name, item))
    },
    registerLanguage(language: LanguageSpec) {
      languages.push(normalizeLanguage(plugin.id, plugin.name, language))
    },
  })

  const activate = (plugin: PluginRecord, source?: string) => {
    const api = createApi(plugin)
    if (plugin.origin === 'builtin') {
      registerBuiltinPlugins(api)
    } else {
      if (!source) throw new Error(`Plugin "${plugin.id}" has no source`)
      activatePluginSource(source, api)
    }
    plugins.push(plugin)
  }

  activate(builtinPluginMeta)

  return {
    items,
    titleItems,
    languages,
    plugins,
    detectLanguage(path: string) {
      return detectLanguageFrom(path, languages)
    },
    activateWorkspacePlugin(plugin: PluginSource) {
      activate(
        {
          id: plugin.id,
          name: plugin.name,
          version: plugin.version,
          origin: 'workspace',
        },
        plugin.source,
      )
    },
  }
}
