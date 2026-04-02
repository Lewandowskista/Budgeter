const path = require('node:path')
const { rebuild } = require('@electron/rebuild')

async function main() {
  const buildPath = path.resolve(__dirname, '..')
  const electronVersion = require(path.join(buildPath, 'node_modules', 'electron', 'package.json')).version

  await rebuild({
    buildPath,
    electronVersion,
    force: true,
    onlyModules: ['better-sqlite3'],
    mode: 'sequential',
  })

  console.log(`Rebuilt native Electron modules for Electron ${electronVersion}.`)
}

main().catch((error) => {
  console.error('Failed to rebuild Electron native modules:', error)
  process.exit(1)
})
