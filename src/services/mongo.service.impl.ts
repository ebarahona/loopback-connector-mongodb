import {inject, injectable, BindingScope} from '@loopback/core';
import {
  MongoClient,
  Db,
  Collection,
  Document,
  AggregateOptions,
  AggregationCursor,
  ChangeStream,
  ChangeStreamOptions,
  ChangeStreamDocument,
  CreateCollectionOptions,
  TimeSeriesCollectionOptions,
  GridFSBucket,
  GridFSBucketOptions,
  ClientSession,
  TransactionOptions,
  AnyBulkWriteOperation,
  BulkWriteOptions,
  BulkWriteResult,
  IndexSpecification,
  CreateIndexesOptions,
  IndexDescription,
  ListDatabasesResult,
  FindOptions,
  Filter,
  FindCursor,
  Admin,
} from 'mongodb';
import debugFactory from 'debug';
import {MongoBindings} from '../keys';
import {MongoConnectionManager} from '../helpers/connection-manager';
import type {MongoService} from './mongo.service';

const debug = debugFactory('loopback:connector:mongodb:service');

@injectable({scope: BindingScope.SINGLETON})
export class MongoServiceImpl implements MongoService {
  private manager: MongoConnectionManager;

  constructor(
    @inject(MongoBindings.CONNECTION_MANAGER)
    manager: MongoConnectionManager,
  ) {
    this.manager = manager;
  }

  // ---- Core access ----

  getClient(): MongoClient {
    return this.manager.getClient();
  }

  getDb(name?: string): Db {
    return this.manager.getDb(name);
  }

  getCollection<T extends Document>(
    name: string,
    db?: string,
  ): Collection<T> {
    return this.getDb(db).collection<T>(name);
  }

  // ---- Aggregation ----

  async aggregate<T extends Document>(
    collection: string,
    pipeline: Document[],
    options?: AggregateOptions & {db?: string},
  ): Promise<T[]> {
    const {db, ...driverOptions} = options ?? {};
    debug('aggregate [%s] stages=%d', collection, pipeline.length);
    return this.getDb(db)
      .collection<T>(collection)
      .aggregate<T>(pipeline, driverOptions)
      .toArray();
  }

  aggregateCursor<T extends Document>(
    collection: string,
    pipeline: Document[],
    options?: AggregateOptions & {db?: string},
  ): AggregationCursor<T> {
    const {db, ...driverOptions} = options ?? {};
    return this.getDb(db)
      .collection<T>(collection)
      .aggregate<T>(pipeline, driverOptions);
  }

  // ---- Change Streams ----

  watchCollection<T extends Document>(
    collection: string,
    pipeline?: Document[],
    options?: ChangeStreamOptions,
  ): ChangeStream<T, ChangeStreamDocument<T>> {
    this.assertReplicaSet('watchCollection');
    debug('watchCollection [%s]', collection);
    return this.getCollection<T>(collection).watch(
      pipeline,
      options,
    );
  }

  watchDatabase(
    pipeline?: Document[],
    options?: ChangeStreamOptions,
  ): ChangeStream {
    this.assertReplicaSet('watchDatabase');
    debug('watchDatabase');
    return this.getDb().watch(pipeline, options);
  }

  watchClient(
    pipeline?: Document[],
    options?: ChangeStreamOptions,
  ): ChangeStream {
    this.assertReplicaSet('watchClient');
    debug('watchClient');
    return this.manager.getClient().watch(pipeline, options);
  }

  // ---- Time Series ----

  async createTimeSeriesCollection(
    name: string,
    timeseriesOptions: TimeSeriesCollectionOptions,
    validatorSchema?: Document,
    options?: Omit<
      CreateCollectionOptions,
      'timeseries' | 'validator'
    >,
  ): Promise<Collection> {
    debug(
      'createTimeSeriesCollection [%s] timeField=%s',
      name,
      timeseriesOptions.timeField,
    );

    const createOptions: CreateCollectionOptions = {
      ...options,
      timeseries: timeseriesOptions,
    };

    if (validatorSchema) {
      createOptions.validator = {$jsonSchema: validatorSchema};
    }

    return this.getDb().createCollection(name, createOptions);
  }

  // ---- GridFS ----

  getGridFSBucket(
    bucketName?: string,
    options?: GridFSBucketOptions,
  ): GridFSBucket {
    return new GridFSBucket(this.getDb(), {
      ...options,
      ...(bucketName ? {bucketName} : {}),
    });
  }

  // ---- Bulk operations ----

  async bulkWrite<T extends Document>(
    collection: string,
    operations: AnyBulkWriteOperation<T>[],
    options?: BulkWriteOptions & {db?: string},
  ): Promise<BulkWriteResult> {
    const {db, ...driverOptions} = options ?? {};
    debug('bulkWrite [%s] ops=%d', collection, operations.length);
    return this.getDb(db)
      .collection<T>(collection)
      .bulkWrite(operations, driverOptions);
  }

  // ---- Transactions ----

  async withSession<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    return this.manager.getClient().withSession(fn);
  }

  async withTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    let result!: T;
    await this.manager.getClient().withSession(async session => {
      await session.withTransaction(async s => {
        result = await fn(s);
      }, options);
    });
    return result;
  }

  // ---- Tailable cursors ----

  tailableCursor<T extends Document>(
    collection: string,
    filter?: Filter<T>,
    options?: FindOptions,
  ): FindCursor<T> {
    debug('tailableCursor [%s]', collection);
    const coll = this.getCollection<T>(collection);
    return coll.find(filter ?? ({} as Filter<T>), {
      ...options,
      tailable: true,
      awaitData: true,
    }) as FindCursor<T>;
  }

  // ---- Index management ----

  async createIndex(
    collection: string,
    indexSpec: IndexSpecification,
    options?: CreateIndexesOptions,
  ): Promise<string> {
    return this.getCollection(collection).createIndex(
      indexSpec,
      options,
    );
  }

  async createIndexes(
    collection: string,
    indexes: IndexDescription[],
    options?: CreateIndexesOptions,
  ): Promise<string[]> {
    return this.getCollection(collection).createIndexes(
      indexes,
      options,
    );
  }

  async listIndexes(collection: string): Promise<Document[]> {
    return this.getCollection(collection).listIndexes().toArray();
  }

  async dropIndex(
    collection: string,
    indexName: string,
  ): Promise<void> {
    await this.getCollection(collection).dropIndex(indexName);
  }

  // ---- Admin ----

  admin(): Admin {
    return this.getDb().admin();
  }

  async listDatabases(): Promise<ListDatabasesResult> {
    return this.admin().listDatabases();
  }

  async listCollections(
    db?: string,
    filter?: Document,
  ): Promise<Document[]> {
    return this.getDb(db).listCollections(filter).toArray();
  }

  async dbStats(db?: string): Promise<Document> {
    return this.getDb(db).stats();
  }

  async command(command: Document, db?: string): Promise<Document> {
    return this.getDb(db).command(command);
  }

  // ---- Topology ----

  isReplicaSet(): boolean {
    return this.manager.getTopology().isReplicaSet;
  }

  getTopologyType(): string {
    return this.manager.getTopology().topologyType;
  }

  private assertReplicaSet(operation: string): void {
    const topo = this.manager.getTopology();
    if (!topo.isReplicaSet) {
      throw new Error(
        `${operation} requires a replica set or sharded cluster. ` +
          `Current topology: ${topo.topologyType}`,
      );
    }
  }
}
