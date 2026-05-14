import type {
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

/**
 * Injectable service providing full native MongoDB driver access.
 *
 * Covers operations beyond CRUD that the connector/repository
 * pattern does not support:
 * - Aggregation pipelines
 * - Change Streams (collection, database, client level)
 * - Time Series collection creation with $jsonSchema
 * - GridFS file storage
 * - Transactions and sessions
 * - Bulk operations
 * - Tailable cursors
 * - Index management
 * - Admin commands
 *
 * Uses the same MongoClient singleton as the connector.
 *
 * @public
 */
export interface MongoService {
  // ---- Core access ----

  getClient(): MongoClient;
  getDb(name?: string): Db;
  getCollection<T extends Document>(name: string, db?: string): Collection<T>;

  // ---- Aggregation ----

  aggregate<T extends Document>(
    collection: string,
    pipeline: Document[],
    options?: AggregateOptions & {db?: string},
  ): Promise<T[]>;

  aggregateCursor<T extends Document>(
    collection: string,
    pipeline: Document[],
    options?: AggregateOptions & {db?: string},
  ): AggregationCursor<T>;

  // ---- Change Streams ----

  watchCollection<T extends Document>(
    collection: string,
    pipeline?: Document[],
    options?: ChangeStreamOptions,
  ): ChangeStream<T, ChangeStreamDocument<T>>;

  watchDatabase(
    pipeline?: Document[],
    options?: ChangeStreamOptions,
  ): ChangeStream;

  watchClient(
    pipeline?: Document[],
    options?: ChangeStreamOptions,
  ): ChangeStream;

  // ---- Time Series ----

  createTimeSeriesCollection(
    name: string,
    timeseriesOptions: TimeSeriesCollectionOptions,
    validatorSchema?: Document,
    options?: Omit<CreateCollectionOptions, 'timeseries' | 'validator'>,
  ): Promise<Collection>;

  // ---- GridFS ----

  getGridFSBucket(
    bucketName?: string,
    options?: GridFSBucketOptions,
  ): GridFSBucket;

  // ---- Bulk operations ----

  bulkWrite<T extends Document>(
    collection: string,
    operations: AnyBulkWriteOperation<T>[],
    options?: BulkWriteOptions & {db?: string},
  ): Promise<BulkWriteResult>;

  // ---- Transactions ----

  withSession<T>(fn: (session: ClientSession) => Promise<T>): Promise<T>;

  withTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;

  // ---- Tailable cursors ----

  tailableCursor<T extends Document>(
    collection: string,
    filter?: Filter<T>,
    options?: FindOptions,
  ): FindCursor<T>;

  // ---- Index management ----

  createIndex(
    collection: string,
    indexSpec: IndexSpecification,
    options?: CreateIndexesOptions,
  ): Promise<string>;

  createIndexes(
    collection: string,
    indexes: IndexDescription[],
    options?: CreateIndexesOptions,
  ): Promise<string[]>;

  listIndexes(collection: string): Promise<Document[]>;

  dropIndex(collection: string, indexName: string): Promise<void>;

  // ---- Admin ----

  admin(): Admin;
  listDatabases(): Promise<ListDatabasesResult>;
  listCollections(db?: string, filter?: Document): Promise<Document[]>;
  dbStats(db?: string): Promise<Document>;
  command(command: Document, db?: string): Promise<Document>;

  // ---- Topology ----

  isReplicaSet(): boolean;
  getTopologyType(): string;

  // ---- Lifecycle ----

  /**
   * Close all change streams opened by this service. Idempotent.
   * Called automatically by `MongoLifecycleObserver.stop()` to prevent
   * server-side cursor leaks on app shutdown.
   *
   * @public
   */
  closeAll(): Promise<void>;
}
