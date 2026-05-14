---
name: lb4-plugin-review
description: Comprehensive LoopBack 4 plugin code review. Use when reviewing a PR or branch for an LB4 plugin / component / connector / extension — checks code quality, plugin architecture, public API hygiene, test coverage, and STYLE_GUIDE.md compliance with judgment calls about design.
---

# lb4-plugin-review

Deep code review for a LoopBack 4 plugin change set. Pairs well with `lb4-style-check` (mechanical) and `mongodb-driver-review` (driver-specific). This skill does the judgment work: architecture, plugin patterns, public API hygiene, test gaps.

## Read

```bash
git diff main...HEAD --stat
git diff main...HEAD
git log main..HEAD --oneline
```

Then read:

- Every file in the diff
- `STYLE_GUIDE.md`
- `src/index.ts` (current public surface)
- `CONTRIBUTING.md` (process expectations)

## Check

### Architecture & plugin patterns

- New capabilities are added as plugins (Component, Provider, Service), not by modifying engine internals. Refactors of core code without a clear contract change are a red flag.
- New `BindingKey` entries are typed (`BindingKey.create<T>(...)`), namespaced under the plugin's `Bindings` namespace, and exported from `keys.ts`.
- New singletons are bound with `inScope(BindingScope.SINGLETON)`.
- Anything that opens I/O lives behind a `@lifeCycleObserver('group')` class with idempotent `start()` and `stop()`.
- Shared resources (connection managers, client pools, file watchers) track ownership with a flag (e.g., `ownsXxx: boolean`) and skip teardown when not owner. Verify the pattern is followed for any new shared resource.

### Public API hygiene

- Every new export from `src/index.ts` has a JSDoc block with `@public`, `@experimental`, or `@internal`. Default for new exports should be `@experimental`.
- `export type` for type-only re-exports.
- No accidental leak of internal types into the public surface.

### Type system & casts

- No `any`. `unknown` is fine.
- `as unknown as { ... }` casts have an explanatory comment naming the upstream contract they rely on. Bonus: a regression test pins that contract.
- `@ts-expect-error` includes a description; `@ts-ignore` is rejected.

### Tests

- New behavior has at least one test. Pure logic → unit test under `src/__tests__/unit/`. I/O-touching code → integration test under `src/__tests__/integration/` using real backing services (e.g., `mongodb-memory-server`), not mocks.
- Bug fixes carry a regression test that fails on the pre-fix code.
- Public API additions are exercised by an integration test.

### Error handling

- Thrown errors are subclasses named `<Domain>Error`, not raw `Error` for domain failures.
- No credentials or secrets in error messages — values that could contain them go through a `redactXxx()` helper.

### Config validation

- New config fields are validated at the framework boundary, not deep inside the driver call. Throw a typed `<Domain>ConfigError` with redacted values.

### Lifecycle correctness

- `start()` and `stop()` must each be safe to call twice.
- Concurrent `start` calls must coalesce (share a promise).
- A `stop` mid-`start` must be safe (generation counter, cancellation, or equivalent).

## Output

Numbered findings grouped by severity. Each finding has file:line and a one-sentence fix.

```
## Critical
1. src/path/file.ts:LINE — <issue> — <fix>

## Medium
2. src/path/file.ts:LINE — <issue> — <fix>

## Low
3. src/path/file.ts:LINE — <issue> — <fix>

## Resolved since last review
- <if applicable, brief list>

## Verification
- `npm run lint`
- `npm run build`
- `npm run test`
- Re-run `lb4-style-check` and `mongodb-driver-review` on the same diff.
```

## Severity guide

- **Critical**: race condition, data loss risk, credential leak, public API surface change without semver, lifecycle correctness bug.
- **Medium**: missing ownership flag, missing stability tag on a new export, missing regression test for a bug fix, deep cast without a contract comment.
- **Low**: minor JSDoc gap, naming inconsistency, docstring drift, low-impact dead code.

## Do not

- Do not modify code. Findings only.
- Do not duplicate `lb4-style-check` mechanical findings unless they're already in this skill's scope (then point at the style-check skill).
- Do not opine on commit message format — that's `pre-pr-check`.
