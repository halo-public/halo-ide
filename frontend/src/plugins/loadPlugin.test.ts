import { describe, expect, it, vi } from 'vitest'
import { activatePluginSource } from './loadPlugin'
import { createPluginSession } from './session'
import type { MiniPluginApi } from './types'

describe('activatePluginSource', () => {
  it('runs activate(api) from a plugin script', () => {
    const register = vi.fn()
    const api = {
      id: 'hello',
      registerContextMenuItem: register,
      registerTitleItem: vi.fn(),
      registerLanguage: vi.fn(),
      log: vi.fn(),
      clipboard: { write: vi.fn() },
      workspace: { readFile: vi.fn() },
      showMarkdown: vi.fn(),
    } satisfies MiniPluginApi

    activatePluginSource(
      `
        function activate(api) {
          api.registerContextMenuItem({
            id: 'copyName',
            title: 'Copy File Name',
            locations: ['explorer', 'editor'],
            run: function () {}
          })
        }
      `,
      api,
    )

    expect(register).toHaveBeenCalledOnce()
    expect(register.mock.calls[0]?.[0]).toMatchObject({ id: 'copyName', title: 'Copy File Name' })
  })

  it('rejects scripts without activate', () => {
    const api = {
      id: 'bad',
      registerContextMenuItem: vi.fn(),
      registerTitleItem: vi.fn(),
      registerLanguage: vi.fn(),
      log: vi.fn(),
      clipboard: { write: vi.fn() },
      workspace: { readFile: vi.fn() },
      showMarkdown: vi.fn(),
    } satisfies MiniPluginApi

    expect(() => activatePluginSource('const x = 1', api)).toThrow(/activate/)
  })
})

