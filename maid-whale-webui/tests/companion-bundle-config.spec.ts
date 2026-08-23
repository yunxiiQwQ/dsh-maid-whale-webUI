import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('companion bundle defaults', () => {
  it('starts the pet and bubble at the requested compact sizes', () => {
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch).toContain('scale: 0.6552')
    expect(patch).toContain('bubbleScale: 0.78')
  })
})
