const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('miniCursor', {
  platform: process.platform,
  isElectron: true,
  apiBase: process.env.MINI_CURSOR_API_BASE || 'http://127.0.0.1:5154',
  openWorkspaceFolder: () => ipcRenderer.invoke('workspace:openFolder'),
  getWorkspaceMru: () => ipcRenderer.invoke('workspace:getMru'),
  rememberWorkspace: (folder) => ipcRenderer.invoke('workspace:remember', folder),
})
