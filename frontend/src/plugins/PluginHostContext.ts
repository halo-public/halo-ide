import { createContext, useContext } from 'react'
import type { ContextMenuMatchInput } from './match'
import type {
  ContextMenuContext,
  MarkdownDocument,
  PluginRecord,
  RegisteredContextMenuItem,
  RegisteredLanguage,
  RegisteredTitleItem,
} from './types'

export interface PluginHostValue {
  workspaceRoot: string
  plugins: PluginRecord[]
  items: RegisteredContextMenuItem[]
  titleItems: RegisteredTitleItem[]
  languages: RegisteredLanguage[]
  detectLanguage: (path: string) => string
  reload: () => void
  runItem: (
    item: RegisteredContextMenuItem | RegisteredTitleItem,
    ctx: Omit<ContextMenuContext, 'workspaceRoot'>,
  ) => void
  markdownPreview: MarkdownDocument | null
  closeMarkdownPreview: () => void
  itemsFor: (input: ContextMenuMatchInput) => RegisteredContextMenuItem[]
  titleItemsFor: (input: ContextMenuMatchInput) => RegisteredTitleItem[]
}

const emptyHost: PluginHostValue = {
  workspaceRoot: '',
  plugins: [],
  items: [],
  titleItems: [],
  languages: [],
  detectLanguage: () => 'plaintext',
  reload: () => undefined,
  runItem: () => undefined,
  markdownPreview: null,
  closeMarkdownPreview: () => undefined,
  itemsFor: () => [],
  titleItemsFor: () => [],
}

export const PluginHostContext = createContext<PluginHostValue>(emptyHost)

export function usePluginHost(): PluginHostValue {
  return useContext(PluginHostContext)
}
