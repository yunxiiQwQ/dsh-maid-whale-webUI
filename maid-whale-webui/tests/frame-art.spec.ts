import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const generatedPath = resolve(process.cwd(), 'src/client/frame-art.generated.ts')

describe('generated hand-drawn frame assets', () => {
  it('ships seven light and seven dark frames as embedded WebP', () => {
    expect(existsSync(generatedPath)).toBe(true)
    if (!existsSync(generatedPath)) return

    const source = readFileSync(generatedPath, 'utf8')
    for (const id of ['selectedNav', 'composer', 'dialog', 'message', 'menu', 'panel', 'primaryButton']) {
      expect(source).toContain(`"${id}"`)
    }
    expect(source.match(/data:image\/webp;base64,/g)).toHaveLength(14)
    expect(source).toContain("export type FrameMode = 'light' | 'dark'")
    expect(source).not.toMatch(/https?:\/\//)
  })
})
