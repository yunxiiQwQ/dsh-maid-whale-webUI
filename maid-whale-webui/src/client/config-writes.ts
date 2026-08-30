export type CompanionConfigPatch = Record<string, unknown>

export function createConfigWriteQueue(endpoint: string, fetcher?: typeof fetch) {
  let tail: Promise<unknown> = Promise.resolve()
  return (patch: CompanionConfigPatch): Promise<Record<string, unknown>> => {
    const execute = async () => {
      const response = await (fetcher ?? fetch)(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!response.ok) throw new Error(`settings write failed: ${response.status}`)
      return (await response.json()) as Record<string, unknown>
    }
    const result = tail.then(execute, execute)
    tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

export const writeCompanionConfig = createConfigWriteQueue('/plugins/maid-whale-webui/config')
