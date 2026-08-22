import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const groups = [
  {
    assetRoot: ['assets', 'background'],
    generated: ['src', 'client', 'background-art.generated.ts'],
  },
  {
    assetRoot: ['assets', 'frames'],
    generated: ['src', 'client', 'frame-art.generated.ts'],
  },
  {
    assetRoot: ['assets', 'ornaments'],
    generated: ['src', 'client', 'ornament-art.generated.ts'],
  },
]

const missing = []

for (const group of groups) {
  const generatedPath = resolve(root, ...group.generated)
  const generated = readFileSync(generatedPath, 'utf8')
  const assetRoot = resolve(root, ...group.assetRoot)
  const modes = group.assetRoot.at(-1) === 'background' ? ['.'] : ['light', 'dark']

  for (const mode of modes) {
    const directory = mode === '.' ? assetRoot : resolve(assetRoot, mode)
    const files = await readdir(directory, { withFileTypes: true })
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith('.webp')) continue
      const assetPath = resolve(directory, entry.name)
      const encoded = `data:image/webp;base64,${readFileSync(assetPath).toString('base64')}`
      if (!generated.includes(encoded)) missing.push(assetPath)
    }
  }
}

if (missing.length > 0) {
  console.error('Embedded art is stale or incomplete. Run pnpm art:embed, then review the generated diff:')
  for (const assetPath of missing) console.error(`- ${assetPath}`)
  process.exitCode = 1
} else {
  console.log('Embedded art is synchronized with assets/.')
}
