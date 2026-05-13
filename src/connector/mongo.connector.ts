import {
  MongoClient,
  Db,
  Collection,
  Document,
  ObjectId,
  ClientSession,
  TransactionOptions,
} from 'mongodb';
import debugFactory from 'debug';
import {MongoConnectorConfig} from '../types';
import {coerceId} from './coercion';
import {buildWhere, buildSort, buildFields} from './query-builder';
import {
  toDatabase,
  fromDatabase,
  getIdPropertyName,
  ModelDefinition,
} from './property-mapping';
import {detectTopology, TopologyInfo} from '../helpers/topology';

const debug = debugFactory('loopback:connector:mongodb');

type Callback<T = unknown> = (err: Error | null, result?: T) => void;

/**
 * MongoDB connector for LoopBack 4.
 *
 * Implements the loopback-connector Connector interface using the
 * native MongoDB Node.js driver 6.x. Supports CRUD operations,
 * query translation, transactions, and direct command execution.
 *
 * Advanced operations (aggregation, Change Streams, Time Series,
 * GridFS) are available through the companion MongoService.
 */
export class MongoConnector {
  name = 'mongodb';
  client?: MongoClient;
  db?: Db;
  settings: MongoConnectorConfig;
  dataSource?: Record<string, unknown>;
  topologyInfo?: TopologyInfo;

  private _models: Record<string, ModelDefinition> = {};
  private connectPromise?: Promise<Db>;

  constructor(settings: MongoConnectorConfig) {
    this.settings = {
      allowExtendedOperators: true,
      strictObjectIDCoercion: false,
      ...settings,
    };
  }

  // ---- Connection lifecycle ----

