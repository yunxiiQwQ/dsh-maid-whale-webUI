# DSH Maid Whale WebUI Codebase Hardening Design

## Goal

Harden the current plugin without changing its accepted visual design, companion actions, public configuration fields, or DSH protocol. The work covers command execution, helper lifecycle, client mutation performance, settings consistency, layout persistence, deterministic packaging, CI supply-chain controls, and measurable test coverage.

## Runtime changes

### WSL helper launch

The WSL launch path will keep attached stdin, stdout, and stderr for the companion protocol while passing the Windows executable path as inert data. The command wrapper must preserve paths containing spaces and Windows-valid shell metacharacters. Regression tests will exercise representative metacharacter paths and prove that the generated launch arguments contain one executable invocation.

### Helper bridge lifecycle

Durable messages (`hello`, `state`, `task`, `tasks`, and `config`) will be retained as one latest snapshot per kind before the first READY handshake. Only transient protocol messages may enter a bounded FIFO. Once restart suppression or final shutdown is active, new traffic will not grow memory. Successful restarts replay the latest durable snapshot followed by the bounded transient queue.

### Client mutation scheduling

Frame and ornament controllers will schedule a scan only for structural DOM changes or relevant semantic attributes. Text-only mutations inside an existing node will not trigger a full-tree scan; input events continue to update composer-dependent ornaments. Existing requestAnimationFrame coalescing remains the final scheduling boundary.

### Settings writes

All configuration PATCH operations issued by the client will pass through one serial queue. UI state remains optimistic, responses update state only when they correspond to the latest intent, and failures leave a visible unavailable state. The sidebar quick toggle and settings card will share the same ordering rule so the final server value matches the final user action.

### Layout persistence

Companion layout changes will update memory immediately and use a thread-safe deferred writer. Repeated updates replace the pending snapshot, filesystem sync runs outside the Qt paint path, and normal shutdown flushes the last pending value before exit.

## Build and release controls

- The package manifest will enumerate the intended preview, runtime, helper, and documentation files instead of including whole working directories.
- A package-content check will reject caches, source maps, tests, unknown previews, and other undeclared files.
- Windows CI will install pinned helper build dependencies, build from source, run the packaged visual smoke test, and verify the checked-in helper hash manifest.
- GitHub Actions will use immutable commit SHAs and the workflow will declare read-only repository permissions.
- The tsdown configuration will use the current dependency-bundling API.
- A repository `.gitattributes` file will enforce LF for text files on Windows and CI.

## Test strategy

Each behavior change starts with a focused failing regression test:

1. WSL launch argument safety for spaces and command metacharacters.
2. Bounded pre-READY traffic and no growth after restart suppression.
3. No controller rescan for text-only mutations; structural mutations still rescan.
4. Serialized PATCH ordering under delayed responses.
5. Deferred layout writes coalesce and flush the newest value.
6. Package dry-run contains only the declared release surface.
7. Parsed workflow and build configuration satisfy the pinned CI and current tsdown contracts.

Vitest V8 coverage and Python coverage will run in CI with explicit thresholds. Existing unit, type, lint, build, embedded-art, dependency-audit, package-content, and packaged-helper checks remain required.

## Acceptance criteria

- The command-injection probe cannot create a second command from a helper path.
- Helper memory remains bounded when startup never succeeds.
- Streaming text updates do not initiate frame or ornament full-tree scans.
- Rapid mixed setting changes persist in user-intent order.
- Layout persistence does not perform synchronous disk writes for every live CONFIG message.
- A dirty preview directory cannot change the package payload.
- CI verifies Linux application code and a freshly built Windows helper.
- Coverage thresholds, lint, typecheck, tests, build, package checks, audits, and `git diff --check` pass.
- The existing untracked `preview/bilibili-cover*.png` files remain untouched.
