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
  it('registers the card synchronously through the DSH platform React module', () => {
    const { ctx, registrations, injectedSlots } = slotsHarness()
    registerCompanionSettingsCard(ctx as never)
    expect(registrations).toHaveLength(1)
    expect(injectedSlots).toEqual(['settings.plugin.item'])
    // The settings UI dispatches this keyed slot by the Host settings
    // namespace, so the browser card must use the exact namespace registered
    // by src/index.ts.
    expect(registrations[0].options.key).toBe('maid-whale-webui')
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
