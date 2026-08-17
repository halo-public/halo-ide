export type ContextMenuLocation = 'explorer' | 'editor'
export type TitleLocation = 'explorer' | 'editor'
export type ContextMenuTarget = 'file' | 'folder' | 'any'

export interface ContextMenuContext {
  location: ContextMenuLocation
  /** Workspace-relative path; empty string is the workspace root. */
  path: string
  workspaceRoot: string
  isDirectory: boolean
  language?: string
  selection?: string
  line?: number
  column?: number
}

export interface ContextMenuItemSpec {
  id: string
  title: string
  /** Defaults to both explorer and editor. */
  locations?: ContextMenuLocation[]
  /** Defaults to any. */
  target?: ContextMenuTarget
  /**
   * Limit to file types. Each entry may be an extension (`.json` or `json`),
   * a Monaco language id (`javascript`), a file name (`package.json`), or a glob.
   * Omit to match every file and folder (subject to `target`).
   */
  files?: string | string[]
  run: (ctx: ContextMenuContext) => void | Promise<void>
}

export interface TitleItemSpec {
  id: string
  title: string
  /** Defaults to editor. */
  locations?: TitleLocation[]
  /** Defaults to any. */
  target?: ContextMenuTarget
  files?: string | string[]
  run: (ctx: ContextMenuContext) => void | Promise<void>
}

/** Monarch tokenizer object (plain JSON-like). Omit to use a language Monaco already ships. */
export type MonarchTokenizer = Record<string, unknown>

export interface LanguageSpec {
  id: string
  extensions?: string | string[]
  filenames?: string | string[]
  aliases?: string | string[]
  monarch?: MonarchTokenizer
}

export interface RegisteredLanguage {
  pluginId: string
  pluginName: string
  id: string
  extensions: string[]
  filenames: string[]
  aliases: string[]
  monarch?: MonarchTokenizer
}

export interface MiniPluginApi {
  id: string
  registerContextMenuItem(item: ContextMenuItemSpec): void
  registerTitleItem(item: TitleItemSpec): void
  registerLanguage(language: LanguageSpec): void
  log(message: string): void
  clipboard: {
    write(text: string): Promise<void>
  }
}

export interface RegisteredContextMenuItem {
  pluginId: string
  pluginName: string
  id: string
  title: string
  locations: ContextMenuLocation[]
  target: ContextMenuTarget
  files: string[]
  run: (ctx: ContextMenuContext) => void | Promise<void>
}

export interface RegisteredTitleItem {
  pluginId: string
  pluginName: string
  id: string
  title: string
  locations: TitleLocation[]
  target: ContextMenuTarget
  files: string[]
  run: (ctx: ContextMenuContext) => void | Promise<void>
}

export interface PluginRecord {
  id: string
  name: string
  version: string
  origin: 'builtin' | 'workspace'
}

export interface PluginSource {
  id: string
  name: string
  version: string
  source: string
}
