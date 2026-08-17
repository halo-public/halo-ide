import type { MiniPluginApi } from './types'

export function activatePluginSource(source: string, api: MiniPluginApi): void {
  const trimmed = source.trim()
  if (!trimmed) throw new Error('Plugin source is empty')

  // Workspace plugins are trusted local scripts, same as launch tasks.
  const run = new Function(
    'api',
    `"use strict";\n${trimmed}\n;if (typeof activate !== "function") {\n  throw new Error("Plugin must define function activate(api)");\n}\nactivate(api);`,
  ) as (api: MiniPluginApi) => void
  run(api)
}
