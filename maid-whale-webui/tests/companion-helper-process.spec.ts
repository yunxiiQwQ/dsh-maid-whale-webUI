import { describe, expect, it } from 'vitest'
import {
  HelperProcess,
  defaultCommand,
  isWsl,
  resolveHelperLaunch,
  shouldUseBundledHelper,
} from '../src/host/helper-process.js'
import { CompanionMessageKind, CompanionState, createMessage } from '../src/host/protocol.js'

const fakeNodeHelper = [
  "const readline = require('node:readline')",
  "const out = (line) => process.stdout.write(JSON.stringify(line) + '\\n')",
  "out({ protocolVersion: 1, kind: 'ready' })",
  "readline.createInterface({ input: process.stdin }).on('line', (line) => process.stdout.write(line))",
].join('; ')

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => {
      setTimeout(resolve, 25)
    })
  }
  throw new Error('timed out waiting for helper condition')
}

describe('helper process launch resolution', () => {
  it('exposes WSL detection helpers without throwing', () => {
    expect(typeof isWsl()).toBe('boolean')
    expect(typeof shouldUseBundledHelper()).toBe('boolean')
    expect(typeof defaultCommand()).toBe('string')
    expect(typeof defaultCommand(true)).toBe('string')
  })

  it('prefers the bundled executable on win32 when it exists', () => {
    const launch = resolveHelperLaunch({
      platform: 'win32',
      isWslEnv: false,
      bundledPath: 'C:/app/runtime/bin/win32-x64/dsw-drool-helper.exe',
      helperPath: 'C:/app/runtime/helper.py',
      pythonEnv: undefined,
      fileExists: () => true,
    })
    expect(launch).toEqual({ command: 'C:/app/runtime/bin/win32-x64/dsw-drool-helper.exe', args: [] })
  })

  it('falls back to the python interpreter without a bundled executable', () => {
    const launch = resolveHelperLaunch({
      platform: 'win32',
      isWslEnv: false,
      bundledPath: 'C:/app/runtime/bin/win32-x64/dsw-drool-helper.exe',
      helperPath: 'C:/app/runtime/helper.py',
      pythonEnv: undefined,
      fileExists: () => false,
    })
    expect(launch.command).toBe('py')
    expect(launch.args).toEqual(['-3', 'C:/app/runtime/helper.py'])
  })

  it('launches the bundled executable through cmd.exe from WSL', () => {
    const launch = resolveHelperLaunch({
      platform: 'linux',
      isWslEnv: true,
      bundledPath: '/mnt/c/app/runtime/bin/win32-x64/dsw-drool-helper.exe',
      helperPath: '/app/runtime/helper.py',
      pythonEnv: undefined,
      fileExists: () => true,
      windowsPath: (path: string) => `C:\\${path}`,
      cmdExe: () => 'C:\\Windows\\System32\\cmd.exe',
    })
    expect(launch.command).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(launch.args).toEqual(['/d', '/c', 'C:\\/mnt/c/app/runtime/bin/win32-x64/dsw-drool-helper.exe'])
  })
})

describe('helper process bridge', () => {
  it('queues messages before readiness, flushes them after, and shuts down cleanly', async () => {
    const replies: string[] = []
    const logger = { debug() {}, info() {}, warn() {}, error() {} }
    const bridge = new HelperProcess(
      {
        command: process.execPath,
        args: ['-e', fakeNodeHelper],
        heartbeatMs: 0,
      },
      logger as unknown as Console,
    )
    const child = bridge.start()
    expect(child).toBeDefined()
    if (!child) return
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      replies.push(...chunk.split(/\r?\n/))
    })
    const exited = new Promise<void>((resolveExit, rejectExit) => {
      child.once('exit', (code) =>
        code === 0 ? resolveExit() : rejectExit(new Error(`helper exited with ${String(code)}`)),
      )
      child.once('error', rejectExit)
    })

    const stateMessage = createMessage(CompanionMessageKind.STATE, {
      state: CompanionState.WORKING,
      message: 'running a test',
    })
    bridge.send(stateMessage)
    await waitFor(() => replies.some((line) => line.includes('"kind":"state"') && line.includes('running a test')))

    bridge.stop('test-complete')
    await exited
    expect(replies.some((line) => line.includes('"kind":"shutdown"'))).toBe(true)
  }, 15000)
})
