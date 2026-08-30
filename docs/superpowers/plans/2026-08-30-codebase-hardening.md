# Codebase Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed command-injection, memory-growth, client-rescan, settings-ordering, persistence, packaging, CI, coverage, formatting, and deprecated-build defects without changing the plugin's visual or protocol behavior.

**Architecture:** Keep the existing host, client, and Python helper boundaries. Add small pure helpers for command construction, mutation classification, serial configuration writes, and deferred persistence so each risky behavior can be tested without launching the whole DSH application; reinforce the release boundary with exact package inputs and parsed CI/config checks.

**Tech Stack:** Node.js 22, TypeScript, Vitest 4.1, jsdom, Python 3.11+, unittest, PySide6, PyInstaller, pnpm, tsdown, GitHub Actions.

---

## File map

- `maid-whale-webui/src/host/helper-process.js`: safe WSL command line, durable snapshots, bounded transient queue.
- `maid-whale-webui/tests/companion-helper-process.spec.ts`: WSL command and queue regression tests.
- `maid-whale-webui/tests/companion-host-lifecycle.spec.ts`: settings watch, debounced enable, disable, event isolation, and teardown.
- `maid-whale-webui/src/client/scan.ts`: structural-mutation classifier shared by both DOM controllers.
- `maid-whale-webui/src/client/frames.ts`: schedule only structural/relevant mutations.
- `maid-whale-webui/src/client/ornaments.ts`: same scheduling boundary while retaining input-event updates.
- `maid-whale-webui/tests/frames.spec.ts`, `maid-whale-webui/tests/ornaments.spec.ts`: text-only and structural mutation regressions.
- `maid-whale-webui/src/client/config-writes.ts`: one serial PATCH queue shared by all companion controls.
- `maid-whale-webui/src/client/index.ts`, `maid-whale-webui/src/client/companion-settings.ts`: consume the shared queue and retain latest-intent UI guards.
- `maid-whale-webui/tests/companion-config-writes.spec.ts`: delayed-response ordering tests.
- `maid-whale-webui/tests/companion-settings-ui.spec.tsx`: render the registered React card and exercise GET/PATCH failure and optimistic controls.
- `maid-whale-webui/runtime/layout_store.py`: deferred, coalescing, thread-safe layout writer.
- `maid-whale-webui/runtime/helper.py`: schedule layout writes and flush on shutdown.
- `maid-whale-webui/runtime/tests/test_layout_store.py`: fake-timer coalescing and flush tests.
- `maid-whale-webui/package.json`, `maid-whale-webui/scripts/check-package-contents.mjs`: exact release surface and dirty-worktree check.
- `maid-whale-webui/tests/build-config.spec.ts`, `maid-whale-webui/build/tsdown.client.ts`: current tsdown dependency API.
- `maid-whale-webui/tests/workflow-config.spec.ts`, `.github/workflows/ci.yml`: parsed CI contract, immutable actions, Windows helper job.
- `maid-whale-webui/requirements.txt`, `maid-whale-webui/requirements-build.txt`, `maid-whale-webui/requirements-test.txt`: pinned runtime/build/test Python inputs.
- `maid-whale-webui/runtime/bin/win32-x64/dsw-drool-helper.exe.sha256`: checked-in binary identity.
- `maid-whale-webui/vitest.config.ts`, `maid-whale-webui/.coveragerc`, `maid-whale-webui/pnpm-lock.yaml`: coverage tooling and thresholds.
- `.gitattributes`: repository-wide LF policy and binary declarations.

### Task 1: Make WSL launch inert and bound helper buffering

**Files:**
- Modify: `maid-whale-webui/src/host/helper-process.js:60-86,111-127,218-277,280-364`
- Test: `maid-whale-webui/tests/companion-helper-process.spec.ts`
- Test: `maid-whale-webui/tests/companion-host-lifecycle.spec.ts`

- [ ] **Step 1: Write failing command-line and queue tests**

