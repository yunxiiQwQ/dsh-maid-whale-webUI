import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pnpmScript = process.env.npm_execpath
const command = pnpmScript ? process.execPath : process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const args = pnpmScript ? [pnpmScript, 'pack', '--dry-run', '--json'] : ['pack', '--dry-run', '--json']
const result = spawnSync(command, args, {
  cwd: packageRoot,
  encoding: 'utf8',
  shell: !pnpmScript && process.platform === 'win32',
})
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout)
  process.exit(result.status ?? 1)
}

const output = result.stdout.trim()
const parsed = JSON.parse(output)
const pack = Array.isArray(parsed) ? parsed[0] : parsed
const paths = (pack?.files ?? []).map((file) => String(file.path).replace(/^package\//, '')).sort()
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
const expected = ['package.json', ...(manifest.files ?? [])].sort()
const missing = expected.filter((path) => !paths.includes(path))
const unexpected = paths.filter((path) => !expected.includes(path))
if (missing.length > 0 || unexpected.length > 0) {
  const details = [...missing.map((path) => `- missing: ${path}`), ...unexpected.map((path) => `- unexpected: ${path}`)]
  throw new Error(`Package contents differ from package.json files:\n${details.join('\n')}`)
}
console.log(`Package contents verified: ${paths.length} files`)
