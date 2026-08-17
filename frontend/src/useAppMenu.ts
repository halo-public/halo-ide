import { useEffect, useMemo } from 'react'
import {
  buildMenuTemplate,
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
  const isElectron = !!window.miniCursor?.isElectron

  useEffect(() => {
    if (!isElectron || !window.miniCursor?.setApplicationMenu) return
    window.miniCursor.setApplicationMenu(template)
  }, [isElectron, template])

  useEffect(() => {
    if (!isElectron || !window.miniCursor?.onMenuCommand) return
    return window.miniCursor.onMenuCommand((payload) => {
      dispatchMenuCommand(commands, payload, onOpenRecent)
    })
  }, [isElectron, commands, onOpenRecent])

  return { template, isElectron, runMenuItem: (item: MenuTemplateItem) => {
    if (!item.id) return
    dispatchMenuCommand(commands, { id: item.id, data: item.data }, onOpenRecent)
  } }
}
