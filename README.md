# @ebarahona/loopback-connector-mongodb

Full-featured MongoDB connector for LoopBack 4, built on the native MongoDB Node.js driver 6.x. Provides CRUD via the juggler connector interface, plus advanced operations through an injectable MongoService.

```bash
npm install @ebarahona/loopback-connector-mongodb
```

## Why

The official `loopback-connector-mongodb` provides CRUD via the juggler interface but does not support aggregation pipelines, Change Streams, Time Series Collections, $jsonSchema validation, GridFS, tailable cursors, or bulk operations. It uses the MongoDB driver 5.x with callback-based internals.

This package is a ground-up implementation on driver 6.x with TypeScript. It provides the same juggler-compatible CRUD plus an injectable `MongoService` for every native driver feature the official connector cannot expose.

| | Official connector | This package |
|---|---|---|
| CRUD (repositories) | Yes | Yes |
| MongoDB driver | 5.x | 6.x |
| TypeScript | No | Yes |
| Aggregation pipelines | No | Yes |
| Change Streams | No | Yes |
| Time Series Collections | No | Yes |
| $jsonSchema validation | No | Yes |
| GridFS | No | Yes |
| Transactions | Partial | Yes |
| Bulk operations | No | Yes |
| Tailable cursors | No | Yes |

## What This Provides

| Layer | Purpose |
|---|---|
| **Connector** | Juggler-compatible CRUD (models, repositories, datasources) |
| **MongoService** | Aggregation, Change Streams, Time Series, GridFS, transactions, bulk ops, tailable cursors, indexes, admin |
| **MongoComponent** | LB4 Component with singleton MongoClient, lifecycle management |

## Integration Paths

This package supports two integration modes:

**Component path (recommended):** Use `MongoComponent` to get a shared `MongoConnectionManager` singleton. The lifecycle observer owns connect/disconnect. `MongoService` uses this shared manager. If you also need juggler repositories, pass the shared manager to the connector.

**Standalone juggler path:** Use `initialize()` via a juggler `DataSource`. The connector creates and owns its own connection manager. `MongoService` is not available in this mode.

For apps that need both repositories AND MongoService, use the component path and wire the shared manager into the connector.

## Quick Start

### Using the Component (recommended)

```typescript
import {Application} from '@loopback/core';
import {MongoComponent, MongoBindings} from '@ebarahona/loopback-connector-mongodb';

const app = new Application();
app.bind(MongoBindings.CONFIG).to({
  url: 'mongodb://localhost:27017',
  database: 'myapp',
});
app.component(MongoComponent);
```

### Using the Connector with DataSource

```typescript
import {juggler} from '@loopback/repository';

const ds = new juggler.DataSource({
  connector: require('@ebarahona/loopback-connector-mongodb'),
  url: 'mongodb://localhost:27017/myapp',
});
```

## MongoService

Inject `MongoBindings.SERVICE` to access advanced operations:

```typescript
import {inject} from '@loopback/core';
import {MongoBindings, MongoService} from '@ebarahona/loopback-connector-mongodb';

class AnalyticsService {
  constructor(
    @inject(MongoBindings.SERVICE) private mongo: MongoService,
  ) {}

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
    await this.mongo.withTransaction(async (session) => {
      const accounts = this.mongo.getCollection('accounts');
      await accounts.updateOne({_id: from}, {$inc: {balance: -amount}}, {session});
      await accounts.updateOne({_id: to}, {$inc: {balance: amount}}, {session});
    });
  }
}
```

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

## Topology

The connector and service detect topology automatically after connection:

- **Standalone**: All operations except Change Streams
- **Replica Set**: All operations including Change Streams
- **Sharded**: All operations including Change Streams

Change Stream methods throw a descriptive error on standalone instances.

## Requirements

- Node.js >= 18
- MongoDB 4.4+
- LoopBack 4 application

Peer dependency: `@loopback/core`. Runtime dependencies: `mongodb` 6.x, `debug`.

## License

MIT
