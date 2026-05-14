import type {
  MongoClient,
  Db,
  Collection,
  Document,
  ClientSession,
  TransactionOptions,
} from 'mongodb';
import {ObjectId} from 'mongodb';
import debugFactory from 'debug';
import type {MongoConnectorConfig} from '../types';
import {coerceId} from './coercion';
import {buildWhere, buildSort, buildFields} from './query-builder';
import type {ModelDefinition} from './property-mapping';
import {toDatabase, fromDatabase, getIdPropertyName} from './property-mapping';
import {MongoConnectionManager} from '../helpers/connection-manager';

const debug = debugFactory('loopback:connector:mongodb');

/**
 * Methods that loopback-datasource-juggler 6.x invokes via its
 * callback-based DAO bridge (`invokeConnectorMethod`). Modern code
 * uses these as promise-returning methods directly; this list only
 * exists so the constructor can install per-instance shims that
 * also fire a trailing Node-style callback when one is supplied
 * positionally by the juggler runtime.
 */
const JUGGLER_BRIDGED_METHODS = [
  'create',
  'find',
  'all',
  'updateAll',
  'deleteAll',
  'count',
  'replaceById',
  'updateOrCreate',
  'findOrCreate',
  'exists',
  'update',
  'destroyAll',
  'updateAttributes',
  'save',
] as const;

/**
 * MongoDB connector for LoopBack 4.
 *
 * Implements the loopback-connector Connector interface using the
 * native MongoDB Node.js driver 6.x.
 *
 * Uses a shared MongoConnectionManager for connection lifecycle.
 * When used via MongoComponent, the same manager is shared with
 * MongoService. When used standalone via juggler DataSource, the
 * connector creates its own manager.
 */
export class MongoConnector {
  name = 'mongodb';
  settings: MongoConnectorConfig;
  dataSource?: Record<string, unknown>;

  private connectionManager: MongoConnectionManager;
  private readonly ownsConnectionManager: boolean;
  private _models: Record<string, ModelDefinition> = {};

  /**
   * @param settings - Connector configuration
   * @param connectionManager - Optional shared connection manager.
   *   When provided (e.g. by MongoComponent), the connector uses
   *   the shared MongoClient and does NOT own disconnect.
   *   When omitted (standalone juggler use), the connector creates
   *   and owns its own manager.
   */
  constructor(
    settings: MongoConnectorConfig,
    connectionManager?: MongoConnectionManager,
  ) {
    this.settings = {
      allowExtendedOperators: true,
      strictObjectIDCoercion: false,
      ...settings,
    };
    if (connectionManager) {
      this.connectionManager = connectionManager;
      this.ownsConnectionManager = false;
    } else {
      this.connectionManager = new MongoConnectionManager(this.settings);
      this.ownsConnectionManager = true;
    }
    this.installJugglerBridge();
  }

