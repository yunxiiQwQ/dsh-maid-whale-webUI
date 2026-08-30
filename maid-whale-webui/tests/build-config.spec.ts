import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { clientBundle, mobileBundle } from '../build/tsdown.client.ts'

describe('tsdown dependency configuration', () => {
  it('uses the current deps API for node and browser bundles', () => {
    const configs = clientBundle('@test/plugin', ['src/index.ts'])({ env: {} })
    for (const config of configs) {
      expect(config).toHaveProperty('deps')
      expect(config).not.toHaveProperty('external')
      expect(config).not.toHaveProperty('noExternal')
    }

    const mobile = mobileBundle('@test/plugin', 'src/mobile.ts')
    expect(mobile).toHaveProperty('deps')
    expect(mobile).not.toHaveProperty('external')
    expect(mobile).not.toHaveProperty('noExternal')
  })

  it('keeps generated coverage reports outside the lint input set', () => {
    const biome = JSON.parse(readFileSync(new URL('../biome.json', import.meta.url), 'utf8')) as {
      files?: { includes?: string[] }
    }
    expect(biome.files?.includes).toContain('!**/coverage')
  })
})
