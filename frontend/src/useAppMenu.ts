import { useMemo } from 'react'
import {
  buildMenuTemplate,
  executeMenuRole,
  type AppCommand,
  type MenuExtras,
  type MenuTemplateItem,
} from './appMenu'

export type MenuCommandPayload = { id: string; data?: string }

function dispatchMenuCommand(commands: AppCommand[], payload: MenuCommandPayload, onOpenRecent: (path: string) => void) {
  if (payload.id === 'openRecent' && payload.data) {
    onOpenRecent(payload.data)
    return
  }
  commands.find((cmd) => cmd.id === payload.id)?.run()
}

export function useAppMenu(
  commands: AppCommand[],
  extras: MenuExtras,
  onOpenRecent: (path: string) => void,
) {
  const template = useMemo(() => buildMenuTemplate(commands, extras), [commands, extras])

  return {
    template,
    runMenuItem: (item: MenuTemplateItem) => {
      if (item.role) {
        executeMenuRole(item.role)
        return
      }
      if (!item.id) return
      dispatchMenuCommand(commands, { id: item.id, data: item.data }, onOpenRecent)
    },
  }
}
