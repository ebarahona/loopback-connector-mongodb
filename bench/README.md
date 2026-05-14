# Benchmarks

A [`tinybench`](https://github.com/tinylibs/tinybench) harness for the
hot-path connector and service operations. Boots a real in-memory
MongoDB via `mongodb-memory-server` — no mocks, no stubs.

## What it measures

| Case                                   | What it exercises                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `connector.create`                     | Single-document insert through the juggler-shaped connector path.                          |
| `connector.find` by id                 | Primary-key lookup, including the id coercion + property mapping pipeline.                 |
| `connector.all` with `where` + `limit` | Filtered query through the query builder.                                                  |
| `service.aggregate`                    | A trivial `$match` + `$group` pipeline through the service path (bypassing the connector). |

All four cases share one `MongoConnectionManager` so the numbers
reflect the cost of the connector/service layer, not connection
churn. Each case runs for ~1 s of warm-up plus ~1 s of measured
samples; tinybench reports mean, median, p75, p99, and samples taken.

## Running

```bash
npm run build   # bench imports from dist/, build first
npm run bench
```

Expect ~30 s end-to-end: most of that is `mongodb-memory-server`
booting `mongod` and downloading the binary on first run.

## Reading the output

`tinybench` prints a table of results. The columns to watch are:

- `ops/sec` — higher is better; this is the headline number.
- `Average Time (ns)` — useful for sub-microsecond cases.
- `Margin` — `±` jitter as a percent of the mean. Treat anything
  over `±5%` as noise-bound; re-run, close other processes, or
  increase `time:` in `bench/index.mjs`.
- `Samples` — too few samples (~20) means the case is slow or the
  measurement window is too short.

## HELP WANTED

This harness is **seeded, not validated**. Contributions welcome:

- **Comparison baseline.** A side-by-side run against the official
  `loopback-connector-mongodb` (driver 5.x, callback-style). The
  expectation is that this connector is at least on par per-op, with
  upside from being promise-native and using driver 7.x.
- **More scenarios.**
  - Multi-tenant `DataSource` throughput — N tenants sharing one
    `MongoConnectionManager`, hot-path under contention.
  - Transactions — `withTransaction` overhead vs. plain writes.
  - GridFS upload / download streaming.
  - Aggregation pipelines that actually hurt: `$lookup`, `$facet`,
    `$merge`, `$graphLookup`.
- **Historical tracking.** Publish a `bench/baseline.json` and a CI
  job that fails PRs which regress any case by more than a defined
  tolerance (e.g. 10%). We deliberately don't ship one today —
  environment variance would mislead. The right way is for a
  contributor to publish a baseline produced on a stable runner and
  document the methodology.

If you take any of these on, please open an issue first so we can
align on scope. See [HELP_WANTED.md](../HELP_WANTED.md) for the
full open list and contribution rules.
