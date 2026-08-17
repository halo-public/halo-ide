const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('miniCursor', {
  platform: process.platform,
  isElectron: true,
  apiBase: process.env.MINI_CURSOR_API_BASE || 'http://127.0.0.1:45154',
  openWorkspaceFolder: () => ipcRenderer.invoke('workspace:openFolder'),
  getWorkspaceMru: () => ipcRenderer.invoke('workspace:getMru'),
  rememberWorkspace: (folder) => ipcRenderer.invoke('workspace:remember', folder),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getUpdateState: () => ipcRenderer.invoke('app:getUpdateState'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  onUpdate: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('app:update', listener)
    return () => ipcRenderer.removeListener('app:update', listener)
  },
  setApplicationMenu: (template) => ipcRenderer.send('menu:set', template),
  onMenuCommand: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
})
