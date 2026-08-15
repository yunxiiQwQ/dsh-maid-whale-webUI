import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assetPath = resolve(process.cwd(), 'assets/background/cloud-whale-maid.webp')
const sidebarAssetPath = resolve(process.cwd(), 'assets/background/sidebar-ocean-waves.webp')
const generatedPath = resolve(process.cwd(), 'src/client/background-art.generated.ts')

describe('user-supplied illustrated background', () => {
  it('ships the conversation and sidebar WebPs as embedded data URLs without machine paths', () => {
    expect(existsSync(assetPath)).toBe(true)
    expect(existsSync(sidebarAssetPath)).toBe(true)
    expect(existsSync(generatedPath)).toBe(true)
    if (!existsSync(assetPath) || !existsSync(sidebarAssetPath) || !existsSync(generatedPath)) return

    expect(readFileSync(assetPath).subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(readFileSync(sidebarAssetPath).subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(readFileSync(sidebarAssetPath).byteLength).toBeGreaterThan(10_000)
    const source = readFileSync(generatedPath, 'utf8')
    expect(source.match(/data:image\/webp;base64,/g)).toHaveLength(2)
    expect(source).toContain('export const ILLUSTRATED_BACKGROUND')
    expect(source).toContain('export const SIDEBAR_OCEAN_BACKGROUND')
    expect(source).not.toMatch(/https?:\/\/|[CD]:[\\/]/i)
  })
})
