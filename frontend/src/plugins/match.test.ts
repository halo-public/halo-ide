import { describe, expect, it } from 'vitest'
import { filterContextMenuItems, filterTitleItems, TITLE_ITEM_LIMIT } from './match'
import type { RegisteredContextMenuItem, RegisteredTitleItem } from './types'

function item(
  partial: Partial<RegisteredContextMenuItem> & Pick<RegisteredContextMenuItem, 'id' | 'title'>,
): RegisteredContextMenuItem {
  return {
    pluginId: 'test',
    pluginName: 'Test',
    locations: ['explorer', 'editor'],
    target: 'any',
    files: [],
    run: () => undefined,
    ...partial,
  }
}

describe('filterContextMenuItems', () => {
  it('keeps items for the requested location', () => {
    const items = [
      item({ id: 'a', title: 'Explorer only', locations: ['explorer'] }),
      item({ id: 'b', title: 'Editor only', locations: ['editor'] }),
    ]

    expect(
      filterContextMenuItems(items, { location: 'explorer', path: 'a.ts', isDirectory: false }).map(
        (i) => i.id,
      ),
    ).toEqual(['a'])
    expect(
      filterContextMenuItems(items, { location: 'editor', path: 'a.ts', isDirectory: false }).map(
        (i) => i.id,
      ),
    ).toEqual(['b'])
  })

  it('hides folder items on files and file items on folders', () => {
    const items = [
      item({ id: 'file', title: 'File', target: 'file' }),
      item({ id: 'folder', title: 'Folder', target: 'folder' }),
      item({ id: 'any', title: 'Any', target: 'any' }),
    ]

    expect(
      filterContextMenuItems(items, { location: 'explorer', path: 'a.ts', isDirectory: false }).map(
        (i) => i.id,
      ),
    ).toEqual(['file', 'any'])
    expect(
      filterContextMenuItems(items, { location: 'explorer', path: 'src', isDirectory: true }).map(
        (i) => i.id,
      ),
    ).toEqual(['folder', 'any'])
  })

  it('filters by file type patterns', () => {
    const items = [
      item({ id: 'js', title: 'JS', files: ['.js', 'javascript'] }),
      item({ id: 'json', title: 'JSON', files: ['json'] }),
      item({ id: 'all', title: 'All' }),
    ]

    expect(
      filterContextMenuItems(items, {
        location: 'explorer',
        path: 'src/app.js',
        isDirectory: false,
        language: 'javascript',
      }).map((i) => i.id),
    ).toEqual(['js', 'all'])
    expect(
      filterContextMenuItems(items, {
        location: 'editor',
        path: 'package.json',
        isDirectory: false,
        language: 'json',
      }).map((i) => i.id),
    ).toEqual(['json', 'all'])
    expect(
      filterContextMenuItems(items, { location: 'explorer', path: 'src', isDirectory: true }).map(
        (i) => i.id,
      ),
    ).toEqual(['all'])
  })

  it('shows markdown-only items on markdown files', () => {
    const items = [item({ id: 'md', title: 'Preview', target: 'file', files: ['.md', 'markdown'] })]

    expect(
      filterContextMenuItems(items, {
        location: 'explorer',
        path: 'README.md',
        isDirectory: false,
        language: 'markdown',
      }).map((i) => i.id),
    ).toEqual(['md'])
    expect(
      filterContextMenuItems(items, {
        location: 'editor',
        path: 'app.ts',
        isDirectory: false,
        language: 'typescript',
      }).map((i) => i.id),
    ).toEqual([])
  })
})

describe('filterTitleItems', () => {
  it('caps matching items at the title quota', () => {
    const items: RegisteredTitleItem[] = Array.from({ length: TITLE_ITEM_LIMIT + 3 }, (_, i) =>
      item({ id: `t${i}`, title: `T${i}`, locations: ['editor'] }),
    )
    expect(
      filterTitleItems(items, { location: 'editor', path: 'a.ts', isDirectory: false }),
    ).toHaveLength(TITLE_ITEM_LIMIT)
  })
})
