import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  files?: string[]
}

describe('package release surface', () => {
  it('enumerates approved preview and runtime files instead of broad directories', () => {
    const files = packageJson.files ?? []
    expect(files).not.toContain('preview')
    expect(files).not.toContain('runtime/')
    expect(files).not.toContain('assets/pet/')
    expect(files).toEqual(
      expect.arrayContaining([
        'preview/dark.webp',
        'preview/light.webp',
        'preview/pet-working.png',
        'preview/theme-dark.png',
        'preview/theme-light.png',
      ]),
    )
  })
})
