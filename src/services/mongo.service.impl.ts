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
import {MongoConnectorConfig} from '../types';
import {detectTopology, TopologyInfo} from '../helpers/topology';
import type {MongoService} from './mongo.service';

const debug = debugFactory('loopback:connector:mongodb:service');

@injectable({scope: BindingScope.SINGLETON})
export class MongoServiceImpl implements MongoService {
  private client: MongoClient;
  private defaultDb: string;
  private topology?: TopologyInfo;

  constructor(
    @inject(MongoBindings.CLIENT)
    client: MongoClient,
    @inject(MongoBindings.CONFIG, {optional: true})
    config?: MongoConnectorConfig,
  ) {
    this.client = client;
    this.defaultDb = config?.database ?? 'test';
  }

  // ---- Core access ----

  getClient(): MongoClient {
    return this.client;
  }

  getDb(name?: string): Db {
    return this.client.db(name ?? this.defaultDb);
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
    options?: AggregateOptions,
  ): Promise<T[]> {
    debug('aggregate [%s] stages=%d', collection, pipeline.length);
    return this.getCollection<T>(collection)
      .aggregate<T>(pipeline, options)
      .toArray();
  }

  aggregateCursor<T extends Document>(
    collection: string,
    pipeline: Document[],
    options?: AggregateOptions,
  ): AggregationCursor<T> {
    return this.getCollection<T>(collection).aggregate<T>(
      pipeline,
      options,
    );
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
    debug('watchDatabase [%s]', this.defaultDb);
    return this.getDb().watch(pipeline, options);
  }

  watchClient(
    pipeline?: Document[],
    options?: ChangeStreamOptions,
  ): ChangeStream {
    this.assertReplicaSet('watchClient');
    debug('watchClient');
    return this.client.watch(pipeline, options);
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
      bucketName,
      ...options,
    });
  }

  // ---- Bulk operations ----

  async bulkWrite<T extends Document>(
    collection: string,
    operations: AnyBulkWriteOperation<T>[],
    options?: BulkWriteOptions,
  ): Promise<BulkWriteResult> {
    debug('bulkWrite [%s] ops=%d', collection, operations.length);
    return this.getCollection<T>(collection).bulkWrite(
      operations,
      options,
    );
  }

  // ---- Transactions ----

  async withSession<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    return this.client.withSession(fn);
  }

  async withTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    return this.client.withSession(async session => {
      return session.withTransaction(fn, options);
    }) as Promise<T>;
  }

  // ---- Tailable cursors ----

  tailableCursor<T extends Document>(
    collection: string,
    filter?: Filter<T>,
    options?: FindOptions,
  ): FindCursor<T> {
    debug('tailableCursor [%s]', collection);
    return this.getCollection<T>(collection).find(
      (filter ?? {}) as Filter<T>,
      {
        ...options,
        tailable: true,
        awaitData: true,
      },
    ) as unknown as FindCursor<T>;
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
    return this.getTopology().isReplicaSet;
  }

  getTopologyType(): string {
    return this.getTopology().topologyType;
  }

  private getTopology(): TopologyInfo {
    if (!this.topology) {
      this.topology = detectTopology(this.client);
    }
    return this.topology;
  }

  private assertReplicaSet(operation: string): void {
    if (!this.isReplicaSet()) {
      throw new Error(
        `${operation} requires a replica set or sharded cluster. ` +
          `Current topology: ${this.getTopologyType()}`,
      );
    }
  }
}
