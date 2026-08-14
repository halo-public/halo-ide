const { spawn } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')

const API_HOST = '127.0.0.1'
const API_PORT = Number(process.env.MINI_CURSOR_API_PORT || 5154)
const API_BASE = `http://${API_HOST}:${API_PORT}`
const HEALTH_URL = `${API_BASE}/api/health`

let apiProcess = null
let stopping = false

function isPackaged() {
  try {
    const { app } = require('electron')
    return Boolean(app?.isPackaged)
  } catch {
    return false
  }
}

function repoRoot() {
  // frontend/electron -> frontend -> repo
  return path.resolve(__dirname, '..', '..')
}

function backendDir() {
  return path.join(repoRoot(), 'backend')
}

function dllPath() {
  return path.join(backendDir(), 'bin', 'Debug', 'net10.0', 'MiniCursor.Api.dll')
}

function packagedApiDir() {
  return path.join(process.resourcesPath, 'api')
}

function packagedApiExe() {
  return path.join(packagedApiDir(), 'MiniCursor.Api.exe')
}

function waitForHealth(timeoutMs = 60000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(HEALTH_URL, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
          return
        }
        retry()
      })
      req.on('error', retry)
      req.setTimeout(2000, () => {
        req.destroy()
        retry()
      })
    }

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`API did not become healthy at ${HEALTH_URL}`))
        return
      }
      setTimeout(tick, 400)
    }

    tick()
  })
}

/**
 * @param {{ dataDirectory?: string }} [options]
 */
function startApi(options = {}) {
  if (process.env.MINI_CURSOR_SKIP_API === '1') {
    return waitForHealth(15000)
  }

  const packaged = isPackaged()
  const env = {
    ...process.env,
    ASPNETCORE_ENVIRONMENT:
      process.env.ASPNETCORE_ENVIRONMENT || (packaged ? 'Production' : 'Development'),
    ASPNETCORE_URLS: API_BASE,
  }

  if (options.dataDirectory) {
    env.MiniCursor__DataDirectory = options.dataDirectory
  }

  let child
  if (packaged) {
    const cwd = packagedApiDir()
    const exe = packagedApiExe()
    if (!fs.existsSync(exe)) {
      return Promise.reject(new Error(`Packaged API not found at ${exe}`))
    }
    child = spawn(exe, [], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } else {
    const cwd = backendDir()
    const builtDll = dllPath()
    if (fs.existsSync(builtDll)) {
      child = spawn('dotnet', [builtDll], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } else {
      child = spawn('dotnet', ['run', '--no-launch-profile', '--project', 'MiniCursor.Api.csproj'], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    }
  }

  apiProcess = child
  child.stdout.on('data', (buf) => {
    const text = buf.toString()
    if (text.trim()) console.log(`[api] ${text.trimEnd()}`)
  })
  child.stderr.on('data', (buf) => {
    const text = buf.toString()
    if (text.trim()) console.error(`[api] ${text.trimEnd()}`)
  })
  child.on('exit', (code, signal) => {
    console.log(`[api] exited code=${code} signal=${signal}`)
    apiProcess = null
  })

  return waitForHealth()
}

function stopApi() {
  if (stopping) return Promise.resolve()
  stopping = true

  const child = apiProcess
  apiProcess = null
  if (!child || child.killed) return Promise.resolve()

  return new Promise((resolve) => {
    const done = () => resolve()
    const forceTimer = setTimeout(() => {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          })
        } else {
          child.kill('SIGKILL')
        }
      } catch {
        /* ignore */
      }
      done()
    }, 3000)

    child.once('exit', () => {
      clearTimeout(forceTimer)
      done()
    })

    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else {
        child.kill('SIGTERM')
      }
    } catch {
      clearTimeout(forceTimer)
      done()
    }
  })
}

module.exports = {
  API_BASE,
  API_PORT,
  startApi,
  stopApi,
}
