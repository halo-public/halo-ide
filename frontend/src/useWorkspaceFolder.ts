import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import type { WorkspaceInfo } from './api/types'
import { folderLabel, getWorkspaceMru, rememberWorkspace } from './workspaceMru'

export function useWorkspaceFolder(
  workspace: WorkspaceInfo | null,
  onWorkspaceChange: (workspace: WorkspaceInfo) => void,
  onError: (message: string) => void,
) {
  const [mru, setMru] = useState<string[]>([])
  const [opening, setOpening] = useState(false)

  const refreshMru = useCallback(async () => {
    try {
      setMru(await getWorkspaceMru())
    } catch {
      setMru([])
    }
  }, [])

  useEffect(() => {
    void refreshMru()
  }, [workspace?.root, refreshMru])

  const openPath = useCallback(
    async (folder: string) => {
      setOpening(true)
      try {
        const next = await api.setWorkspace(folder)
        setMru(await rememberWorkspace(next.root))
        onWorkspaceChange(next)
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to open folder')
        await refreshMru()
      } finally {
        setOpening(false)
      }
    },
    [onWorkspaceChange, onError, refreshMru],
  )

  const browseFolder = useCallback(async () => {
    try {
      let folder: string | null = null
      if (window.miniCursor?.openWorkspaceFolder) {
        folder = await window.miniCursor.openWorkspaceFolder()
      } else {
        folder = window.prompt('Enter workspace folder path')?.trim() || null
      }
      if (!folder) return
      await openPath(folder)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to open folder')
    }
  }, [openPath, onError])

  const recentFolders = useMemo(
    () => mru.map((path) => ({ path, label: folderLabel(path) })),
    [mru],
  )

  return {
    mru,
    opening,
    openPath,
    browseFolder,
    recentFolders,
  }
}