Add tests that express the safe launch contract and bounded pre-READY behavior:

```ts
it('quotes the WSL helper as one cmd command even when its path has metacharacters', () => {
  const launch = resolveHelperLaunch({
    platform: 'linux',
    isWslEnv: true,
    bundledPath: '/mnt/c/Whale & echo INJECTED/helper.exe',
    helperPath: '/app/runtime/helper.py',
    pythonEnv: undefined,
    fileExists: () => true,
    windowsPath: () => 'C:\\Whale & echo INJECTED\\helper.exe',
    cmdExe: () => 'C:\\Windows\\System32\\cmd.exe',
  })
  expect(launch.args).toEqual(['/d', '/s', '/c', '""C:\\Whale & echo INJECTED\\helper.exe""'])
})

it('keeps only durable snapshots and a bounded transient queue before READY', () => {
  const bridge = new HelperProcess({ maxQueuedMessages: 4 }, console)
  for (let index = 0; index < 20; index += 1) {
    bridge.send(createMessage(CompanionMessageKind.STATE, {
      state: CompanionState.WORKING,
      message: `state-${index}`,
    }))
    bridge.send(createMessage(CompanionMessageKind.PULSE, {
      state: CompanionState.SUCCESS,
      ttlMs: 1000,
      message: `pulse-${index}`,
    }))
  }
  expect(bridge.snapshot.size).toBe(1)
  expect(bridge.queue).toHaveLength(4)
  expect(bridge.queue.at(-1)).toContain('pulse-19')
})

it('does not retain new traffic after restart suppression', () => {
  const bridge = new HelperProcess({ maxQueuedMessages: 4 }, console)
  bridge.restartSuppressed = true
  bridge.send(createMessage(CompanionMessageKind.PULSE, {
    state: CompanionState.ERROR,
    ttlMs: 1000,
  }))
  expect(bridge.queue).toHaveLength(0)
})
```

Mock `HelperProcess` in `companion-host-lifecycle.spec.ts`, use fake timers, and call the exported `apply()` with a context whose `settings.register()` returns a controllable scope. Assert that the initial disabled state does not start a helper, the captured watch listener starts exactly one helper after 400 ms, disabling calls `stop('settings-change')`, a thrown reducer event is logged instead of escaping, and the captured lifecycle teardown calls both event unsubscribe functions and `unwatch()`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm -C maid-whale-webui exec vitest run tests/companion-helper-process.spec.ts tests/companion-host-lifecycle.spec.ts`

Expected: FAIL because the WSL arguments lack `/s` and quoting, durable messages still enter `queue`, and suppression does not reject traffic.

- [ ] **Step 3: Implement safe command construction and bounded storage**

Add a pure command-line helper and update the WSL branch:

```js
function cmdExecutableCommand(path) {
  if (path.includes('"')) throw new TypeError('Windows helper path cannot contain a quote')
  return `""${path}""`
}

return {
  command: cmdExe(),
  args: ['/d', '/s', '/c', cmdExecutableCommand(windowsPath(bundledPath))],
}
```

Define durable kinds and replace unbounded writes:

```js
const DURABLE_MESSAGE_KINDS = new Set([
  CompanionMessageKind.HELLO,
  CompanionMessageKind.STATE,
  CompanionMessageKind.TASK,
  CompanionMessageKind.TASKS,
  CompanionMessageKind.CONFIG,
])

#enqueue(line) {
  const limit = Math.max(0, this.options.maxQueuedMessages ?? 64)
  if (limit === 0) return
  this.queue.push(line)
  if (this.queue.length > limit) this.queue.splice(0, this.queue.length - limit)
}
```

In `send`, call `#remember` first, return when stopping/suppressed, do not queue durable kinds, and bound transient kinds. On every READY handshake call `#flushSnapshot()` followed by `#flushQueue()`. When the failure threshold suppresses restarts, clear the queue.

- [ ] **Step 4: Verify GREEN and run protocol/reducer neighbors**

