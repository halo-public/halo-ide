import type { MiniPluginApi } from './types'

const BUILTIN_LANGUAGES: { id: string; extensions?: string[]; filenames?: string[]; aliases?: string[] }[] = [
  { id: 'csharp', extensions: ['.cs', '.csx'], aliases: ['C#'] },
  { id: 'typescript', extensions: ['.ts', '.tsx'], aliases: ['TypeScript'] },
  { id: 'javascript', extensions: ['.js', '.jsx', '.mjs', '.cjs'], aliases: ['JavaScript'] },
  { id: 'json', extensions: ['.json', '.jsonc'] },
  { id: 'markdown', extensions: ['.md', '.markdown'] },
  { id: 'css', extensions: ['.css'] },
  { id: 'html', extensions: ['.html', '.htm', '.vue', '.svelte'] },
  { id: 'python', extensions: ['.py'], aliases: ['Python'] },
  { id: 'yaml', extensions: ['.yml', '.yaml'] },
  { id: 'xml', extensions: ['.xml'] },
  { id: 'shell', extensions: ['.sh', '.bash', '.zsh', '.mk'], filenames: ['Makefile', 'makefile', 'GNUmakefile'] },
  { id: 'powershell', extensions: ['.ps1', '.psm1'] },
  { id: 'sql', extensions: ['.sql'] },
  { id: 'go', extensions: ['.go'] },
  { id: 'rust', extensions: ['.rs'] },
  { id: 'java', extensions: ['.java'] },
  { id: 'kotlin', extensions: ['.kt', '.kts'] },
  { id: 'ruby', extensions: ['.rb'] },
  { id: 'php', extensions: ['.php'] },
  { id: 'scss', extensions: ['.scss'] },
  { id: 'less', extensions: ['.less'] },
  { id: 'ini', extensions: ['.ini', '.toml'] },
  { id: 'plaintext', extensions: ['.txt'], filenames: ['.gitignore', '.gitattributes', '.editorconfig'] },
  { id: 'cpp', extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hxx'], aliases: ['C++'] },
  { id: 'objective-c', extensions: ['.m', '.mm'] },
  { id: 'dockerfile', extensions: ['.dockerfile'], filenames: ['Dockerfile', 'dockerfile'] },
  { id: 'lua', extensions: ['.lua'] },
  { id: 'dart', extensions: ['.dart'] },
  { id: 'swift', extensions: ['.swift'] },
  { id: 'r', extensions: ['.r', '.R'] },
  { id: 'graphql', extensions: ['.graphql', '.gql'] },
  { id: 'protobuf', extensions: ['.proto'] },
  { id: 'hcl', extensions: ['.hcl', '.tf'] },
  { id: 'elixir', extensions: ['.ex', '.exs'] },
  { id: 'scala', extensions: ['.scala', '.sc'] },
  { id: 'clojure', extensions: ['.clj', '.cljs', '.cljc'] },
  { id: 'fsharp', extensions: ['.fs', '.fsi', '.fsx'] },
  { id: 'perl', extensions: ['.pl', '.pm'] },
  { id: 'bat', extensions: ['.bat', '.cmd'] },
]

function absolutePath(workspaceRoot: string, relative: string): string {
  if (!relative) return workspaceRoot
  const slash = workspaceRoot.includes('\\') ? '\\' : '/'
  const root = workspaceRoot.replace(/[\\/]+$/, '')
  return `${root}${slash}${relative.replaceAll('/', slash)}`
}

function fileName(relative: string): string {
  const parts = relative.split('/')
  return parts.at(-1) || relative
}

export function registerBuiltinPlugins(api: MiniPluginApi): void {
  for (const language of BUILTIN_LANGUAGES) {
    api.registerLanguage(language)
  }

  api.registerContextMenuItem({
    id: 'copyPath',
    title: 'Copy Path',
    locations: ['explorer', 'editor'],
    run: async (ctx) => {
      await api.clipboard.write(ctx.path || '.')
    },
  })

  api.registerContextMenuItem({
    id: 'copyAbsolutePath',
    title: 'Copy Absolute Path',
    locations: ['explorer', 'editor'],
    run: async (ctx) => {
      await api.clipboard.write(absolutePath(ctx.workspaceRoot, ctx.path))
    },
  })

  api.registerContextMenuItem({
    id: 'copyFileName',
    title: 'Copy File Name',
    locations: ['explorer', 'editor'],
    target: 'file',
    run: async (ctx) => {
      await api.clipboard.write(fileName(ctx.path))
    },
  })
}

export const builtinPluginMeta = {
  id: 'builtin',
  name: 'Halo IDE',
  version: '0.1.0',
  origin: 'builtin' as const,
}
