const { Menu, BrowserWindow } = require('electron')

function send(id, data) {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return
  win.webContents.send('menu:command', { id, data })
}

function hydrate(items) {
  return (items || []).map((item) => {
    const next = { ...item }
    if (Array.isArray(next.submenu)) next.submenu = hydrate(next.submenu)
    if (next.id && !next.role) {
      const id = next.id
      const data = next.data
      next.click = () => send(id, data)
    }
    if (next.accelerator) next.registerAccelerator = false
    delete next.data
    return next
  })
}

function applyMenu(template) {
  const menu = Menu.buildFromTemplate(hydrate(template))
  Menu.setApplicationMenu(menu)
}

function installDefaultMenu() {
  applyMenu([
    {
      label: 'File',
      submenu: [{ role: 'quit', label: 'Exit' }],
    },
  ])
}

function registerMenuIpc(ipcMain) {
  ipcMain.on('menu:set', (_event, template) => {
    if (!Array.isArray(template)) return
    applyMenu(template)
  })
}

module.exports = { applyMenu, installDefaultMenu, registerMenuIpc }
