import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface Workflow {
  permissions?: { contents?: string }
  jobs?: Record<string, { steps?: Array<{ uses?: string }> }>
}

describe('CI workflow release controls', () => {
  it('uses read-only permissions, immutable actions, and a Windows helper job', () => {
    const workflow = parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')) as Workflow
    expect(workflow.permissions?.contents).toBe('read')
    expect(workflow.jobs).toHaveProperty('windows-helper')
    const uses = Object.values(workflow.jobs ?? {}).flatMap((job) =>
      (job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
    )
    expect(uses.length).toBeGreaterThan(0)
    expect(uses.every((value) => /@[0-9a-f]{40}$/.test(value))).toBe(true)
  })
})