describe('createPluginSession', () => {
  it('always registers builtin copy commands', () => {
    const session = createPluginSession(() => undefined)
    expect(session.plugins.some((p) => p.id === 'builtin')).toBe(true)
    expect(session.items.map((i) => i.id)).toEqual(
      expect.arrayContaining(['copyPath', 'copyAbsolutePath', 'copyFileName', 'openMarkdownPreview']),
    )
  })

  it('loads a workspace plugin and keeps builtin items', () => {
    const logs: string[] = []
    const session = createPluginSession((m) => logs.push(m))
    session.activateWorkspacePlugin({
      id: 'hello',
      name: 'Hello',
      version: '1.0.0',
      source: `
        function activate(api) {
          api.registerContextMenuItem({
            id: 'ping',
            title: 'Ping',
            locations: ['explorer'],
            target: 'folder',
            run: function () { api.log('ping') }
          })
        }
      `,
    })

    expect(session.items.some((i) => i.id === 'ping' && i.pluginId === 'hello')).toBe(true)
    expect(session.items.some((i) => i.pluginId === 'builtin')).toBe(true)
  })

  it('normalizes files from a string or array', () => {
    const session = createPluginSession(() => undefined)
    session.activateWorkspacePlugin({
      id: 'typed',
      name: 'Typed',
      version: '1.0.0',
      source: `
        function activate(api) {
          api.registerContextMenuItem({
            id: 'json',
            title: 'JSON',
            files: '.json',
            run: function () {}
          })
          api.registerContextMenuItem({
            id: 'js',
            title: 'JS',
            files: ['javascript', '*.js'],
            run: function () {}
          })
        }
      `,
    })

    const json = session.items.find((i) => i.id === 'json')
    const js = session.items.find((i) => i.id === 'js')
    expect(json?.files).toEqual(['.json'])
    expect(js?.files).toEqual(['javascript', '*.js'])
  })

  it('registers builtin language maps and lets workspace plugins override', () => {
    const session = createPluginSession(() => undefined)
    expect(session.detectLanguage('src/app.tsx')).toBe('typescript')
    expect(session.detectLanguage('main.cpp')).toBe('cpp')
    expect(session.detectLanguage('Dockerfile')).toBe('dockerfile')
    expect(session.detectLanguage('unknown.zzz')).toBe('plaintext')

    session.activateWorkspacePlugin({
      id: 'extra',
      name: 'Extra',
      version: '1.0.0',
      source: `
        function activate(api) {
          api.registerLanguage({
            id: 'javascript',
            extensions: ['.zzz'],
          })
          api.registerLanguage({
            id: 'hello',
            extensions: ['.hello'],
            monarch: { tokenizer: { root: [] } },
          })
        }
      `,
    })

    expect(session.detectLanguage('weird.zzz')).toBe('javascript')
    expect(session.detectLanguage('src/app.tsx')).toBe('typescript')
    const hello = session.languages.find((l) => l.id === 'hello')
    expect(hello?.monarch).toBeTruthy()
    expect(hello?.pluginId).toBe('extra')
  })

  it('registers title items and defaults locations to editor', () => {
    const session = createPluginSession(() => undefined)
    session.activateWorkspacePlugin({
      id: 'title',
      name: 'Title',
      version: '1.0.0',
      source: `
        function activate(api) {
          api.registerTitleItem({
            id: 'ping',
            title: 'Ping',
            run: function () {}
          })
          api.registerTitleItem({
            id: 'tree',
            title: 'Tree',
            locations: ['explorer'],
            run: function () {}
          })
        }
      `,
    })
    const ping = session.titleItems.find((i) => i.id === 'ping')
    const tree = session.titleItems.find((i) => i.id === 'tree')
    expect(ping?.locations).toEqual(['editor'])
    expect(tree?.locations).toEqual(['explorer'])
  })

  it('opens markdown preview from the builtin context menu', async () => {
    const shown: { title?: string; content: string; path?: string }[] = []
    const reads: string[] = []
    const session = createPluginSession(() => undefined, {
      readFile: async (path) => {
        reads.push(path)
        return { path, content: '# From disk' }
      },
      showMarkdown: (doc) => {
        shown.push(doc)
      },
    })

    const item = session.items.find((i) => i.id === 'openMarkdownPreview')
    expect(item?.files).toEqual(['.md', '.markdown', 'markdown'])
    expect(item?.target).toBe('file')

    await item?.run({
      location: 'explorer',
      path: 'docs/README.md',
      workspaceRoot: '/ws',
      isDirectory: false,
    })
    expect(reads).toEqual(['docs/README.md'])
    expect(shown).toEqual([
      { title: 'README.md', content: '# From disk', path: 'docs/README.md' },
    ])

    shown.length = 0
    reads.length = 0
    await item?.run({
      location: 'editor',
      path: 'notes.md',
      workspaceRoot: '/ws',
      isDirectory: false,
      content: '# Unsaved',
    })
    expect(reads).toEqual([])
    expect(shown).toEqual([{ title: 'notes.md', content: '# Unsaved', path: 'notes.md' }])
  })

  it('lets workspace plugins display markdown', async () => {
    const shown: { content: string }[] = []
    const session = createPluginSession(() => undefined, {
      readFile: async (path) => ({ path, content: 'hello' }),
      showMarkdown: (doc) => {
        shown.push(doc)
      },
    })
    session.activateWorkspacePlugin({
      id: 'md',
      name: 'Markdown',
      version: '1.0.0',
      source: `
        function activate(api) {
          api.registerContextMenuItem({
            id: 'show',
            title: 'Show',
            files: ['.md'],
            run: async function (ctx) {
              const file = await api.workspace.readFile(ctx.path)
              api.showMarkdown({ title: 'Custom', content: file.content })
            }
          })
        }
      `,
    })

    const item = session.items.find((i) => i.id === 'show' && i.pluginId === 'md')
    await item?.run({
      location: 'explorer',
      path: 'a.md',
      workspaceRoot: '/ws',
      isDirectory: false,
    })
    expect(shown).toEqual([{ title: 'Custom', content: 'hello' }])
  })
})
