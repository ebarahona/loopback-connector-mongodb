# @ebarahona/loopback-connector-mongodb

Full-featured MongoDB connector for LoopBack 4, built on the native MongoDB Node.js driver 7.x. Provides CRUD via the juggler connector interface, plus advanced operations through an injectable MongoService.

```bash
npm install @ebarahona/loopback-connector-mongodb
```

## Why

This connector is built for a specific architectural goal: combined with [`@ebarahona/loopback-transport-core`](https://github.com/ebarahona/loopback-transport-core), it gives LoopBack 4 apps the same `ExecutionContext`-driven, decorator-based message-handler architecture that NestJS provides, on the LB4 foundation, with LB4's DI, lifecycle, and component model.

Two halves of one design:

- **[`@ebarahona/loopback-transport-core`](https://github.com/ebarahona/loopback-transport-core)**: a transport-agnostic `ExecutionContext` (one API across HTTP, RPC, and event transports), `@messageHandler` / `@eventHandler` / `@payload` / `@transportCtx` decorators, abstract `ServerBase` / `ClientProxy` for transport adapters. Same programming model as NestJS microservices, composed with LB4's container.
- **`@ebarahona/loopback-connector-mongodb`** (this package): modern MongoDB driver 7.x connector with a shared `MongoConnectionManager`, multi-tenant `MongoDataSourceFactory`, injectable `MongoService`, and full TypeScript types. Anything a `@messageHandler` method needs from MongoDB is one `@inject(MongoBindings.…)` away.

> **`ExecutionContext` is unified across transports.**

The two plugins compose orthogonally through LB4's DI, with no glue layer required. A handler is a regular controller method that happens to be decorated with `@messageHandler`; it injects MongoDB the same way any controller would.

<details>
<summary><b>Show example: NestJS-style handler backed by MongoService</b></summary>

```typescript
import {inject} from '@loopback/core';
import {
  messageHandler,
  eventHandler,
  payload,
} from '@ebarahona/loopback-transport-core';
import {
  MongoBindings,
  MongoService,
} from '@ebarahona/loopback-connector-mongodb';

export class OrderController {
  constructor(@inject(MongoBindings.SERVICE) private mongo: MongoService) {}

  @messageHandler('order.get')
  async getOrder(@payload() data: {id: string}) {
    const [order] = await this.mongo.aggregate('orders', [
      {$match: {_id: data.id}},
      {
        $lookup: {
          from: 'line_items',
          localField: '_id',
          foreignField: 'order_id',
          as: 'items',
        },
      },
    ]);
    return order;
  }

  @eventHandler('order.placed')
  async onPlaced(@payload() event: {id: string; total: number}) {
    await this.mongo.getCollection('orders').insertOne(event);
  }
}
```

</details>

Beyond the transport-core pairing, the official `loopback-connector-mongodb` is stuck on MongoDB driver 5.x with callback-based internals and JavaScript source; it does not support aggregation pipelines, Change Streams, Time Series Collections, `$jsonSchema` validation, GridFS, tailable cursors, or bulk operations. This package is a ground-up TypeScript implementation on driver 7.x that exposes every native driver feature the official connector cannot.

|                                                     | Official connector | This package |
| --------------------------------------------------- | ------------------ | ------------ |
| CRUD (repositories)                                 | Yes                | Yes          |
| MongoDB driver                                      | 5.x                | 7.x          |
| TypeScript                                          | No                 | Yes          |
| Aggregation pipelines                               | No                 | Yes          |
| Change Streams                                      | No                 | Yes          |
| Time Series Collections                             | No                 | Yes          |
| $jsonSchema validation                              | No                 | Yes          |
| GridFS                                              | No                 | Yes          |
| Transactions                                        | Partial            | Yes          |
| Bulk operations                                     | No                 | Yes          |
| Tailable cursors                                    | No                 | Yes          |
| Pairs with transport-core for NestJS-style handlers | No                 | Yes          |

## What This Provides

| Layer              | Purpose                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Connector**      | Juggler-compatible CRUD (models, repositories, datasources)                                                |
| **MongoService**   | Aggregation, Change Streams, Time Series, GridFS, transactions, bulk ops, tailable cursors, indexes, admin |
| **MongoComponent** | LB4 Component with singleton MongoClient, lifecycle management                                             |

## Integration Paths

This package supports two integration modes:

**Component path (recommended):** Use `MongoComponent`. It binds a shared `MongoConnectionManager`, the `MongoService`, and a `MongoDataSource` (a juggler `DataSource` wired to the shared manager) so repositories and `MongoService` share one connection pool. The lifecycle observer owns connect/disconnect.

**Standalone juggler path:** Use `initialize()` via a plain juggler `DataSource`. The connector creates and owns its own connection manager. `MongoService` is not available in this mode.

## Quick Start

### Using the Component (recommended)

```typescript
import {Application} from '@loopback/core';
import {juggler} from '@loopback/repository';
import {
  MongoComponent,
  MongoBindings,
  MongoService,
} from '@ebarahona/loopback-connector-mongodb';

const app = new Application();
app.bind(MongoBindings.CONFIG).to({
  url: 'mongodb://localhost:27017',
  database: 'myapp',
});
app.component(MongoComponent);
await app.start();

// Shared DataSource for repositories
const ds = await app.get<juggler.DataSource>(MongoBindings.DATASOURCE);

// Same connection pool, advanced operations
const mongo = await app.get<MongoService>(MongoBindings.SERVICE);
```

The repositories built against `MongoBindings.DATASOURCE` and code that injects `MongoBindings.SERVICE` share the same `MongoConnectionManager`, so there is exactly one pool, one lifecycle, and one topology state.

### Using the Connector with DataSource (standalone)

```typescript
import {juggler} from '@loopback/repository';

const ds = new juggler.DataSource({
  connector: require('@ebarahona/loopback-connector-mongodb'),
  url: 'mongodb://localhost:27017/myapp',
});
```

## MongoService

Inject `MongoBindings.SERVICE` to access advanced operations:

<details>
<summary><b>Show example: aggregation, change streams, time series, GridFS, transactions</b></summary>

```typescript
import {inject} from '@loopback/core';
import {
  MongoBindings,
  MongoService,
} from '@ebarahona/loopback-connector-mongodb';

class AnalyticsService {
  constructor(@inject(MongoBindings.SERVICE) private mongo: MongoService) {}

  // Aggregation pipeline
  async getDailyMetrics(): Promise<DailyMetric[]> {
    return this.mongo.aggregate('ts_ad_insights', [
      {$match: {timestamp: {$gte: startDate}}},
      {$group: {_id: '$date', totalSpend: {$sum: '$spend'}}},
      {$sort: {_id: 1}},
    ]);
  }

  // Change Streams (requires replica set)
  watchInserts(): ChangeStream {
    return this.mongo.watchCollection('orders', [
      {$match: {operationType: 'insert'}},
    ]);
  }

  // Time Series collection
  async setupMetrics(): Promise<void> {
    await this.mongo.createTimeSeriesCollection('ts_metrics', {
      timeField: 'timestamp',
      metaField: 'source',
      granularity: 'minutes',
    });
  }

  // GridFS
  getFileBucket(): GridFSBucket {
    return this.mongo.getGridFSBucket('uploads');
  }

  // Transactions
  async transferFunds(from: string, to: string, amount: number): Promise<void> {
    await this.mongo.withTransaction(async session => {
      const accounts = this.mongo.getCollection('accounts');
      await accounts.updateOne(
        {_id: from},
        {$inc: {balance: -amount}},
        {session},
      );
      await accounts.updateOne({_id: to}, {$inc: {balance: amount}}, {session});
    });
  }
}
```

</details>

## MongoService API

### Core Access

- `getClient()` -- native MongoClient
- `getDb(name?)` -- database instance
- `getCollection<T>(name, db?)` -- typed collection

### Aggregation

- `aggregate<T>(collection, pipeline, options?)` -- execute pipeline, return array
- `aggregateCursor<T>(collection, pipeline, options?)` -- return cursor for streaming

### Change Streams

- `watchCollection<T>(collection, pipeline?, options?)` -- collection-level
- `watchDatabase(pipeline?, options?)` -- database-level
- `watchClient(pipeline?, options?)` -- client-level (all databases)

Requires replica set or sharded cluster. Throws on standalone with a clear error.

### Time Series

- `createTimeSeriesCollection(name, timeseriesOptions, validatorSchema?, options?)` -- create with optional $jsonSchema

### GridFS

- `getGridFSBucket(bucketName?, options?)` -- file upload/download

### Bulk Operations

- `bulkWrite<T>(collection, operations, options?)` -- mixed insert/update/delete

### Transactions

- `withSession<T>(fn)` -- session scope
- `withTransaction<T>(fn, options?)` -- ACID transaction with auto-retry

### Tailable Cursors

- `tailableCursor<T>(collection, filter?, options?)` -- continuous reads on capped collections

### Index Management

- `createIndex(collection, indexSpec, options?)`
- `createIndexes(collection, indexes, options?)`
- `listIndexes(collection)`
- `dropIndex(collection, indexName)`

### Admin

- `admin()` -- native Admin instance
- `listDatabases()`
- `listCollections(db?, filter?)`
- `dbStats(db?)`
- `command(command, db?)`

### Topology

- `isReplicaSet()` -- detect topology
- `getTopologyType()` -- 'Single', 'ReplicaSetWithPrimary', 'Sharded', etc.

## Connector CRUD

The connector implements the juggler interface for standard repository operations:

```typescript
// Standard LoopBack 4 repository usage
const orders = await this.orderRepo.find({where: {status: 'active'}});
const order = await this.orderRepo.create({name: 'New', total: 99});
await this.orderRepo.updateAll({status: 'shipped'}, {where: {id: orderId}});
const count = await this.orderRepo.count({status: 'pending'});
```

Supports: `create`, `find`, `all`, `updateAll`, `deleteAll`, `count`, `replaceById`, `updateOrCreate`, `findOrCreate`, `exists`, `execute`, `beginTransaction`, `commit`, `rollback`.

## Reaching the native driver

This package exposes the common MongoDB surface via typed helpers, and the rest of the driver is one method call away through documented escape hatches. The goal is that users never need to leave LoopBack 4's DI surface to access any MongoDB capability -- driver options pass through `clientOptions`, and the raw `MongoClient`, `Db`, and `Collection<T>` are reachable from `MongoService`. This is the same architectural pattern MongoDB's own libraries use; for example, the PHP library exposes `$vectorSearch` as just an aggregation pipeline stage rather than a separate API.

Authoritative reference: [MongoDB Node.js Driver docs](https://www.mongodb.com/docs/drivers/node/current/) (driver 7.x). The examples below link to the specific driver-doc pages where each feature is documented in depth.

### Driver-level logging

The driver's structured logger is configured through `clientOptions`, environment variables, or a custom destination. Full reference: [Logging](https://www.mongodb.com/docs/drivers/node/current/monitoring-and-logging/logging/).

**Via `clientOptions` (typed):**

<details>
<summary><b>Show config: clientOptions logging</b></summary>

```typescript
app.bind(MongoBindings.CONFIG).to({
  url: 'mongodb://localhost:27017',
  database: 'myapp',
  clientOptions: {
    mongodbLogComponentSeverities: {default: 'info', command: 'off'},
    mongodbLogPath: 'stdout',
    mongodbLogMaxDocumentLength: 500,
  },
});
```

</details>

**Via environment variables (zero config code):**

<details>
<summary><b>Show CLI: log via env vars</b></summary>

```bash
MONGODB_LOG_COMMAND=debug MONGODB_LOG_PATH=stderr node app.js
```

</details>

Available variables: `MONGODB_LOG_ALL`, `MONGODB_LOG_COMMAND`, `MONGODB_LOG_TOPOLOGY`, `MONGODB_LOG_SERVER_SELECTION`, `MONGODB_LOG_CONNECTION`, `MONGODB_LOG_CLIENT`, `MONGODB_LOG_PATH`, `MONGODB_LOG_MAX_DOCUMENT_LENGTH`.

**Via custom log destination:**

<details>
<summary><b>Show example: custom log destination</b></summary>

```typescript
app.bind(MongoBindings.CONFIG).to({
  url: '...',
  database: '...',
  clientOptions: {
    mongodbLogPath: {
      async write(log) {
        // ship to your structured logger here
        myLogger.info(log);
      },
    },
  },
});
```

</details>

Command logging is performance-heavy; use `mongodbLogMaxDocumentLength` to cap document size in logs and avoid sensitive data leaking through query payloads.

### Atlas Vector Search

Vector search is server-side and works via the existing `MongoService.aggregate()` -- no special method needed. Pipeline-stage reference: [`$vectorSearch`](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-stage/).

<details>
<summary><b>Show example: $vectorSearch aggregation pipeline</b></summary>

```typescript
const results = await mongo.aggregate('embeddings', [
  {
    $vectorSearch: {
      index: 'plot_embedding_index',
      path: 'plot_embedding',
      queryVector: [
        /* your embedding */
      ],
      numCandidates: 150,
      limit: 5,
      filter: {genre: 'action'},
    },
  },
  {
    $project: {
      _id: 0,
      title: 1,
      score: {$meta: 'vectorSearchScore'},
    },
  },
]);
```

</details>

Vector search requires MongoDB Atlas (cloud) or Enterprise 8.0+ with the Atlas Search local emulator. Self-hosted Community Edition does not support vector search.

### Atlas Search index management

Search-index methods aren't yet first-class on `MongoService` (planned). For now, use the driver via `getCollection()`. Driver-doc reference: [Atlas Search Indexes](https://www.mongodb.com/docs/drivers/node/current/atlas-search/).

<details>
<summary><b>Show example: create and list Atlas Search index</b></summary>

```typescript
const coll = mongo.getCollection('embeddings');

await coll.createSearchIndex({
  name: 'plot_embedding_index',
  type: 'vectorSearch',
  definition: {
    fields: [
      {
        type: 'vector',
        path: 'plot_embedding',
        numDimensions: 1536,
        similarity: 'cosine',
      },
    ],
  },
});

// Wait for index to be queryable (sync is async on Atlas):
const indexes = await coll.listSearchIndexes().toArray();
```

</details>

Typed `createSearchIndex` / `listSearchIndexes` / `updateSearchIndex` / `dropSearchIndex` helpers on `MongoService` are coming in a future release.

### Raw client / db / collection access

<details>
<summary><b>Show example: native MongoClient, Db, and Collection access</b></summary>

```typescript
import {inject} from '@loopback/core';
import {
  MongoBindings,
  MongoService,
} from '@ebarahona/loopback-connector-mongodb';

class CustomService {
  constructor(@inject(MongoBindings.SERVICE) private mongo: MongoService) {}

  async runRawCommand() {
    const client = this.mongo.getClient(); // native MongoClient
    const db = this.mongo.getDb(); // native Db (default database)
    const coll = this.mongo.getCollection<MyDoc>('items'); // typed Collection<MyDoc>

    return db.command({serverStatus: 1});
  }
}
```

</details>

`MongoService.getCollection<T>(name)` retains TypeScript type-safety through the driver's `Collection<T>` shape. See the driver's [Fundamentals](https://www.mongodb.com/docs/drivers/node/current/get-started/) and [CRUD Operations](https://www.mongodb.com/docs/drivers/node/current/crud/) for the full native API.

### Arbitrary database commands

For any MongoDB command not covered by a first-class helper (server admin, diagnostics, replica-set management, free-form database commands), use `MongoService.command()`. It's a thin wrapper over the driver's [`db.runCommand()`](https://www.mongodb.com/docs/drivers/node/current/run-command/) and accepts any command document the server supports.

<details>
<summary><b>Show example: arbitrary database commands</b></summary>

```typescript
// Server diagnostics
const status = await mongo.command({serverStatus: 1});
const stats = await mongo.command({dbStats: 1});

// Replica set introspection
const rsStatus = await mongo.command({replSetGetStatus: 1});

// Server-side scripting / admin
const hello = await mongo.command({hello: 1});
const buildInfo = await mongo.command({buildInfo: 1});

// Target a specific database
const adminPing = await mongo.command({ping: 1}, 'admin');
```

</details>

Use `mongo.getDb().command(...)` directly if you need to pass driver-level `RunCommandOptions` (read preference, session, etc.). The same applies to `mongo.admin().command(...)` for commands that must run against the admin database.

Avoid `db.command()` for operations that have a first-class helper (`findOne`, `aggregate`, `createIndex`, etc.). Those wrappers return typed results, handle cursor management, and integrate with the connector's session/transaction support.

## Known limitations

These APIs are marked `@experimental` for the first release. They work but
have documented edge cases pending follow-up work.

### `MongoConnector.execute()`

A raw-driver escape hatch. The `SAFE_COMMANDS` allowlist gates _which_
methods may be called; argument shape is not validated. Calling
`execute('deleteMany', {})` with an empty filter will delete the entire
collection. Prefer the typed helpers on `MongoService` or the connector's
CRUD methods. Treat `execute()` as a stopgap until the operation you need
has a first-class wrapper.

### `MongoConnector.findOrCreate()`

On a duplicate-key conflict (MongoDB error 11000), the follow-up lookup
re-runs `find(filter)` with the caller's original filter. If the unique
index that caused the conflict covers a field _not_ in `filter`, the
returned document may be unrelated to the duplicate. Use `updateOrCreate`
(upsert) or raw `replaceOne` with explicit unique-key filters for stricter
semantics. A future release will narrow the lookup to the conflicting
key automatically.

### `Decimal128` precision

When a `Decimal128` value is mapped back to a JavaScript number through
the connector's property mapper, it passes through `parseFloat`. Values
outside JavaScript's safe Number range (`Number.MAX_SAFE_INTEGER` is
roughly `2^53`) lose precision. A `decimalAsString` configuration option
that preserves the full value as a string is planned. For now,
applications handling financial values should read raw documents via
`MongoService.getCollection<T>(name)` and work with `Decimal128`
instances directly.

## Topology

The connector and service detect topology automatically after connection:

- **Standalone**: All operations except Change Streams
- **Replica Set**: All operations including Change Streams
- **Sharded**: All operations including Change Streams

Change Stream methods throw a descriptive error on standalone instances.

## Requirements

- Node.js >= 20.19.0
- MongoDB 5.0+
- LoopBack 4 application

Peer dependencies: `@loopback/core` (>=7.0.0 <8.0.0), `@loopback/repository` (>=8.0.0 <9.0.0). Runtime dependencies: `mongodb` 7.x, `debug`.

## License

MIT
