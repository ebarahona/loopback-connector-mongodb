# Help Wanted

This project ships infrastructure for leak detection and benchmarks but
the thresholds and baselines need empirical tuning. Contributions here
have outsize value — they turn theoretical guarantees into measurable
ones.

## Leak detection

File: `scripts/leak-detection.mjs`

Current state:

- Runs 1000 connect/disconnect cycles
- Default threshold: 10 MB heap delta
- These numbers are placeholders

Needed:

- Empirical heap-delta baseline across Node 20.x, 22.x, 24.x
- Additional scenarios:
  - Long-running change streams that are opened then closed
  - Transaction churn (begin/commit/rollback cycles)
  - GridFS upload/download stream lifecycle
- Once thresholds are stable, wire to CI as a blocking job

## Benchmarks

Directory: `bench/`

Current state:

- Measures connector.create, find, all, and service.aggregate
- No comparison baseline; no historical tracking

Needed:

- Side-by-side comparison against the official
  `loopback-connector-mongodb` (driver 5.x, callback-style)
- Multi-tenant DataSource throughput (per-tenant connection sharing)
- Pipeline benchmarks (aggregation with $lookup, $facet, $merge)
- A published baseline JSON in `bench/baseline.json` so PRs can
  detect regressions via CI

## How to contribute

1. Pick one item from the list above.
2. Open an issue describing your approach so we can align scope.
3. Submit a PR following [CONTRIBUTING.md](./CONTRIBUTING.md).
4. Performance PRs must include: methodology, raw numbers, hardware
   spec (CPU, RAM, Node version, OS), and at least 5 runs to demonstrate
   stability.

## Flaky tests

File: `src/__tests__/integration/change-streams.spec.ts`

The `provides resume tokens` test opens a change-stream watch then
issues an insert it expects to observe. On slow CI runners the cursor
sometimes never delivers the change even after a 1500ms warmup,
causing the 20s test timeout to fire. The test is currently skipped
on CI (`it.skipIf(process.env.CI)`) and still runs locally where the
replica set is fast enough.

Needed:

- A robust readiness signal that replaces the timed sleep, for
  example polling for the cursor's `init` event or issuing a probe
  insert and waiting for the change before issuing the real one.
- Once the readiness signal lands, remove the CI skip so the test
  is a real gate again.
