import { spawnSync } from 'node:child_process'
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
const paths = (pack?.files ?? []).map((file) => String(file.path).replace(/^package\//, ''))
const forbidden = [
  /(^|\/)__pycache__(\/|$)/,
  /\.pyc$/,
  /\.js\.map$/,
  /^runtime\/tests\//,
  /^preview\/bilibili-cover/,
]
const violations = paths.filter((path) => forbidden.some((pattern) => pattern.test(path)))
if (violations.length > 0) {
  throw new Error(`Forbidden package contents:\n${violations.map((path) => `- ${path}`).join('\n')}`)
}
console.log(`Package contents verified: ${paths.length} files`)