Run: `pnpm -C maid-whale-webui exec vitest run tests/companion-helper-process.spec.ts tests/companion-host-lifecycle.spec.ts tests/companion-protocol.spec.ts tests/companion-reducer.spec.ts`

Expected: all selected test files pass and the helper child exits cleanly.

- [ ] **Step 5: Commit the runtime bridge repair**

```powershell
git add -- maid-whale-webui/src/host/helper-process.js maid-whale-webui/tests/companion-helper-process.spec.ts maid-whale-webui/tests/companion-host-lifecycle.spec.ts
git commit -m "fix: 加固桌宠进程启动与消息缓冲"
```

### Task 2: Stop full-tree scans for text-only mutations

**Files:**
- Modify: `maid-whale-webui/src/client/scan.ts`
- Modify: `maid-whale-webui/src/client/frames.ts:304-322`
- Modify: `maid-whale-webui/src/client/ornaments.ts:188-198`
- Test: `maid-whale-webui/tests/frames.spec.ts`
- Test: `maid-whale-webui/tests/ornaments.spec.ts`

- [ ] **Step 1: Write failing mutation-classifier tests**

Import `mutationNeedsScan` from `scan.ts` and add:

```ts
it('ignores text-only records and accepts structural or semantic changes', () => {
  const host = document.createElement('div')
  const text = document.createTextNode('token')
  host.append(text)
  expect(mutationNeedsScan([{ type: 'characterData', target: text }] as MutationRecord[])).toBe(false)
  expect(
    mutationNeedsScan([
      { type: 'childList', target: host, addedNodes: [document.createTextNode('next')], removedNodes: [] },
    ] as unknown as MutationRecord[]),
  ).toBe(false)
  expect(
    mutationNeedsScan([
      { type: 'childList', target: host, addedNodes: [document.createElement('section')], removedNodes: [] },
    ] as unknown as MutationRecord[]),
  ).toBe(true)
  expect(mutationNeedsScan([{ type: 'attributes', target: host }] as MutationRecord[])).toBe(true)
})
```

Add this integration test to each controller suite, using that suite's existing `fixture()`, `tick()`, and `controller` cleanup:

```ts
it('skips text-only mutations but rescans after an element is inserted', async () => {
  fixture()
  controller = createFrameController(document.body)
  const compute = vi.spyOn(window, 'getComputedStyle')
  compute.mockClear()
  const text = document.querySelector('h2')?.firstChild
  expect(text?.nodeType).toBe(3)
  if (text) text.textContent = 'streamed token'
  await tick()
  expect(compute).not.toHaveBeenCalled()
  const section = document.createElement('section')
  section.textContent = 'new structure'
  document.body.append(section)
  await tick()
  expect(compute).toHaveBeenCalled()
})
```

In `ornaments.spec.ts`, substitute `createOrnamentController(document.body, { wide: true })` for the controller construction; the assertions remain identical.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm -C maid-whale-webui exec vitest run tests/frames.spec.ts tests/ornaments.spec.ts`

Expected: FAIL because `mutationNeedsScan` does not exist and text mutations currently schedule synchronization.

- [ ] **Step 3: Implement the shared structural boundary**

Add to `scan.ts`:

```ts
const hasElementNode = (nodes: NodeList | readonly Node[]): boolean =>
  Array.from(nodes).some((node) => node.nodeType === 1)

