import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  FilePlus,
  Folder,
  FolderPlus,
  Pencil,
  Puzzle,
  Trash2,
} from 'lucide-react'
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { api } from '../api/client'
import type { FileNode } from '../api/types'
import { usePluginHost } from '../plugins/PluginHostContext'
import { ContextMenu, type ContextMenuEntry } from './ContextMenu'

interface Props {
  selectedPath?: string
  respectGitignore: boolean
  refreshKey: number
  onOpenFile: (path: string) => void
  onRevealFolder?: string | null
  showToolbar?: boolean
}

type Clipboard =
  | { mode: 'copy'; path: string; isDirectory: boolean }
  | null

type MenuState = {
  x: number
  y: number
  node: FileNode | null
  parentPath: string
} | null

export function FileTree({
  selectedPath,
  respectGitignore,
  refreshKey,
  onOpenFile,
  onRevealFolder,
  showToolbar = true,
}: Props) {
  const [roots, setRoots] = useState<FileNode[]>([])
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const [clipboard, setClipboard] = useState<Clipboard>(null)
  const [editing, setEditing] = useState<{ path: string; name: string } | null>(null)
  const [bump, setBump] = useState(0)
  const plugins = usePluginHost()

  const reload = () => setBump((b) => b + 1)

  useEffect(() => {
    api
      .listFiles(undefined, respectGitignore)
      .then(setRoots)
      .catch((e: Error) => setError(e.message))
  }, [respectGitignore, refreshKey, bump])

  const parentOf = (path: string) => {
    const parts = path.split('/')
    parts.pop()
    return parts.join('/')
  }

  const createItem = async (parentPath: string, isDirectory: boolean) => {
    const name = window.prompt(isDirectory ? 'Folder name' : 'File name')
    if (!name?.trim()) return
    const path = parentPath ? `${parentPath}/${name.trim()}` : name.trim()
    try {
      await api.createPath(path, isDirectory)
      reload()
      if (!isDirectory) onOpenFile(path)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Create failed')
    }
  }

  const renameItem = async (node: FileNode) => {
    const name = window.prompt('Rename', node.name)
    if (!name?.trim() || name.trim() === node.name) return
    const parent = parentOf(node.path)
    const newPath = parent ? `${parent}/${name.trim()}` : name.trim()
    try {
      await api.renamePath(node.path, newPath)
      reload()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Rename failed')
    }
  }

  const deleteItem = async (node: FileNode) => {
    if (!window.confirm(`Delete ${node.path}?`)) return
    try {
      await api.deletePath(node.path)
      reload()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const pasteItem = async (parentPath: string) => {
    if (!clipboard) return
    const base = clipboard.path.split('/').pop()!
    let dest = parentPath ? `${parentPath}/${base}` : base
    if (dest === clipboard.path) dest = parentPath ? `${parentPath}/copy-${base}` : `copy-${base}`
    try {
      await api.copyPath(clipboard.path, dest)
      reload()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Paste failed')
    }
  }

  const openMenu = (e: ReactMouseEvent, node: FileNode | null, parentPath: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, node, parentPath })
  }

  const isDirectory = menu?.node?.isDirectory ?? true
  const menuPath = menu?.node?.path ?? ''
  const pluginEntries: ContextMenuEntry[] = menu
    ? plugins.itemsFor({ location: 'explorer', path: menuPath, isDirectory }).map((item) => ({
        type: 'item' as const,
        id: `plugin:${item.pluginId}:${item.id}`,
        label: item.title,
        icon: <Puzzle size={14} />,
        onSelect: () =>
          plugins.runItem(item, {
            location: 'explorer',
            path: menuPath,
            isDirectory,
            language: isDirectory ? undefined : plugins.detectLanguage(menuPath),
          }),
      }))
    : []

  const pluginTitleEntries = plugins.titleItemsFor({
    location: 'explorer',
    path: '',
    isDirectory: true,
  })

  const menuEntries: ContextMenuEntry[] = menu
    ? [
        {
          type: 'item',
          id: 'new-file',
          label: 'New File',
          icon: <FilePlus size={14} />,
          onSelect: () => {
            void createItem(menu.node?.isDirectory ? menu.node.path : menu.parentPath, false)
          },
        },
        {
          type: 'item',
          id: 'new-folder',
          label: 'New Folder',
          icon: <FolderPlus size={14} />,
          onSelect: () => {
            void createItem(menu.node?.isDirectory ? menu.node.path : menu.parentPath, true)
          },
        },
        ...(menu.node
          ? ([
              {
                type: 'item',
                id: 'rename',
                label: 'Rename',
                icon: <Pencil size={14} />,
                onSelect: () => {
                  void renameItem(menu.node!)
                },
              },
              {
                type: 'item',
                id: 'copy',
                label: 'Copy',
                icon: <Copy size={14} />,
                onSelect: () => {
                  setClipboard({
                    mode: 'copy',
                    path: menu.node!.path,
                    isDirectory: menu.node!.isDirectory,
                  })
                },
              },
              {
                type: 'item',
                id: 'delete',
                label: 'Delete',
                icon: <Trash2 size={14} />,
                onSelect: () => {
                  void deleteItem(menu.node!)
                },
              },
            ] satisfies ContextMenuEntry[])
          : []),
        ...(clipboard
          ? ([
              {
                type: 'item',
                id: 'paste',
                label: 'Paste',
                onSelect: () => {
                  const parent = menu.node?.isDirectory ? menu.node.path : menu.parentPath
                  void pasteItem(parent)
                },
              },
            ] satisfies ContextMenuEntry[])
          : []),
        ...(pluginEntries.length
          ? ([{ type: 'separator', id: 'plugins' }, ...pluginEntries] satisfies ContextMenuEntry[])
          : []),
      ]
    : []

  if (error) return <div className="error-text" style={{ padding: 8 }}>{error}</div>

  return (
    <div className="file-tree" onContextMenu={(e) => openMenu(e, null, '')}>
      {showToolbar && (
        <div className="tree-toolbar">
          <button className="icon-btn" title="New File" onClick={() => void createItem('', false)}>
            <FilePlus size={14} />
          </button>
          <button className="icon-btn" title="New Folder" onClick={() => void createItem('', true)}>
            <FolderPlus size={14} />
          </button>
          {pluginTitleEntries.map((item) => (
            <button
              key={`${item.pluginId}:${item.id}`}
              className="icon-btn"
              title={item.title}
              onClick={() =>
                plugins.runItem(item, {
                  location: 'explorer',
                  path: '',
                  isDirectory: true,
                })
              }
            >
              <Puzzle size={14} />
            </button>
          ))}
        </div>
      )}
      {!roots.length && <div className="muted" style={{ padding: 8 }}>No files</div>}
      {roots.map((node) => (
        <TreeNode
          key={`${node.path}-${bump}`}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          respectGitignore={respectGitignore}
          revealFolder={onRevealFolder}
          onOpenFile={onOpenFile}
          onContextMenu={openMenu}
          editing={editing}
          setEditing={setEditing}
          onRenamed={reload}
        />
      ))}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={menuEntries}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function TreeNode({
  node,
  depth,
  selectedPath,
  respectGitignore,
  revealFolder,
  onOpenFile,
  onContextMenu,
  editing,
  setEditing,
  onRenamed,
}: {
  node: FileNode
  depth: number
  selectedPath?: string
  respectGitignore: boolean
  revealFolder?: string | null
  onOpenFile: (path: string) => void
  onContextMenu: (e: ReactMouseEvent, node: FileNode, parentPath: string) => void
  editing: { path: string; name: string } | null
  setEditing: (v: { path: string; name: string } | null) => void
  onRenamed: () => void
}) {
  const shouldExpand =
    !!revealFolder &&
    (revealFolder === node.path || revealFolder.startsWith(node.path + '/'))
  const [expanded, setExpanded] = useState(depth < 1 || shouldExpand)
  const [children, setChildren] = useState<FileNode[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (shouldExpand && node.isDirectory) {
      setExpanded(true)
      if (children === null) {
        void api.listFiles(node.path, respectGitignore).then(setChildren).catch(() => setChildren([]))
      }
    }
  }, [shouldExpand, node.isDirectory, node.path, respectGitignore, children])

  const toggle = async () => {
    if (!node.isDirectory) {
      onOpenFile(node.path)
      return
    }
    const next = !expanded
    setExpanded(next)
    if (next && children === null) {
      setLoading(true)
      try {
        setChildren(await api.listFiles(node.path, respectGitignore))
      } catch {
        setChildren([])
      } finally {
        setLoading(false)
      }
    }
  }

  const parentPath = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''

  return (
    <div>
      <button
        className={`tree-item ${selectedPath === node.path ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 10 }}
        onClick={toggle}
        onContextMenu={(e) => onContextMenu(e, node, parentPath)}
        title={node.path}
      >
        {node.isDirectory ? (
          expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        ) : (
          <span style={{ width: 14 }} />
        )}
        {node.isDirectory ? <Folder size={14} /> : <FileCode2 size={14} />}
        {editing?.path === node.path ? (
          <input
            className="tree-rename"
            autoFocus
            value={editing.name}
            onChange={(e) => setEditing({ path: node.path, name: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = editing.name.trim()
                if (!name || name === node.name) {
                  setEditing(null)
                  return
                }
                const newPath = parentPath ? `${parentPath}/${name}` : name
                void api.renamePath(node.path, newPath).then(onRenamed).finally(() => setEditing(null))
              }
              if (e.key === 'Escape') setEditing(null)
            }}
            onBlur={() => setEditing(null)}
          />
        ) : (
          <span className="name">{node.name}</span>
        )}
      </button>
      {node.isDirectory && expanded && (
        <div className="tree-children">
          {loading && <div className="muted" style={{ padding: '4px 8px', fontSize: 12 }}>Loading…</div>}
          {children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              respectGitignore={respectGitignore}
              revealFolder={revealFolder}
              onOpenFile={onOpenFile}
              onContextMenu={onContextMenu}
              editing={editing}
              setEditing={setEditing}
              onRenamed={onRenamed}
            />
          ))}
        </div>
      )}
    </div>
  )
}
