import { readFileSync } from 'node:fs'
import { transform } from 'lightningcss'
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

  it('hashes CSS module classes from a repository-relative filename', async () => {
    const configs = clientBundle('@test/plugin', ['src/index.ts'])({ env: {} })
    const client = configs.at(-1)
    const plugins = Array.isArray(client?.plugins) ? client.plugins : []
    const plugin = plugins.find(
      (candidate: unknown) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'name' in candidate &&
        candidate.name === 'dsh-css-modules-inline',
    ) as
      | {
          load?: (this: { addWatchFile: (path: string) => void }, id: string) => Promise<unknown>
        }
      | undefined
    const source = readFileSync(new URL('../src/client/deepseek-workshop.module.css', import.meta.url))
    const expected = transform({
      filename: 'src/client/deepseek-workshop.module.css',
      code: source,
      cssModules: { pattern: '[hash]_[local]' },
      minify: true,
    }).exports?.petToggle.name

    const loaded = await plugin?.load?.call(
      { addWatchFile: () => {} },
      '\0dsh-css:src/client/deepseek-workshop.module.css.mjs',
    )

    expect(expected).toBeTypeOf('string')
    expect(String(loaded)).toContain(JSON.stringify(expected))
  })
})
