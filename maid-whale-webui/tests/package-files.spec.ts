import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  cpu?: string[]
}

describe('package release surface', () => {
  it('keeps the WebUI theme installable on every CPU architecture', () => {
    expect(packageJson.cpu).toBeUndefined()
  })
})