export function mutationNeedsScan(mutations: readonly MutationRecord[]): boolean {
  return mutations.some((mutation) => {
    if (mutation.type === 'attributes') return true
    if (mutation.type !== 'childList') return false
    return hasElementNode(mutation.addedNodes) || hasElementNode(mutation.removedNodes)
  })
}
```

Import it in both controllers and wrap their observer callbacks:

```ts
const observer = new MutationObserver((mutations) => {
  if (mutationNeedsScan(mutations)) schedule()
})
```

Remove `characterData: true`. Keep `childList`, relevant attribute filters, input listeners, resize, scroll, and requestAnimationFrame coalescing.

- [ ] **Step 4: Verify GREEN and all client DOM tests**

Run: `pnpm -C maid-whale-webui exec vitest run tests/frames.spec.ts tests/ornaments.spec.ts tests/apply.spec.ts`

Expected: all selected tests pass; text-only integration assertions report zero new style reads.

- [ ] **Step 5: Commit the scan repair**

```powershell
git add -- maid-whale-webui/src/client/scan.ts maid-whale-webui/src/client/frames.ts maid-whale-webui/src/client/ornaments.ts maid-whale-webui/tests/frames.spec.ts maid-whale-webui/tests/ornaments.spec.ts
git commit -m "perf: 避免流式文本触发全量界面扫描"
```

### Task 3: Serialize every companion configuration write

**Files:**
- Create: `maid-whale-webui/src/client/config-writes.ts`
- Create: `maid-whale-webui/tests/companion-config-writes.spec.ts`
- Create: `maid-whale-webui/tests/companion-settings-ui.spec.tsx`
- Modify: `maid-whale-webui/src/client/index.ts:86-112`
- Modify: `maid-whale-webui/src/client/companion-settings.ts:111-175`

- [ ] **Step 1: Write the failing delayed-response test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createConfigWriteQueue } from '../src/client/config-writes.ts'

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
```

In the jsdom UI test, capture the component passed to `slots.register`, render it with `react-dom/client`, resolve the initial GET with `{ enabled: true, scale: 0.6552 }`, click the enabled checkbox twice before releasing the first PATCH promise, and assert only one PATCH starts at a time and the second body is `{ "enabled": true }`. Reject a later write and assert the card renders the unavailable status text.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm -C maid-whale-webui exec vitest run tests/companion-config-writes.spec.ts`

Expected: FAIL because the queue module and rendered interaction coverage do not exist.

- [ ] **Step 3: Implement and adopt one shared queue**

Create `config-writes.ts`:

```ts
export type CompanionConfigPatch = Record<string, unknown>

export function createConfigWriteQueue(endpoint: string, fetcher: typeof fetch = fetch) {
  let tail: Promise<unknown> = Promise.resolve()
  return (patch: CompanionConfigPatch): Promise<Record<string, unknown>> => {
    const execute = async () => {
      const response = await fetcher(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!response.ok) throw new Error(`settings write failed: ${response.status}`)
      return (await response.json()) as Record<string, unknown>
    }
    const result = tail.then(execute, execute)
    tail = result.then(() => undefined, () => undefined)
    return result
  }
}

export const writeCompanionConfig = createConfigWriteQueue('/plugins/maid-whale-webui/config')
```

Replace both direct PATCH calls with `writeCompanionConfig({ enabled: next })` or `writeCompanionConfig({ [field]: next })`. Keep the existing optimistic local state and sequence comparison so only the latest intent updates the UI.

Add `react-dom@18.3.1` and `@types/react-dom@18.3.7` as dev dependencies so the UI test renders the same React major version declared by the plugin.

- [ ] **Step 4: Verify GREEN and settings neighbors**

Run: `pnpm -C maid-whale-webui exec vitest run tests/companion-config-writes.spec.ts tests/companion-settings-ui.spec.tsx tests/companion-client-slot.spec.ts tests/apply.spec.ts`

Expected: all selected files pass and the delayed second request starts only after the first settles.

- [ ] **Step 5: Commit settings ordering**

```powershell
git add -- maid-whale-webui/src/client/config-writes.ts maid-whale-webui/src/client/index.ts maid-whale-webui/src/client/companion-settings.ts maid-whale-webui/tests/companion-config-writes.spec.ts maid-whale-webui/tests/companion-settings-ui.spec.tsx maid-whale-webui/package.json maid-whale-webui/pnpm-lock.yaml
git commit -m "fix: 串行保存桌宠设置"
```

### Task 4: Defer and coalesce layout persistence

**Files:**
- Modify: `maid-whale-webui/runtime/layout_store.py`
- Modify: `maid-whale-webui/runtime/helper.py:175-178,344-372,633-649,1142-1144`
- Test: `maid-whale-webui/runtime/tests/test_layout_store.py`

- [ ] **Step 1: Write failing fake-timer tests**

```python
class FakeTimer:
    def __init__(self, delay, callback):
        self.delay = delay
        self.callback = callback
        self.cancelled = False
        self.daemon = False

    def start(self):
        return None

    def cancel(self):
        self.cancelled = True


