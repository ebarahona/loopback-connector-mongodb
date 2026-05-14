---
name: mongodb-driver-review
description: MongoDB Node driver 7.x usage review. Use when reviewing code that calls the native mongodb driver — checks ObjectId handling, Change Stream cleanup, transaction semantics, query safety, index usage, GridFS streaming, replica-set requirements, and credential redaction.
---

# mongodb-driver-review

Audit a change set's interaction with the MongoDB Node driver against current driver-7.x best practices.

Driver docs: https://www.mongodb.com/docs/drivers/node/current/
Server docs: https://www.mongodb.com/docs/manual/

Driver 7.x requires Node >= 20.19.0. If `package.json#engines.node` doesn't reflect that, flag it.

## Read

```bash
git diff main...HEAD --name-only
git diff main...HEAD -- 'src/**/*.ts'
```

Read every `.ts` file under `src/` that imports from `mongodb` or `bson`.

## Check

### ObjectId

- New ObjectId construction must go through the project's `coerceId` / `toObjectId` helpers (`src/connector/coercion.ts`), not direct `new ObjectId(rawValue)`.
- Mixed string/ObjectId comparisons in filters — coerce on the way in.

### Change Streams

- Every `stream = collection.watch(...)` has a matching `await stream.close()` on a finally / disconnect path. Long-lived streams must be tracked so the lifecycle observer can close them on `stop()`.
- Change Streams require a replica set or sharded cluster. Code that opens one must either be guarded by `service.isReplicaSet()` or throw a clear error pointing the user at the topology requirement.

### Transactions

- Prefer `client.withTransaction(async session => { ... })` over raw `session.startTransaction()` + manual `commitTransaction` / `abortTransaction`. `withTransaction` auto-retries on `TransientTransactionError` and `UnknownTransactionCommitResult`.
- Raw transactions are allowed when retry semantics need to be custom — must carry a comment saying why.
- Transactions require a replica set or sharded cluster.

### Query safety

- `$where` operator — flag as performance and injection risk. Suggest restructuring.
- `$regex` with a leading unanchored pattern (no `^`) — flag as full-collection scan risk. Suggest anchoring or using `$text` with a text index.
- Filter values built from user input that aren't sanitized into ObjectIds or typed primitives — flag.

### Indexes

- New query patterns (find/aggregate `$match`/sort) without a corresponding index — flag.
- `createIndex` without `background: true` is fine on modern servers (4.4+); just confirm it's not being called in a hot path.

### GridFS

- File uploads must use `openUploadStream` / `openUploadStreamWithId`, not `bucket.uploadFromBuffer` of large buffers. Same for download — `openDownloadStream`, not buffering.
- Verify chunkSize is reasonable (default 255 KB is usually fine).

### Topology & replica set requirements

- `watch()`, transactions, `$changeStream`, and `$merge` require replica set or sharded. Calls to those APIs must be guarded or accompany a clear error.
- The plugin exposes `MongoService.isReplicaSet()` and `getTopologyType()` — new code should consult those rather than re-detecting.

### Credentials & redaction

- Every URL passed to `debug()`, `console.log`, thrown error message, or telemetry must go through `redactUrl()` (`src/helpers/config-validator.ts`).
- Auth options (`username`, `password`, `authSource`) must not appear in any log line — search the diff for those identifiers near `debug(`/`log(`.

### Driver-7 specific

- Cursor `batchSize`: driver 7 removed the default 1000 limit for `getMore`. New cursor code that iterates without an explicit `batchSize` on large collections — flag, suggest a value.
- `Collection.watch()`: no longer filters `$changeStream` stage options; if the code was relying on that filter, it's now exposed and may need explicit handling.
- `dropCollection`: now returns `false` for missing namespace instead of throwing. If the diff catches the old throw, it's now dead code.

## Output

Numbered findings grouped by severity. Each finding has file:line, the rule, the fix, and the relevant doc URL.

```
## Critical
1. src/path/file.ts:LINE — <issue> — <fix>
   Ref: <driver or server doc URL>

## Medium
2. ...

## Low
3. ...

## Notes
- Driver version detected: <from package.json>
- Engines required: <node version>
```

## Severity guide

- **Critical**: credential leak, data corruption risk, transaction without retry that can lose writes, change stream never closed, replica-set-required API called against a known standalone topology.
- **Medium**: missing index for a new query, $where / unanchored $regex usage, manual transaction without justification.
- **Low**: missing batchSize on a new cursor, JSDoc gap on a driver-touching public method.

## Do not

- Do not duplicate style-guide findings — that's `lb4-style-check`.
- Do not duplicate architecture findings — that's `lb4-plugin-review`.
- Do not modify code.
