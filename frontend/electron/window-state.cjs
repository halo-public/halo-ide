const { screen } = require('electron')
const fs = require('fs')
const path = require('path')

const DEFAULT_STATE = {
  width: 1440,
  height: 920,
  x: undefined,
  y: undefined,
  isMaximized: false,
  isFullScreen: false,
}

function statePath(userDataPath) {
  return path.join(userDataPath, 'window-state.json')
}

function loadWindowState(userDataPath) {
  try {
    const raw = fs.readFileSync(statePath(userDataPath), 'utf8')
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_STATE,
      ...parsed,
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function isVisibleOnDisplay(bounds) {
  const displays = screen.getAllDisplays()
  return displays.some((display) => {
    const area = display.workArea
    const overlapX = Math.max(
      0,
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x),
    )
    const overlapY = Math.max(
      0,
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y),
    )
    // Require a meaningful portion of the window to be on-screen
    return overlapX >= 100 && overlapY >= 80
  })
}

function sanitizeState(state) {
  const next = {
    width: Math.max(960, Number(state.width) || DEFAULT_STATE.width),
    height: Math.max(640, Number(state.height) || DEFAULT_STATE.height),
    x: typeof state.x === 'number' ? state.x : undefined,
    y: typeof state.y === 'number' ? state.y : undefined,
    isMaximized: Boolean(state.isMaximized),
    isFullScreen: Boolean(state.isFullScreen),
  }

  if (typeof next.x === 'number' && typeof next.y === 'number') {
    if (!isVisibleOnDisplay({ x: next.x, y: next.y, width: next.width, height: next.height })) {
      next.x = undefined
      next.y = undefined
    }
  }

  return next
}

function saveWindowState(userDataPath, state) {
  try {
    fs.mkdirSync(userDataPath, { recursive: true })
    fs.writeFileSync(statePath(userDataPath), JSON.stringify(state, null, 2), 'utf8')
  } catch (err) {
    console.error('[mini-cursor] failed to save window state', err)
  }
}

function trackWindowState(win, userDataPath) {
  let state = sanitizeState(loadWindowState(userDataPath))
  let saveTimer = null

  const persist = () => {
    if (!win || win.isDestroyed()) return

    const isMaximized = win.isMaximized()
    const isFullScreen = win.isFullScreen()

    // Keep last normal bounds while maximized/fullscreen
    if (!isMaximized && !isFullScreen) {
      const bounds = win.getBounds()
      state = {
        ...state,
        ...bounds,
        isMaximized,
        isFullScreen,
      }
    } else {
      state = {
        ...state,
        isMaximized,
        isFullScreen,
      }
    }

    saveWindowState(userDataPath, state)
  }

  const scheduleSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 200)
  }

  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
  win.on('enter-full-screen', scheduleSave)
  win.on('leave-full-screen', scheduleSave)
  win.on('close', persist)

  return {
    options: {
      width: state.width,
      height: state.height,
      ...(typeof state.x === 'number' && typeof state.y === 'number'
        ? { x: state.x, y: state.y }
        : {}),
    },
    restore() {
      if (state.isFullScreen) win.setFullScreen(true)
      else if (state.isMaximized) win.maximize()
    },
  }
}

module.exports = {
  DEFAULT_STATE,
  loadWindowState,
  sanitizeState,
  trackWindowState,
}
