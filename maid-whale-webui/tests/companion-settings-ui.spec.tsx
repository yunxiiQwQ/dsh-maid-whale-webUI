// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface PendingResponse {
  resolve: (response: Response) => void
  reject: (error: Error) => void
}

let root: Root | undefined

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount())
    root = undefined
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('companion settings UI writes', () => {
  it('serializes rapid toggles and reports a later write failure', async () => {
    const pending: PendingResponse[] = []
    const patches: Array<Record<string, unknown>> = []
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'PATCH') {
        return Promise.resolve(
          new Response(JSON.stringify({ enabled: true, scale: 0.6552 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }
      patches.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return new Promise<Response>((resolve, reject) => pending.push({ resolve, reject }))
    })
    vi.stubGlobal('fetch', fetcher)
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    let Card: React.ComponentType | undefined
    const { registerCompanionSettingsCard } = await import('../src/client/companion-settings.ts')
    registerCompanionSettingsCard({
      slots: {
        inject: (_slot: string, callback: () => void) => callback(),
        register: (_options: Record<string, unknown>, component: React.ComponentType) => {
          Card = component
        },
      },
    } as never)
    await vi.waitFor(() => expect(Card).toBeTypeOf('function'))

    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(React.createElement(Card!))
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(container.textContent).toContain('启用鲸鱼桌宠'))

    let enabled = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => {
      enabled.click()
      await Promise.resolve()
    })
    expect(patches).toEqual([{ enabled: false }])

    enabled = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => {
      enabled.click()
      await Promise.resolve()
    })
    expect(patches).toHaveLength(1)

    await act(async () => {
      pending.shift()?.resolve(new Response(JSON.stringify({ enabled: false }), { status: 200 }))
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(patches).toEqual([{ enabled: false }, { enabled: true }]))
    await act(async () => {
      pending.shift()?.resolve(new Response(JSON.stringify({ enabled: true }), { status: 200 }))
      await Promise.resolve()
    })

    enabled = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => {
      enabled.click()
      await Promise.resolve()
    })
    expect(patches.at(-1)).toEqual({ enabled: false })
    await act(async () => {
      pending.shift()?.reject(new Error('host unavailable'))
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(container.textContent).toContain('鲸鱼桌宠设置尚未连接到 DSH Host。'))
  })
})
