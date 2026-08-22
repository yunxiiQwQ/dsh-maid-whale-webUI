// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { registerCompanionSettingsCard } from '../src/client/companion-settings.ts'

interface SlotRegistration {
  options: Record<string, unknown>
  component: () => unknown
}

async function flush(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

function slotsHarness() {
  const registrations: SlotRegistration[] = []
  const injectedSlots: string[] = []
  const ctx = {
    slots: {
      inject: (slot: string, callback: () => void) => {
        injectedSlots.push(slot)
        callback()
      },
      register: (options: Record<string, unknown>, component: () => unknown) => {
        registrations.push({ options, component })
      },
    },
  }
  return { ctx, registrations, injectedSlots }
}

describe('companion settings card slot registration', () => {
  it('registers the card under the plugin-namespaced slot key once react resolves', async () => {
    const { ctx, registrations, injectedSlots } = slotsHarness()
    registerCompanionSettingsCard(ctx as never)
    expect(registrations).toHaveLength(0)
    await vi.waitFor(() => expect(registrations).toHaveLength(1))
    expect(injectedSlots).toEqual(['settings.plugin.item'])
    expect(registrations[0].options.key).toBe('maid-whale-webui-companion')
    expect(typeof registrations[0].component).toBe('function')
  })

  it('fails quietly when the slot contract is missing or broken', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => registerCompanionSettingsCard({} as never)).not.toThrow()
    const throwing = {
      slots: {
        inject: () => {
          throw new Error('slot gone')
        },
      },
    }
    expect(() => registerCompanionSettingsCard(throwing as never)).not.toThrow()
    await flush()
    expect(errorSpy).toHaveBeenCalled()
  })
})
