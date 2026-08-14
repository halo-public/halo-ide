const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron')
const http = require('http')
const path = require('path')
const { API_BASE, startApi, stopApi } = require('./backend.cjs')
const { loadWindowState, sanitizeState, trackWindowState } = require('./window-state.cjs')
const { getMostRecent, loadMru, rememberWorkspace } = require('./mru.cjs')

const isDev = !app.isPackaged
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'
const ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.png')

let mainWindow = null
let isStopping = false

function userData() {
  return app.getPath('userData')
}

function putWorkspace(root) {
  const body = JSON.stringify({ root })
  const url = new URL('/api/workspace', API_BASE)
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data))
            } catch {
              resolve({ root })
            }
            return
          }
          reject(new Error(data || `Failed to set workspace (${res.statusCode})`))
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function restoreMostRecentWorkspace() {
  const recent = getMostRecent(userData())
  if (!recent) return null
  try {
    const info = await putWorkspace(recent)
    rememberWorkspace(userData(), recent)
    console.log(`[mini-cursor] restored workspace ${recent}`)
    return info
  } catch (err) {
    console.warn('[mini-cursor] could not restore MRU workspace', err)
    return null
  }
}

async function createWindow() {
  const initial = sanitizeState(loadWindowState(userData()))

  mainWindow = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    ...(typeof initial.x === 'number' && typeof initial.y === 'number'
      ? { x: initial.x, y: initial.y }
      : {}),
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0f1115',
    title: 'Mini Cursor',
    icon: ICON_PATH,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const windowTracker = trackWindowState(mainWindow, userData())

  mainWindow.once('ready-to-show', () => {
    windowTracker.restore()
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    await mainWindow.loadURL(DEV_URL)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function registerIpc() {
  ipcMain.handle('workspace:openFolder', async () => {
    const parent = BrowserWindow.getFocusedWindow() || mainWindow
    const result = await dialog.showOpenDialog(parent ?? undefined, {
      title: 'Open Folder as Workspace',
      properties: ['openDirectory'],
      defaultPath: getMostRecent(userData()) || undefined,
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('workspace:getMru', () => loadMru(userData()))

  ipcMain.handle('workspace:remember', (_event, folder) => rememberWorkspace(userData(), folder))
}

async function shutdownAndQuit() {
  if (isStopping) return
  isStopping = true
  try {
    await stopApi()
  } catch {
    /* ignore */
  }
  app.exit(0)
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.minicursor.app')
  }

  registerIpc()

  try {
    console.log(`[mini-cursor] starting API at ${API_BASE}`)
    await startApi(
      app.isPackaged ? { dataDirectory: path.join(userData(), 'data') } : undefined,
    )
    console.log('[mini-cursor] API ready')
    await restoreMostRecentWorkspace()
  } catch (err) {
    console.error('[mini-cursor] failed to start API', err)
    dialog.showErrorBox(
      'Mini Cursor',
      `Could not start the backend API.\n\n${err instanceof Error ? err.message : String(err)}`,
    )
    app.exit(1)
    return
  }

  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void shutdownAndQuit()
  }
})

app.on('before-quit', (event) => {
  if (isStopping) return
  event.preventDefault()
  void shutdownAndQuit()
})
