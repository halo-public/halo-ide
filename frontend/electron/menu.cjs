const { Menu, BrowserWindow, app } = require('electron')

const WEB_ROLES = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])

function hideApplicationMenu() {
  Menu.setApplicationMenu(null)
}

function runMenuRole(role, sender) {
  if (role === 'quit') {
    app.quit()
    return
  }
  if (!WEB_ROLES.has(role)) return
  const win = BrowserWindow.fromWebContents(sender) || BrowserWindow.getFocusedWindow()
  const contents = win?.webContents
  if (contents && typeof contents[role] === 'function') contents[role]()
}

function registerMenuIpc(ipcMain) {
  ipcMain.on('menu:role', (event, role) => {
    if (typeof role !== 'string') return
    runMenuRole(role, event.sender)
  })
}

module.exports = { hideApplicationMenu, registerMenuIpc }
