const fs = require('fs')
const path = require('path')

const MAX_MRU = 10

function mruPath(userDataPath) {
  return path.join(userDataPath, 'workspace-mru.json')
}

function normalize(folder) {
  try {
    return path.normalize(path.resolve(folder))
  } catch {
    return folder
  }
}

function samePath(a, b) {
  const left = normalize(a)
  const right = normalize(b)
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

function loadMru(userDataPath) {
  try {
    const raw = fs.readFileSync(mruPath(userDataPath), 'utf8')
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed?.folders) ? parsed.folders : []
    return list
      .filter((item) => typeof item === 'string' && item.trim())
      .map(normalize)
      .filter((folder, index, arr) => arr.findIndex((x) => samePath(x, folder)) === index)
      .filter((folder) => {
        try {
          return fs.existsSync(folder) && fs.statSync(folder).isDirectory()
        } catch {
          return false
        }
      })
      .slice(0, MAX_MRU)
  } catch {
    return []
  }
}

function saveMru(userDataPath, folders) {
  try {
    fs.mkdirSync(userDataPath, { recursive: true })
    fs.writeFileSync(
      mruPath(userDataPath),
      JSON.stringify({ folders: folders.slice(0, MAX_MRU) }, null, 2),
      'utf8',
    )
  } catch (err) {
    console.error('[mini-cursor] failed to save workspace MRU', err)
  }
}

function rememberWorkspace(userDataPath, folder) {
  if (!folder || typeof folder !== 'string') return loadMru(userDataPath)
  const full = normalize(folder)
  try {
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
      return loadMru(userDataPath)
    }
  } catch {
    return loadMru(userDataPath)
  }

  const next = [full, ...loadMru(userDataPath).filter((item) => !samePath(item, full))].slice(
    0,
    MAX_MRU,
  )
  saveMru(userDataPath, next)
  return next
}

function getMostRecent(userDataPath) {
  return loadMru(userDataPath)[0] ?? null
}

module.exports = {
  MAX_MRU,
  loadMru,
  rememberWorkspace,
  getMostRecent,
}
