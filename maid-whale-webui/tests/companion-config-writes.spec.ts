import { describe, expect, it, vi } from 'vitest'
import { createConfigWriteQueue } from '../src/client/config-writes.ts'

describe('companion configuration write queue', () => {
  it('starts PATCH requests serially and resolves the final intent last', async () => {
    const releases: Array<() => void> = []
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const patch = JSON.parse(String(init?.body)) as Record<string, unknown>
      await new Promise<void>((resolve) => releases.push(resolve))
      return new Response(JSON.stringify(patch), { status: 200 })
    })
    const write = createConfigWriteQueue('/config', fetcher as typeof fetch)
    const first = write({ enabled: false })
    const second = write({ enabled: true })
    await Promise.resolve()
    expect(fetcher).toHaveBeenCalledTimes(1)
    releases.shift()?.()
    await first
    await Promise.resolve()
    expect(fetcher).toHaveBeenCalledTimes(2)
    releases.shift()?.()
    await expect(second).resolves.toEqual({ enabled: true })
  })
})
