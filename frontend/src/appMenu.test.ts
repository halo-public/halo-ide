import { describe, expect, it } from 'vitest'
import {
  acceleratorDetail,
  buildMenuTemplate,
  paletteCommands,
  type AppCommand,
} from './appMenu'

function cmd(partial: Partial<AppCommand> & Pick<AppCommand, 'id' | 'label'>): AppCommand {
  return { run: () => undefined, ...partial }
}

describe('acceleratorDetail', () => {
  it('uses Ctrl on Windows and Cmd on macOS', () => {
    expect(acceleratorDetail('CmdOrCtrl+Shift+P', 'win32')).toBe('Ctrl+Shift+P')
    expect(acceleratorDetail('CmdOrCtrl+P', 'darwin')).toBe('Cmd+P')
  })
})

describe('buildMenuTemplate', () => {
  const commands: AppCommand[] = [
    cmd({ id: 'openFolder', label: 'Open Folder…', menu: { menu: 'file', order: 10 } }),
    cmd({ id: 'save', label: 'Save', menu: { menu: 'file', order: 20, separatorBefore: true } }),
    cmd({ id: 'format', label: 'Format Document', menu: { menu: 'edit', order: 10 } }),
    cmd({
      id: 'toolbar.run',
      label: 'Toggle Run Toolbar',
      menu: { menu: 'view', order: 40, submenu: 'appearance', label: 'Run Toolbar' },
      checked: true,
    }),
    cmd({
      id: 'theme:dark',
      label: 'Color Theme: Dark',
      menu: { menu: 'view', order: 80, submenu: 'colorTheme', label: 'Dark', separatorBefore: true },
      checked: true,
    }),
    cmd({ id: 'gotoFile', label: 'Go to File…', menu: { menu: 'go', order: 10 } }),
    cmd({ id: 'run', label: 'Run', menu: { menu: 'run', order: 10 }, enabled: false }),
    cmd({ id: 'terminal', label: 'Focus Terminal', menu: { menu: 'terminal', order: 10 } }),
    cmd({ id: 'settings', label: 'Open Settings', menu: { menu: 'help', order: 10 } }),
    cmd({ id: 'paletteOnly', label: 'Hidden from menus' }),
  ]

  it('builds File through Help in order and injects Open Recent after Open Folder', () => {
    const template = buildMenuTemplate(commands, {
      recentFolders: [{ path: 'C:\\proj', label: 'proj' }],
      currentRoot: 'C:\\proj',
    })
    expect(template.map((m) => m.label)).toEqual(['File', 'Edit', 'View', 'Go', 'Run', 'Terminal', 'Help'])

    const file = template[0]?.submenu ?? []
    expect(file[0]).toMatchObject({ id: 'openFolder', label: 'Open Folder…' })
    expect(file[1]?.label).toBe('Open Recent')
    expect(file[1]?.submenu?.[0]).toMatchObject({
      id: 'openRecent',
      data: 'C:\\proj',
      label: 'proj',
      type: 'checkbox',
      checked: true,
    })
    expect(file.some((item) => item.type === 'separator')).toBe(true)
    expect(file.at(-1)).toMatchObject({ role: 'quit', label: 'Exit' })
  })

  it('prepends native Edit roles and nests Appearance / Color Theme', () => {
    const template = buildMenuTemplate(commands)
    const edit = template[1]?.submenu ?? []
    expect(edit[0]).toMatchObject({ role: 'undo' })
    expect(edit.some((item) => item.id === 'format')).toBe(true)

    const view = template[2]?.submenu ?? []
    const appearance = view.find((item) => item.label === 'Appearance')
    expect(appearance?.submenu?.[0]).toMatchObject({
      id: 'toolbar.run',
      label: 'Run Toolbar',
      type: 'checkbox',
      checked: true,
    })
    const theme = view.find((item) => item.label === 'Color Theme')
    expect(theme?.submenu?.[0]).toMatchObject({ id: 'theme:dark', label: 'Dark' })
  })

  it('honors enabled: false', () => {
    const run = buildMenuTemplate(commands)[4]?.submenu ?? []
    expect(run[0]).toMatchObject({ id: 'run', enabled: false })
  })

  it('omits commands without menu metadata from the template', () => {
    const ids = JSON.stringify(buildMenuTemplate(commands))
    expect(ids).not.toContain('paletteOnly')
  })
})

describe('paletteCommands', () => {
  it('drops menu-only commands', () => {
    const list = paletteCommands([
      cmd({ id: 'a', label: 'A' }),
      cmd({ id: 'b', label: 'B', palette: false }),
    ])
    expect(list.map((c) => c.id)).toEqual(['a'])
  })
})
