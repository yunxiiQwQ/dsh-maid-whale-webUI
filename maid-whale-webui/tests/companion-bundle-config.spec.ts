import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

describe('companion bundle defaults', () => {
  it('starts the pet and bubble at the requested compact sizes', () => {
    const patch = parse(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')) as Array<{
      insert: Array<{ name: string; config: { enabled: boolean; scale: number; bubbleScale: number } }>
    }>
    expect(patch[0].insert[0]).toMatchObject({
      name: '@yunxii/dsh-client-ui-skin-maid-whale-webui',
      config: { enabled: true, scale: 0.6552, bubbleScale: 0.78 },
    })
  })
})