def test_deferred_saver_coalesces_and_flushes_latest_value(self) -> None:
    timers = []
    writes = []
    factory = lambda delay, callback: timers.append(FakeTimer(delay, callback)) or timers[-1]
    saver = DeferredLayoutSaver(Path('layout.json'), save=lambda _path, value: writes.append(value), timer_factory=factory)
    saver.schedule({'scale': 0.7})
    saver.schedule({'scale': 1.0})
    self.assertTrue(timers[0].cancelled)
    self.assertEqual(writes, [])
    saver.flush()
    self.assertEqual(writes[-1]['scale'], 1.0)
    self.assertTrue(timers[1].cancelled)
```

Also test that calling the active fake timer writes once and a subsequent `flush()` does not duplicate the write.

- [ ] **Step 2: Run Python test and verify RED**

Run: `pnpm -C maid-whale-webui test:python -- --pattern test_layout_store.py`

If the npm script cannot forward the pattern, run: `py -3 -m unittest runtime.tests.test_layout_store -v`

Expected: FAIL because `DeferredLayoutSaver` is not defined.

- [ ] **Step 3: Implement the deferred writer**

Add a `DeferredLayoutSaver` using `threading.RLock` and `threading.Timer`. `schedule()` normalizes and copies the newest value, cancels the previous timer, marks the new timer daemon, and starts it. The timer callback and `flush()` take the same lock, clear pending state, and call the injected `save` function exactly once.

Use this constructor contract:

```python
DeferredLayoutSaver(
    path: Path,
    *,
    delay_seconds: float = 0.35,
    save: Callable[[Path, dict[str, Any]], None] = save_layout,
    timer_factory: Callable[[float, Callable[[], None]], Timer] = threading.Timer,
)
```

In `CompanionWindow.__init__`, create `self.layout_saver = DeferredLayoutSaver(self.layout_path)`. Change `_save_layout()` to call `self.layout_saver.schedule(self.layout)`. After `application.exec()` returns, call `window.layout_saver.flush()` before closing the recorder.

- [ ] **Step 4: Verify GREEN and packaged helper behavior**

Run:

```powershell
py -3 -m unittest runtime.tests.test_layout_store runtime.tests.test_animation_model -v
pnpm -C maid-whale-webui test:helper:packaged
```

Expected: tests pass, the packaged helper produces its snapshot and exits after shutdown.

- [ ] **Step 5: Remove the smoke snapshot and commit**

Remove only `maid-whale-webui/.build/helper/packaged-visual-smoke.png`, then:

```powershell
git add -- maid-whale-webui/runtime/layout_store.py maid-whale-webui/runtime/helper.py maid-whale-webui/runtime/tests/test_layout_store.py
git commit -m "perf: 延迟合并桌宠布局写入"
```

### Task 5: Make package contents deterministic

**Files:**
- Modify: `maid-whale-webui/package.json`
- Create: `maid-whale-webui/scripts/check-package-contents.mjs`
- Create: `maid-whale-webui/tests/package-files.spec.ts`

- [ ] **Step 1: Write the failing manifest test and package checker**

The Vitest test parses `package.json` and asserts that no `files` entry is a broad directory (`preview`, `runtime/`, or `assets/pet/`) and that the five approved preview paths are present.

The checker executes `pnpm pack --dry-run --json`, parses the returned `files[].path`, and rejects any path matching:

```js
const forbidden = [
  /(^|\/)__pycache__(\/|$)/,
  /\.pyc$/,
  /\.js\.map$/,
  /^runtime\/tests\//,
  /^preview\/bilibili-cover/,
]
```

- [ ] **Step 2: Verify RED against the dirty preview directory**

Run: `pnpm -C maid-whale-webui exec vitest run tests/package-files.spec.ts`

Expected: FAIL because `files` currently includes broad `preview` and `runtime/` directories.

Run: `node maid-whale-webui/scripts/check-package-contents.mjs`

Expected: FAIL and list the existing untracked `preview/bilibili-cover*.png` entries.

- [ ] **Step 3: Enumerate the release files exactly**

Replace broad entries with this exact release surface (plus the existing `lib`, metadata, README, license, and helper-script entries):

```json
[
  "lib/index.js",
  "lib/client.js",
  "cordis.patch.yml",
  "skin.json",
  "preview/dark.webp",
  "preview/light.webp",
  "preview/pet-working.png",
  "preview/theme-dark.png",
  "preview/theme-light.png",
  "runtime/__init__.py",
  "runtime/animation_model.py",
  "runtime/helper.py",
  "runtime/layout_store.py",
  "runtime/bin/win32-x64/dsw-drool-helper.exe",
  "runtime/bin/win32-x64/dsw-drool-helper.exe.sha256",
  "assets/pet-manifest.json",
  "assets/pet/01-idle.png",
  "assets/pet/02-happy.png",
  "assets/pet/03-thinking.png",
  "assets/pet/04-confused.png",
  "assets/pet/05-surprised.png",
  "assets/pet/06-working.png",
  "assets/pet/07-loading.png",
  "assets/pet/08-success.png",
  "assets/pet/09-error.png",
  "assets/pet/10-warning.png",
  "assets/pet/11-dragging.png",
  "assets/pet/12-uploading.png",
  "assets/pet/13-downloading.png",
  "assets/pet/14-playing.png",
  "assets/pet/15-muted.png",
  "assets/pet/16-sleeping.png",
  "assets/pet/17-angry.png",
  "assets/pet/18-please.png",
  "assets/pet/19-bye.png",
  "assets/pet/20-eating.png",
  "scripts/build-helper.ps1",
  "scripts/test-packaged-helper.mjs",
  "README.md",
  "README.en.md",
  "LICENSE",
  "NOTICE",
  "requirements.txt",
  "requirements-build.txt",
  "requirements-test.txt"
]
```

Add the checker script:

```json
"pack:check": "node scripts/check-package-contents.mjs"
```

Do not delete or rename any untracked preview file.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
pnpm -C maid-whale-webui exec vitest run tests/package-files.spec.ts
pnpm -C maid-whale-webui pack:check
```