  /**
   * Install per-instance shims for the juggler 6.x DAO bridge.
   *
   * Juggler 6.x's `invokeConnectorMethod` invokes connector methods
   * with `connector[method](modelName, ...args, opts?, cb)`, ignores
   * any returned promise, and waits for `cb(err, result)` to fire.
   * The class methods themselves stay strictly promise-returning;
   * the shim simply extracts a trailing callback (if present) and
   * relays settlement to it without altering the call's promise
   * return value.
   *
   * This is the only place in the connector that inspects an
   * argument to see if it's a function.
   */
  private installJugglerBridge(): void {
    type AnyFn = (...a: unknown[]) => Promise<unknown>;
    type CbFn = (err: Error | null, result?: unknown) => void;
    for (const name of JUGGLER_BRIDGED_METHODS) {
      const original = (this as unknown as Record<string, AnyFn>)[name];
      if (typeof original !== 'function') continue;
      const bound = original.bind(this);
      // Five positional parameters so `Function.length === 5`. Juggler
      // 6.x's `invokeConnectorMethod` uses `connector[method].length`
      // to decide whether to pass `options` before the callback; any
      // bridged method must report length >= argCount + 3 across all
      // call sites (max argCount is 2 -> needs length >= 5).
      function bridged(
        _a?: unknown,
        _b?: unknown,
        _c?: unknown,
        _d?: unknown,
        _e?: unknown,
      ): Promise<unknown> {
        const args = Array.from(arguments) as unknown[];
        let cb: CbFn | undefined;
        if (args.length > 0 && typeof args[args.length - 1] === 'function') {
          cb = args.pop() as CbFn;
        }
        const promise = bound(...args);
        if (cb) {
          promise.then(
            result => cb!(null, result),
            err => cb!(err),
          );
        }
        return promise;
      }
      Object.defineProperty(this, name, {
        value: bridged,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
  }

  // ---- Connection lifecycle ----

  /**
   * Connect to MongoDB. Delegates to the connection manager.
   * Idempotent and concurrency-safe.
   */
  async connect(): Promise<Db> {
    await this.connectionManager.connect();
    return this.connectionManager.getDb();
  }

  /**
   * Disconnect from MongoDB.
   *
   * Only disconnects if this connector owns its connection manager
   * (standalone juggler DataSource use). When the manager is shared
   * via MongoComponent, the lifecycle observer owns disconnect --
   * calling this is a no-op.
   */
  async disconnect(): Promise<void> {
    if (!this.ownsConnectionManager) {
      debug('disconnect skipped (shared connection manager)');
      return;
    }
    await this.connectionManager.disconnect();
  }

  async ping(): Promise<void> {
    await this.connectionManager.ping();
  }

  /**
   * Get the shared connection manager.
   */
  getConnectionManager(): MongoConnectionManager {
    return this.connectionManager;
  }

  /**
   * Get the native MongoClient instance.
   */
  getClient(): MongoClient | undefined {
    try {
      return this.connectionManager.getClient();
    } catch {
      return undefined;
    }
  }

  /**
   * Get the native Db instance.
   */
  getDb(): Db | undefined {
    try {
      return this.connectionManager.getDb();
    } catch {
      return undefined;
    }
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
    const collection = await this.getCollection(modelName);
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
    const collection = await this.getCollection(modelName);
    const modelDef = this._models[modelName];

    const coercedId = coerceId(
      id,
      modelDef?.properties[getIdPropertyName(modelDef)],
      this.settings.strictObjectIDCoercion,
    );
    const sessionOpts = this.extractSessionOptions(options);

    const idFilter: Document = {_id: coercedId};
    const doc = await collection.findOne(idFilter, sessionOpts);

    if (!doc) return null;
    return this.fromDb(modelName, doc);
  }

  async all(
    modelName: string,
    filter?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const collection = await this.getCollection(modelName);
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
      filter?.fields as string[] | Record<string, boolean> | undefined,
      idName,
    );

    const sessionOpts = this.extractSessionOptions(options);
    const findOptions: Record<string, unknown> = {...sessionOpts};
    if (projection) findOptions.projection = projection;

    let cursor = collection.find(where, findOptions);
    if (sort) cursor = cursor.sort(sort);
    if (filter?.limit) cursor = cursor.limit(filter.limit as number);
    if (filter?.skip) cursor = cursor.skip(filter.skip as number);
    else if (filter?.offset) cursor = cursor.skip(filter.offset as number);

    const docs = await cursor.toArray();
    return docs.map(doc => this.fromDb(modelName, doc));
  }

  async updateAll(
    modelName: string,
    where: Record<string, unknown> | undefined,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{count: number}> {
    const collection = await this.getCollection(modelName);
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const query = buildWhere(where, idName);
    const update = this.buildUpdate(modelName, data);
    const sessionOpts = this.extractSessionOptions(options);

    const result = await collection.updateMany(query, update, sessionOpts);

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
    const collection = await this.getCollection(modelName);
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
    const collection = await this.getCollection(modelName);
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
    const collection = await this.getCollection(modelName);
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

    const idFilter: Document = {_id: coercedId};
    const result = await collection.replaceOne(idFilter, dbDoc, sessionOpts);

    return {count: result.modifiedCount};
  }

  async updateOrCreate(
    modelName: string,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const collection = await this.getCollection(modelName);
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

    const idFilter: Document = {_id: coercedId};
    const result = await collection.findOneAndReplace(idFilter, dbDoc, {
      upsert: true,
      returnDocument: 'after',
      ...sessionOpts,
    });

    return result ? this.fromDb(modelName, result) : data;
  }

  async findOrCreate(
    modelName: string,
    filter: Record<string, unknown>,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<[Record<string, unknown>, boolean]> {
    try {
      const id = await this.create(modelName, data, options);
      const modelDef = this._models[modelName];
      const idName = getIdPropertyName(modelDef);
      return [{...data, [idName]: id}, true];
    } catch (err) {
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

  // ---- Juggler-compatible aliases ----
  // The juggler DataAccessObject expects specific method names
  // that differ from our public API.

  /**
   * Juggler alias for updateAll.
   */
  async update(
    modelName: string,
    where: Record<string, unknown> | undefined,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{count: number}> {
    return this.updateAll(modelName, where, data, options);
  }

  /**
   * Juggler alias for deleteAll.
   */
  async destroyAll(
    modelName: string,
    where: Record<string, unknown> | undefined,
    options?: Record<string, unknown>,
  ): Promise<{count: number}> {
    return this.deleteAll(modelName, where, options);
  }

  /**
   * Juggler: update specific attributes on a single document by id.
   */
  async updateAttributes(
    modelName: string,
    id: unknown,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    await this.updateAll(modelName, {[idName]: id}, data, options);

    const updated = await this.find(modelName, id, options);
    if (!updated) {
      throw new Error(
        `Document not found after updateAttributes: ${modelName}/${String(id)}`,
      );
    }
    return updated;
  }

  /**
   * Juggler: save (upsert) a document.
   */
  async save(
    modelName: string,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.updateOrCreate(modelName, data, options);
  }

  // ---- Direct execution ----

  private static readonly SAFE_COMMANDS = new Set([
    'find',
    'findOne',
    'insertOne',
    'insertMany',
    'updateOne',
    'updateMany',
    'replaceOne',
    'deleteOne',
    'deleteMany',
    'aggregate',
    'countDocuments',
    'estimatedDocumentCount',
    'distinct',
    'findOneAndUpdate',
    'findOneAndReplace',
    'findOneAndDelete',
    'bulkWrite',
    'createIndex',
    'createIndexes',
    'dropIndex',
    'dropIndexes',
    'listIndexes',
    'indexExists',
    'indexes',
    'watch',
    'isCapped',
    'stats',
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

    const collection = await this.getCollection(modelName);

    const method = collection[command as keyof Collection];
    if (typeof method !== 'function') {
      throw new Error(`Unknown MongoDB collection command: ${command}`);
    }

    debug('execute [%s].%s', modelName, command);
    return (method as (...a: unknown[]) => unknown).apply(collection, args);
  }

  // ---- Transactions ----

  async beginTransaction(options?: TransactionOptions): Promise<ClientSession> {
    if (!this.connectionManager.isConnected()) {
      await this.connectionManager.connect();
    }
    const client = this.connectionManager.getClient();
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

  // ---- Internal helpers ----

  collectionForModel(modelName: string): Collection {
    // Routes to the connector's configured database. For shared-
    // manager use, this lets multiple MongoDataSource instances
    // target different databases on one MongoClient pool.
    const db = this.connectionManager.getDb(this.settings.database);
    const modelDef = this._models[modelName];
    const mongoSettings = modelDef?.settings?.mongodb as
      | {collection?: string; table?: string}
      | undefined;
    const collectionName =
      mongoSettings?.collection ?? mongoSettings?.table ?? modelName;

    return db.collection(collectionName);
  }

  private async getCollection(modelName: string): Promise<Collection> {
    if (!this.connectionManager.isConnected()) {
      await this.connectionManager.connect();
    }
    return this.collectionForModel(modelName);
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

    if (this.settings.allowExtendedOperators) {
      const hasOperators = Object.keys(dbData).some(k => k.startsWith('$'));
      if (hasOperators) return dbData;
    }

    return {$set: dbData};
  }

  private fromDb(modelName: string, doc: Document): Record<string, unknown> {
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const data = fromDatabase(modelDef, doc);

    if (data._id !== undefined && idName !== '_id') {
      data[idName] = data._id;
      delete data._id;
    }

    return data;
  }

  private extractSessionOptions(options?: Record<string, unknown>): {
    session?: ClientSession;
  } {
    if (!options?.transaction) return {};
    return {session: options.transaction as ClientSession};
  }
}

/**
 * Initialize function for loopback-datasource-juggler.
 * Creates a standalone connector with its own connection manager.
 *
 * Juggler invokes this with `(dataSource, callback)` and expects
 * the callback to signal "setup done." This is the one place the
 * connector still exposes a callback contract.
 */
type InitializeCallback = (err: Error | null) => void;

export function initialize(
  dataSource: Record<string, unknown>,
  callback?: InitializeCallback,
): void {
  const settings = (dataSource.settings as MongoConnectorConfig) ?? {};
  const connector = new MongoConnector(settings);
  connector.dataSource = dataSource;
  dataSource.connector = connector;
  (dataSource as Record<string, unknown>).ObjectID = ObjectId;

  if (callback) {
    if (settings.lazyConnect) {
      process.nextTick(() => callback(null));
    } else {
      connector.connect().then(
        () => callback(null),
        (err: Error) => callback(err),
      );
    }
  }
}
