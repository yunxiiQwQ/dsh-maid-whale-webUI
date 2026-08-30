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
})