  async connect(): Promise<Db> {
    if (this.db) return this.db;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = undefined;
    });
    return this.connectPromise;
  }

  private async doConnect(): Promise<Db> {
    const url = this.buildConnectionUrl();
    debug('connecting to %s', url.replace(/\/\/[^@]*@/, '//<credentials>@'));

    this.client = new MongoClient(url, this.settings.clientOptions);
    await this.client.connect();

    const dbName =
      this.settings.database ?? this.extractDatabaseFromUrl(url);
    this.db = this.client.db(dbName);
    this.topologyInfo = detectTopology(this.client);

    debug(
      'connected to database [%s] (topology: %s)',
      dbName,
      this.topologyInfo.topologyType,
    );

    return this.db;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = undefined;
      this.db = undefined;
      this.topologyInfo = undefined;
      debug('disconnected');
    }
  }

  async ping(): Promise<void> {
    const db = await this.ensureConnected();
    await db.command({ping: 1});
  }

  // ---- Model definition ----

  define(modelDefinition: ModelDefinition): void {
    const modelName = modelDefinition.model.modelName;
    this._models[modelName] = modelDefinition;
    debug('defined model [%s]', modelName);
  }

  getModelDefinition(modelName: string): ModelDefinition | undefined {
    return this._models[modelName];
  }

  // ---- CRUD operations ----

  async create(
    modelName: string,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown> {
    const db = await this.ensureConnected();
    const collection = this.collectionForModel(modelName, db);
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    let idValue = data[idName];
    const doc = {...data};

    if (idValue === null || idValue === undefined) {
      delete doc[idName];
    } else {
      doc._id = coerceId(
        idValue,
        modelDef?.properties[idName],
        this.settings.strictObjectIDCoercion,
      );
      if (idName !== '_id') delete doc[idName];
    }

    const dbDoc = toDatabase(modelDef, doc);
    const sessionOpts = this.extractSessionOptions(options);

    const result = await collection.insertOne(dbDoc, sessionOpts);

    // Preserve the caller's explicit ID; only use insertedId
    // when no explicit ID was provided (MongoDB generated one)
    if (idValue === null || idValue === undefined) {
      idValue = result.insertedId;
    }

    debug('create [%s] id=%s', modelName, idValue);
    return idValue;
  }

  async find(
    modelName: string,
    id: unknown,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const db = await this.ensureConnected();
    const collection = this.collectionForModel(modelName, db);
    const modelDef = this._models[modelName];

    const coercedId = coerceId(
      id,
      modelDef?.properties[getIdPropertyName(modelDef)],
      this.settings.strictObjectIDCoercion,
    );
    const sessionOpts = this.extractSessionOptions(options);

    const doc = await collection.findOne(
      {_id: coercedId} as Document,
      sessionOpts,
    );

    if (!doc) return null;
    return this.fromDb(modelName, doc);
  }

  async all(
    modelName: string,
    filter?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const db = await this.ensureConnected();
    const collection = this.collectionForModel(modelName, db);
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const where = buildWhere(
      filter?.where as Record<string, unknown> | undefined,
      idName,
    );
    const sort = buildSort(
      filter?.order as string | string[] | undefined,
      idName,
    );
    const projection = buildFields(
      filter?.fields as
        | string[]
        | Record<string, boolean>
        | undefined,
      idName,
    );

    const sessionOpts = this.extractSessionOptions(options);
    const findOptions: Record<string, unknown> = {...sessionOpts};
    if (projection) findOptions.projection = projection;

    let cursor = collection.find(where, findOptions);
    if (sort) cursor = cursor.sort(sort);
    if (filter?.limit) cursor = cursor.limit(filter.limit as number);
    if (filter?.skip) cursor = cursor.skip(filter.skip as number);
    else if (filter?.offset)
      cursor = cursor.skip(filter.offset as number);

    const docs = await cursor.toArray();
    return docs.map(doc => this.fromDb(modelName, doc));
  }

  async updateAll(
    modelName: string,
    where: Record<string, unknown> | undefined,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{count: number}> {
    const db = await this.ensureConnected();
    const collection = this.collectionForModel(modelName, db);
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const query = buildWhere(where, idName);
    const update = this.buildUpdate(modelName, data);
    const sessionOpts = this.extractSessionOptions(options);

    const result = await collection.updateMany(
      query,
      update,
      sessionOpts,
    );

    debug(
      'updateAll [%s] matched=%d modified=%d',
      modelName,
      result.matchedCount,
      result.modifiedCount,
    );
    return {count: result.modifiedCount};
  }

  async deleteAll(
    modelName: string,
    where: Record<string, unknown> | undefined,
    options?: Record<string, unknown>,
  ): Promise<{count: number}> {
    const db = await this.ensureConnected();
    const collection = this.collectionForModel(modelName, db);
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const query = buildWhere(where, idName);
    const sessionOpts = this.extractSessionOptions(options);

    const result = await collection.deleteMany(query, sessionOpts);

    debug('deleteAll [%s] deleted=%d', modelName, result.deletedCount);
    return {count: result.deletedCount};
  }

  async count(
    modelName: string,
    where?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<number> {
    const db = await this.ensureConnected();
    const collection = this.collectionForModel(modelName, db);
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const query = buildWhere(where, idName);
    const sessionOpts = this.extractSessionOptions(options);

    return collection.countDocuments(query, sessionOpts);
  }

  async replaceById(
    modelName: string,
    id: unknown,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{count: number}> {
    const db = await this.ensureConnected();
    const collection = this.collectionForModel(modelName, db);
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const coercedId = coerceId(
      id,
      modelDef?.properties[idName],
      this.settings.strictObjectIDCoercion,
    );

    const replacement = {...data};
    delete replacement[idName];
    delete replacement._id;
    const dbDoc = toDatabase(modelDef, replacement);
    const sessionOpts = this.extractSessionOptions(options);

    const result = await collection.replaceOne(
      {_id: coercedId} as Document,
      dbDoc,
      sessionOpts,
    );

    return {count: result.modifiedCount};
  }

  async updateOrCreate(
    modelName: string,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const db = await this.ensureConnected();
    const collection = this.collectionForModel(modelName, db);
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const id = data[idName];
    if (id === null || id === undefined) {
      const insertedId = await this.create(modelName, data, options);
      return {...data, [idName]: insertedId};
    }

    const coercedId = coerceId(
      id,
      modelDef?.properties[idName],
      this.settings.strictObjectIDCoercion,
    );

    const replacement = {...data};
    delete replacement[idName];
    delete replacement._id;
    const dbDoc = toDatabase(modelDef, replacement);
    const sessionOpts = this.extractSessionOptions(options);

    const result = await collection.findOneAndReplace(
      {_id: coercedId} as Document,
      dbDoc,
      {upsert: true, returnDocument: 'after', ...sessionOpts},
    );

    return result ? this.fromDb(modelName, result) : data;
  }

  async findOrCreate(
    modelName: string,
    filter: Record<string, unknown>,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<[Record<string, unknown>, boolean]> {
    // Try create first, catch duplicate key
    try {
      const id = await this.create(modelName, data, options);
      const modelDef = this._models[modelName];
      const idName = getIdPropertyName(modelDef);
      return [{...data, [idName]: id}, true];
    } catch (err) {
      // Duplicate key error code 11000
      if ((err as {code?: number}).code === 11000) {
        const existing = await this.all(modelName, filter, options);
        if (existing.length > 0) {
          return [existing[0], false];
        }
      }
      throw err;
    }
  }

  async exists(
    modelName: string,
    id: unknown,
    options?: Record<string, unknown>,
  ): Promise<boolean> {
    const result = await this.find(modelName, id, options);
    return result !== null;
  }

  // ---- Direct execution ----

  private static readonly SAFE_COMMANDS = new Set([
    'find', 'findOne', 'insertOne', 'insertMany',
    'updateOne', 'updateMany', 'replaceOne',
    'deleteOne', 'deleteMany',
    'aggregate', 'countDocuments', 'estimatedDocumentCount',
    'distinct', 'findOneAndUpdate', 'findOneAndReplace',
    'findOneAndDelete', 'bulkWrite',
    'createIndex', 'createIndexes', 'dropIndex', 'dropIndexes',
    'listIndexes', 'indexExists', 'indexes',
    'watch', 'isCapped', 'stats',
  ]);

  async execute(
    modelName: string,
    command: string,
    ...args: unknown[]
  ): Promise<unknown> {
    if (!MongoConnector.SAFE_COMMANDS.has(command)) {
      throw new Error(
        `Command "${command}" is not in the allowlist. ` +
        'Use getClient() for unrestricted access.',
      );
    }

    const db = await this.ensureConnected();
    const collection = this.collectionForModel(modelName, db);

    const method = collection[command as keyof Collection];
    if (typeof method !== 'function') {
      throw new Error(
        `Unknown MongoDB collection command: ${command}`,
      );
    }

    debug('execute [%s].%s', modelName, command);
    return (method as (...a: unknown[]) => unknown).apply(
      collection,
      args,
    );
  }

  // ---- Transactions ----

  async beginTransaction(
    options?: TransactionOptions,
  ): Promise<ClientSession> {
    const client = await this.ensureClient();
    const session = client.startSession();
    session.startTransaction(options);
    debug('transaction started');
    return session;
  }

  async commit(session: ClientSession): Promise<void> {
    await session.commitTransaction();
    await session.endSession();
    debug('transaction committed');
  }

  async rollback(session: ClientSession): Promise<void> {
    await session.abortTransaction();
    await session.endSession();
    debug('transaction rolled back');
  }

  // ---- Helpers ----

  /**
   * Get the native MongoClient instance.
   */
  getClient(): MongoClient | undefined {
    return this.client;
  }

  /**
   * Get the native Db instance.
   */
  getDb(): Db | undefined {
    return this.db;
  }

  /**
   * Get a collection for a model.
   */
  collectionForModel(modelName: string, db?: Db): Collection {
    const d = db ?? this.db;
    if (!d) throw new Error('Not connected');

    const modelDef = this._models[modelName];
    const mongoSettings = modelDef?.settings?.mongodb as
      | {collection?: string; table?: string}
      | undefined;
    const collectionName =
      mongoSettings?.collection ?? mongoSettings?.table ?? modelName;

    return d.collection(collectionName);
  }

  private async ensureConnected(): Promise<Db> {
    if (!this.db) {
      await this.connect();
    }
    if (!this.db) throw new Error('Failed to establish connection');
    return this.db;
  }

  private async ensureClient(): Promise<MongoClient> {
    if (!this.client) {
      await this.connect();
    }
    if (!this.client) throw new Error('Failed to establish connection');
    return this.client;
  }

  private buildConnectionUrl(): string {
    if (this.settings.url) return this.settings.url;

    const host = this.settings.host ?? 'localhost';
    const port = this.settings.port ?? 27017;
    const database = this.settings.database ?? 'test';

    let auth = '';
    if (this.settings.username && this.settings.password) {
      const user = encodeURIComponent(this.settings.username);
      const pass = encodeURIComponent(this.settings.password);
      auth = `${user}:${pass}@`;
    }

    let params = '';
    if (this.settings.authSource) {
      params = `?authSource=${this.settings.authSource}`;
    }
    if (this.settings.replicaSet) {
      const sep = params ? '&' : '?';
      params += `${sep}replicaSet=${this.settings.replicaSet}`;
    }

    return `mongodb://${auth}${host}:${port}/${database}${params}`;
  }

  private extractDatabaseFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;
      return path.startsWith('/') ? path.slice(1) : path || 'test';
    } catch {
      return 'test';
    }
  }

  private buildUpdate(
    modelName: string,
    data: Record<string, unknown>,
  ): Document {
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const setData = {...data};
    delete setData[idName];
    delete setData._id;

    const dbData = toDatabase(modelDef, setData);

    // If allowExtendedOperators and data contains $ operators, use as-is
    if (this.settings.allowExtendedOperators) {
      const hasOperators = Object.keys(dbData).some(k =>
        k.startsWith('$'),
      );
      if (hasOperators) return dbData;
    }

    return {$set: dbData};
  }

  private fromDb(
    modelName: string,
    doc: Document,
  ): Record<string, unknown> {
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const data = fromDatabase(modelDef, doc);

    // Map _id back to idName
    if (data._id !== undefined && idName !== '_id') {
      data[idName] = data._id;
      delete data._id;
    }

    return data;
  }

  private extractSessionOptions(
    options?: Record<string, unknown>,
  ): {session?: ClientSession} {
    if (!options?.transaction) return {};
    return {session: options.transaction as ClientSession};
  }
}

/**
 * Initialize function for loopback-datasource-juggler.
 * This is the entry point that the juggler calls to create
 * a connector instance.
 */
export function initialize(
  dataSource: Record<string, unknown>,
  callback?: Callback,
): void {
  const settings =
    (dataSource.settings as MongoConnectorConfig) ?? {};
  const connector = new MongoConnector(settings);
  connector.dataSource = dataSource;
  dataSource.connector = connector;
  (dataSource as Record<string, unknown>).ObjectID = ObjectId;

  if (callback) {
    if (settings.lazyConnect) {
      process.nextTick(() => callback(null));
    } else {
      connector
        .connect()
        .then(() => callback(null))
        .catch(err => callback(err));
    }
  }
}
