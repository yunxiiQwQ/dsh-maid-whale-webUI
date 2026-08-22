import { describe, expect, it } from 'vitest'
import {
  CompanionMessageKind,
  CompanionState,
  assertCompanionMessage,
  createMessage,
  encodeMessage,
} from '../src/host/protocol.js'

describe('companion protocol', () => {
  it('creates and encodes a valid state message', () => {
    const message = createMessage(CompanionMessageKind.STATE, { state: CompanionState.WORKING })
    expect(assertCompanionMessage(message)).toBe(message)
    expect(JSON.parse(encodeMessage(message))).toEqual(message)
  })

  it('rejects unknown states', () => {
    const message = createMessage(CompanionMessageKind.STATE, { state: 'DANCING' })
    expect(() => assertCompanionMessage(message)).toThrow(/Unknown companion state/)
  })

  it('accepts the helper readiness handshake', () => {
    const message = createMessage(CompanionMessageKind.READY)
    expect(assertCompanionMessage(message).kind).toBe('ready')
  })

  it('creates and encodes a multi-task message', () => {
    const message = createMessage(CompanionMessageKind.TASKS, {
      tasks: [
        { sessionId: 'one', state: CompanionState.WORKING, project: 'demo', task: 'write code' },
        { sessionId: 'two', state: CompanionState.WAITING, project: 'demo', task: 'confirm' },
      ],
    })
    expect(assertCompanionMessage(message)).toBe(message)
    expect(JSON.parse(encodeMessage(message))).toEqual(message)
  })

  it('creates and encodes a live config message', () => {
    const message = createMessage(CompanionMessageKind.CONFIG, {
      scale: 0.9,
      bubbleScale: 0.7,
      activityLevel: 'quiet',
      reducedMotion: true,
    })
    expect(assertCompanionMessage(message)).toBe(message)
    expect(JSON.parse(encodeMessage(message))).toEqual(message)
  })
})
