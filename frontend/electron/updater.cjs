const { autoUpdater } = require('electron-updater')

function createDisabledState(version, error) {
  return {
    status: 'disabled',
    currentVersion: version,
    ...(error ? { error } : {}),
  }
}

function setupAutoUpdate({ app, dialog, getMainWindow, beforeInstall }) {
  let state = createDisabledState(app.getVersion())
  let downloaded = false
  const listeners = new Set()

  const emit = (next) => {
    state = { currentVersion: app.getVersion(), ...next }
    for (const listener of listeners) listener(state)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:update', state)
    }
  }

  const onUpdate = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  if (!app.isPackaged) {
    return {
      getState: () => state,
      isDownloaded: () => false,
      check: async () => state,
      install: async () => false,
      onUpdate,
      scheduleInitialCheck: () => {},
    }
  }

  state = { status: 'idle', currentVersion: app.getVersion() }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    emit({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    emit({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    downloaded = false
    emit({ status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    emit({
      status: 'downloading',
      version: state.version,
      percent: progress.percent,
    })
  })

  autoUpdater.on('update-downloaded', async (info) => {
    downloaded = true
    emit({ status: 'downloaded', version: info.version, percent: 100 })
    const win = getMainWindow()
    const result = await dialog.showMessageBox(win ?? undefined, {
      type: 'info',
      title: 'Update ready',
      message: `Mini Cursor ${info.version} is ready to install.`,
      detail: 'The app will restart to apply the update.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (result.response === 0) {
      await install()
    }
  })

  autoUpdater.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err)
    if (/no published versions|404|Cannot find channel|latest\.yml/i.test(message)) {
      emit({ status: 'not-available' })
      return
    }
    console.error('[mini-cursor] auto-update error', err)
    emit({ status: 'error', error: message, version: state.version })
  })

  async function check() {
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/no published versions|404|Cannot find channel|latest\.yml/i.test(message)) {
        emit({ status: 'not-available' })
      } else {
        console.error('[mini-cursor] check for updates failed', err)
        emit({ status: 'error', error: message })
      }
    }
    return state
  }

  async function install() {
    if (!downloaded) return false
    try {
      await beforeInstall()
    } catch (err) {
      console.warn('[mini-cursor] failed to stop API before update install', err)
    }
    autoUpdater.quitAndInstall(true, true)
    return true
  }

  function scheduleInitialCheck() {
    setTimeout(() => {
      void check()
    }, 4000)
  }

  return {
    getState: () => state,
    isDownloaded: () => downloaded,
    check,
    install,
    onUpdate,
    scheduleInitialCheck,
  }
}

module.exports = { setupAutoUpdate }
