const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const pathFile = path.join(root, 'node_modules', 'electron', 'path.txt')

if (fs.existsSync(pathFile)) {
  process.exit(0)
}

console.log('Electron binary missing; downloading…')
try {
  execSync('node ./node_modules/electron/install.js', {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
} catch (err) {
  console.error(
    'Failed to download Electron. Check network access to GitHub releases, then run:\n  node node_modules/electron/install.js',
  )
  process.exit(1)
}

if (!fs.existsSync(pathFile)) {
  console.error('Electron install finished but path.txt is still missing.')
  process.exit(1)
}