Expected: test and checker pass; dry-run contains no `bilibili-cover`, cache, test, or source-map entry.

- [ ] **Step 5: Commit deterministic packaging**

```powershell
git add -- maid-whale-webui/package.json maid-whale-webui/scripts/check-package-contents.mjs maid-whale-webui/tests/package-files.spec.ts
git commit -m "fix: 固定插件发布文件清单"
```

### Task 6: Add release provenance, coverage, immutable CI, LF, and current tsdown API

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.gitattributes`
- Create: `maid-whale-webui/requirements-build.txt`
- Create: `maid-whale-webui/requirements-test.txt`
- Modify: `maid-whale-webui/requirements.txt`
- Create: `maid-whale-webui/runtime/bin/win32-x64/dsw-drool-helper.exe.sha256`
- Modify: `maid-whale-webui/vitest.config.ts`
- Create: `maid-whale-webui/.coveragerc`
- Modify: `maid-whale-webui/package.json`
- Modify: `maid-whale-webui/pnpm-lock.yaml`
- Modify: `maid-whale-webui/build/tsdown.client.ts:115-155,178-240`
- Create: `maid-whale-webui/tests/build-config.spec.ts`
- Create: `maid-whale-webui/tests/workflow-config.spec.ts`
- Modify: `maid-whale-webui/tests/companion-bundle-config.spec.ts`

- [ ] **Step 1: Add failing parsed configuration tests**

Add `yaml@2.9.0` and `@vitest/coverage-v8@4.1.10` as dev dependencies. Parse `.github/workflows/ci.yml` with `yaml` and assert `permissions.contents === 'read'`, all `uses` values contain a 40-character SHA, and a `windows-helper` job exists. Parse `cordis.patch.yml` in `companion-bundle-config.spec.ts` and assert the resulting object contains the expected package and client injection contract instead of checking source substrings. Import `clientBundle`, evaluate its config function, and assert each returned config has `deps` while `external` and `noExternal` are absent.

- [ ] **Step 2: Verify RED**

Run: `pnpm -C maid-whale-webui exec vitest run tests/build-config.spec.ts tests/workflow-config.spec.ts`

Expected: FAIL because the workflow uses tags, lacks a Windows job and permissions, and tsdown still emits deprecated fields.

- [ ] **Step 3: Migrate tsdown dependency options**

Use:

```ts
deps: { neverBundle: ['@deepseek-ai/cordis', ...extraExternal], onlyBundle: false }
```

for the Node library, and:

```ts
deps: {
  neverBundle: [...CLIENT_EXTERNALS],
  alwaysBundle: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  onlyBundle: false,
}
```

for the client bundle. Convert the mobile config to `deps: { neverBundle: [], alwaysBundle: [/.*/], onlyBundle: false }`.

- [ ] **Step 4: Pin Python inputs and helper identity**

Set runtime requirements to `PySide6==6.11.2` and `Pillow==12.3.0`. Create build requirements with those two lines plus `PyInstaller==6.22.2`. Create test requirements with `coverage==7.16.0`. Write this current helper identity:

```text
3fd874180206e537cdff81c1c2c1c7001689babc69c30d2641c186b8825e24be  dsw-drool-helper.exe
```

- [ ] **Step 5: Configure measurable coverage**

Add `"test:coverage": "vitest run --coverage"` and configure:

```ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.{ts,js}'],
  exclude: ['src/**/*.d.ts', 'src/client/*.generated.ts'],
  thresholds: {
    lines: 65,
    functions: 65,
    statements: 65,
    branches: 60,
  },
},
```

Create `.coveragerc`:

```ini
[run]
source = runtime
omit =
    runtime/helper.py
    runtime/tests/*

[report]
fail_under = 90
show_missing = true
skip_covered = true
```

The Qt UI path remains covered by the Windows packaged smoke test.

- [ ] **Step 6: Pin and expand CI**

Use these immutable actions:

```yaml
actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
pnpm/action-setup@f40ffcd9367d9f12939873eb1018b921a783ffaa # v4
actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
```

Declare `permissions: contents: read`. The Linux job runs lint, typecheck, `test:coverage`, build, art check, package check, `pip install -r requirements.txt -r requirements-test.txt`, and `coverage run -m unittest` followed by `coverage report`. The `windows-helper` job verifies the checked-in SHA-256, installs `requirements-build.txt`, runs `build:helper:windows`, and therefore performs the packaged visual smoke test.

- [ ] **Step 7: Enforce LF without touching binary content**

Create:

```gitattributes
* text=auto eol=lf
*.png binary
*.webp binary
*.exe binary
*.tgz binary
```

Run `pnpm -C maid-whale-webui exec biome check --write .` once, review that behavioral diffs are limited to task files, and verify `pnpm lint` passes on Windows.

- [ ] **Step 8: Verify GREEN**

Run:

```powershell
pnpm -C maid-whale-webui exec vitest run tests/build-config.spec.ts tests/workflow-config.spec.ts tests/companion-bundle-config.spec.ts
pnpm -C maid-whale-webui test:coverage
Push-Location maid-whale-webui
py -3 -m coverage run --rcfile=.coveragerc -m unittest discover -s runtime/tests -t .
py -3 -m coverage report --rcfile=.coveragerc
Pop-Location
pnpm build
pnpm lint
```

Expected: parsed config tests pass, coverage thresholds pass, build emits no deprecated `external`/`noExternal` warning, and lint returns zero diagnostics.

- [ ] **Step 9: Commit release controls**

```powershell
git add -- .gitattributes .github/workflows/ci.yml maid-whale-webui/.coveragerc maid-whale-webui/build/tsdown.client.ts maid-whale-webui/package.json maid-whale-webui/pnpm-lock.yaml maid-whale-webui/requirements.txt maid-whale-webui/requirements-build.txt maid-whale-webui/requirements-test.txt maid-whale-webui/runtime/bin/win32-x64/dsw-drool-helper.exe.sha256 maid-whale-webui/tests/build-config.spec.ts maid-whale-webui/tests/workflow-config.spec.ts maid-whale-webui/tests/companion-bundle-config.spec.ts
git commit -m "ci: 完善覆盖率与发布验证"
```

### Task 7: Full verification and cleanup

**Files:**
- Verify all task-owned files
- Do not modify: `maid-whale-webui/preview/bilibili-cover*.png`

- [ ] **Step 1: Run the complete project gate**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm -C maid-whale-webui test:coverage
pnpm build
pnpm -C maid-whale-webui art:embed:check
pnpm -C maid-whale-webui pack:check
Push-Location maid-whale-webui
py -3 -m coverage run --rcfile=.coveragerc -m unittest discover -s runtime/tests -t .
py -3 -m coverage report --rcfile=.coveragerc
Pop-Location
pnpm -C maid-whale-webui test:helper:packaged
pnpm -C maid-whale-webui audit --registry=https://registry.npmjs.org
git diff --check
```

Expected: every command exits zero, dependency audit reports no known vulnerabilities, and coverage meets configured thresholds.

- [ ] **Step 2: Re-run the command-injection probe**

Run this harmless Windows command-line fixture and require exactly `SAFE_MARKER`:

```powershell
$probeRoot = Join-Path $env:TEMP 'Whale & echo INJECTED'
$probeScript = Join-Path $probeRoot 'helper.cmd'
New-Item -ItemType Directory -Force -Path $probeRoot | Out-Null
Set-Content -LiteralPath $probeScript -Value '@echo SAFE_MARKER' -Encoding ascii
$probeOutput = @(& $env:ComSpec '/d' '/s' '/c' ('""' + $probeScript + '""'))
if ($LASTEXITCODE -ne 0 -or $probeOutput.Count -ne 1 -or $probeOutput[0] -ne 'SAFE_MARKER') {
  throw "Unsafe cmd command line: $($probeOutput -join ' | ')"
}
Remove-Item -LiteralPath $probeRoot -Recurse -Force
```

- [ ] **Step 3: Inspect release and worktree state**

Run `pnpm -C maid-whale-webui pack --dry-run --json`, verify only declared files, then run `git status --short`. Expected: task-owned tracked changes/commits plus exactly the eight pre-existing untracked `preview/bilibili-cover*.png` files.

Start the linked DSH profile, inspect the live plugin at 959 px and 960 px viewport widths, verify the composer and frame computed styles still apply, capture one screenshot at each width, then close the browser and stop the DSH process. Treat any selector miss, console error, or unexpected full-tree scan during streamed text as a failed verification.

- [ ] **Step 4: Remove process artifacts**

Delete only task-generated `.coverage`, `coverage/`, `lib/client.js.map`, `.build/helper/packaged-visual-smoke.png`, Python `__pycache__`, and any dry-run archive. Re-run `git status --short` to prove the eight user preview files remain.

- [ ] **Step 5: Record final verification commit if cleanup changed tracked files**

If and only if a tracked task file changed during final formatting or lockfile normalization, stage that exact file list and commit:

```powershell
git commit -m "chore: 完成代码库加固验证"
```
