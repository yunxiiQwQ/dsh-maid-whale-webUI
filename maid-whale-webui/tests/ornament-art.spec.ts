import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const generatedPath = resolve(process.cwd(), 'src/client/ornament-art.generated.ts')

describe('hand-drawn ornament assets', () => {
  it('ships every light and dark asset as embedded WebP', () => {
    expect(existsSync(generatedPath)).toBe(true)
    if (!existsSync(generatedPath)) return

    const source = readFileSync(generatedPath, 'utf8')
    const ids = ['bow', 'whaleTail', 'apronCrest', 'hairWave', 'bubbles', 'headbandCorner', 'ribbonTab', 'cloudTide']
    for (const id of ids) expect(source).toContain(`"${id}"`)
    expect(source.match(/data:image\/webp;base64,/g)).toHaveLength(16)
    expect(source).toContain("export type OrnamentMode = 'light' | 'dark'")
  })
})
