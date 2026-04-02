const { spawnSync } = require('node:child_process')

const npmCliPath = process.env.npm_execpath

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
  })

  if (typeof result.status === 'number') {
    return result.status
  }

  if (result.error) {
    console.error(result.error)
  }

  return 1
}

if (!npmCliPath) {
  console.error('npm_execpath is not available in this environment.')
  process.exit(1)
}

const nodeRebuildStatus = run(process.execPath, [npmCliPath, 'run', 'rebuild:native:node'])
if (nodeRebuildStatus !== 0) {
  process.exit(nodeRebuildStatus)
}

const testStatus = run(process.execPath, [npmCliPath, 'run', 'test:vitest'])
const electronRebuildStatus = run(process.execPath, [npmCliPath, 'run', 'rebuild:native:electron'])

if (electronRebuildStatus !== 0) {
  process.exit(electronRebuildStatus)
}

process.exit(testStatus)
