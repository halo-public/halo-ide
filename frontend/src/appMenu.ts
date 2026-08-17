export type MenuName = 'file' | 'edit' | 'view' | 'go' | 'run' | 'terminal' | 'help'

export type AppCommand = {
  id: string
  label: string
  /** Palette / HTML hint, e.g. Ctrl+P */
  detail?: string
  /** Electron accelerator, e.g. CmdOrCtrl+P */
  accelerator?: string
  menu?: {
    menu: MenuName
    order: number
    separatorBefore?: boolean
    submenu?: string
    /** Menu caption when it should differ from the palette label. */
    label?: string
  }
  checked?: boolean
  enabled?: boolean
  /** When false, the command is menu-only. Default true. */
  palette?: boolean
  run: () => void
}

export type MenuTemplateItem = {
  id?: string
  data?: string
  label?: string
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox'
  role?: string
  accelerator?: string
  enabled?: boolean
  checked?: boolean
  submenu?: MenuTemplateItem[]
}

export type MenuExtras = {
  recentFolders: { path: string; label: string }[]
  currentRoot?: string
}

export const MENU_ORDER: MenuName[] = ['file', 'edit', 'view', 'go', 'run', 'terminal', 'help']

export const MENU_LABELS: Record<MenuName, string> = {
  file: 'File',
  edit: 'Edit',
  view: 'View',
  go: 'Go',
  run: 'Run',
  terminal: 'Terminal',
  help: 'Help',
}

export const SUBMENU_LABELS: Record<string, string> = {
  appearance: 'Appearance',
  colorTheme: 'Color Theme',
}

const EDIT_ROLES: MenuTemplateItem[] = [
  { role: 'undo' },
  { role: 'redo' },
  { type: 'separator' },
  { role: 'cut' },
  { role: 'copy' },
  { role: 'paste' },
  { role: 'selectAll' },
]

export function acceleratorDetail(accelerator: string, platform = 'win32'): string {
  const isMac = platform === 'darwin'
  return accelerator
    .replaceAll('CmdOrCtrl', isMac ? 'Cmd' : 'Ctrl')
    .replaceAll('CommandOrControl', isMac ? 'Cmd' : 'Ctrl')
    .replaceAll('Command', 'Cmd')
    .replaceAll('Control', 'Ctrl')
}

function toItem(cmd: AppCommand): MenuTemplateItem {
  const label = cmd.menu?.label ?? cmd.label
  return {
    id: cmd.id,
    label,
    accelerator: cmd.accelerator,
    enabled: cmd.enabled !== false,
    ...(cmd.checked != null ? { type: 'checkbox' as const, checked: cmd.checked } : {}),
  }
}

type Slot =
  | { order: number; separatorBefore: boolean; kind: 'cmd'; cmd: AppCommand }
  | { order: number; separatorBefore: boolean; kind: 'sub'; name: string; cmds: AppCommand[] }

function slotsFor(commands: AppCommand[]): Slot[] {
  const top: AppCommand[] = []
  const sub = new Map<string, AppCommand[]>()
  for (const cmd of commands) {
    const subName = cmd.menu?.submenu
    if (subName) {
      const list = sub.get(subName) ?? []
      list.push(cmd)
      sub.set(subName, list)
    } else {
      top.push(cmd)
    }
  }

  const slots: Slot[] = top.map((cmd) => ({
    order: cmd.menu!.order,
    separatorBefore: !!cmd.menu!.separatorBefore,
    kind: 'cmd',
    cmd,
  }))
  for (const [name, cmds] of sub) {
    const sorted = [...cmds].sort((a, b) => a.menu!.order - b.menu!.order)
    slots.push({
      order: Math.min(...sorted.map((c) => c.menu!.order)),
      separatorBefore: !!sorted[0]?.menu?.separatorBefore,
      kind: 'sub',
      name,
      cmds: sorted,
    })
  }
  return slots.sort((a, b) => a.order - b.order || a.kind.localeCompare(b.kind))
}

function recentSubmenu(extras: MenuExtras): MenuTemplateItem {
  if (extras.recentFolders.length === 0) {
    return { label: 'Open Recent', submenu: [{ label: 'No Recent Folders', enabled: false }] }
  }
  return {
    label: 'Open Recent',
    submenu: extras.recentFolders.map((folder) => ({
      id: 'openRecent',
      data: folder.path,
      label: folder.label,
      type: extras.currentRoot === folder.path ? 'checkbox' : 'normal',
      checked: extras.currentRoot === folder.path,
    })),
  }
}

export function buildMenuTemplate(commands: AppCommand[], extras: MenuExtras = { recentFolders: [] }): MenuTemplateItem[] {
  const byMenu = new Map<MenuName, AppCommand[]>()
  for (const cmd of commands) {
    if (!cmd.menu) continue
    const list = byMenu.get(cmd.menu.menu) ?? []
    list.push(cmd)
    byMenu.set(cmd.menu.menu, list)
  }

  return MENU_ORDER.map((name) => {
    const items: MenuTemplateItem[] = []
    if (name === 'edit') items.push(...EDIT_ROLES, { type: 'separator' })

    for (const slot of slotsFor(byMenu.get(name) ?? [])) {
      if (slot.separatorBefore && items.length > 0) items.push({ type: 'separator' })
      if (slot.kind === 'cmd') {
        items.push(toItem(slot.cmd))
        if (slot.cmd.id === 'openFolder') items.push(recentSubmenu(extras))
      } else {
        items.push({
          label: SUBMENU_LABELS[slot.name] ?? slot.name,
          submenu: slot.cmds.map(toItem),
        })
      }
    }

    if (name === 'file') {
      items.push({ type: 'separator' }, { role: 'quit', label: 'Exit' })
    }

    return { label: MENU_LABELS[name], submenu: items }
  })
}

export function paletteCommands(commands: AppCommand[]): AppCommand[] {
  return commands.filter((cmd) => cmd.palette !== false)
}
