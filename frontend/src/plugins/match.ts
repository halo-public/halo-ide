import { matchesFilePatterns } from './fileTypes'
import type { ContextMenuLocation, RegisteredContextMenuItem, RegisteredTitleItem } from './types'

export const TITLE_ITEM_LIMIT = 5

export interface ContextMenuMatchInput {
  location: ContextMenuLocation
  path: string
  isDirectory: boolean
  language?: string
}

function matchesContribution(
  item: Pick<RegisteredContextMenuItem, 'locations' | 'target' | 'files'>,
  input: ContextMenuMatchInput,
): boolean {
  if (!item.locations.includes(input.location)) return false
  if (item.target === 'folder' && !input.isDirectory) return false
  if (item.target === 'file' && input.isDirectory) return false
  return matchesFilePatterns(item.files, input.path, input.isDirectory, input.language)
}

export function matchesContextMenuItem(
  item: RegisteredContextMenuItem,
  input: ContextMenuMatchInput,
): boolean {
  return matchesContribution(item, input)
}

export function filterContextMenuItems(
  items: RegisteredContextMenuItem[],
  input: ContextMenuMatchInput,
): RegisteredContextMenuItem[] {
  return items.filter((item) => matchesContribution(item, input))
}

export function filterTitleItems(
  items: RegisteredTitleItem[],
  input: ContextMenuMatchInput,
): RegisteredTitleItem[] {
  return items.filter((item) => matchesContribution(item, input)).slice(0, TITLE_ITEM_LIMIT)
}

