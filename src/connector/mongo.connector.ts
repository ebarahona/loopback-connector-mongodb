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
import {MongoConnectionManager} from '../helpers/connection-manager';

const debug = debugFactory('loopback:connector:mongodb');

type Callback = (err: Error | null, result?: unknown) => void;

/**
 * Wrap a promise-returning method to support juggler callbacks.
 * If the last argument is a function (callback), it's extracted
 * and invoked with (err, result) when the promise settles.
 */
function withCallback<T>(promise: Promise<T>, cb?: Callback): Promise<T> {
  if (cb) {
    promise.then(
      result => cb(null, result),
      err => cb(err),
    );
  }
  return promise;
}

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
  }

  // ---- Connection lifecycle ----

  /**
   * Connect to MongoDB. Delegates to the connection manager.
   * Idempotent and concurrency-safe.
   */
  connect(callback?: Callback): Promise<Db> | void {
    const promise = this.doConnect();
    return withCallback(promise, callback);
  }

  private async doConnect(): Promise<Db> {
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
  disconnect(callback?: Callback): Promise<void> | void {
    const promise = this.doDisconnect();
    return withCallback(promise, callback);
  }

  private async doDisconnect(): Promise<void> {
    if (!this.ownsConnectionManager) {
      debug('disconnect skipped (shared connection manager)');
      return;
    }
    await this.connectionManager.disconnect();
  }

  ping(callback?: Callback): Promise<void> | void {
    const promise = this.doPing();
    return withCallback(promise, callback);
  }

  private async doPing(): Promise<void> {
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
  // All CRUD methods support both async/await and juggler callback
  // patterns. When the last argument is a function, it's treated as
  // a callback: (err, result) => void.

  create(
    modelName: string,
    data: Record<string, unknown>,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<unknown> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doCreate(modelName, data, opts);
    return withCallback(promise, cb);
  }

  private async doCreate(
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

  find(
    modelName: string,
    id: unknown,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<Record<string, unknown> | null> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doFind(modelName, id, opts);
    return withCallback(promise, cb);
  }

  private async doFind(
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

    const doc = await collection.findOne(
      {_id: coercedId} as Document,
      sessionOpts,
    );

    if (!doc) return null;
    return this.fromDb(modelName, doc);
  }

  all(
    modelName: string,
    filter?: Record<string, unknown> | Callback,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<Record<string, unknown>[]> | void {
    let filterVal: Record<string, unknown> | undefined;
    let cb: Callback | undefined;
    let opts: Record<string, unknown> | undefined;

    if (typeof filter === 'function') {
      cb = filter;
      filterVal = undefined;
    } else {
      filterVal = filter;
      const parsed = this.parseOptionsCallback(options, callback);
      cb = parsed.cb;
      opts = parsed.opts;
    }

    const promise = this.doAll(modelName, filterVal, opts);
    return withCallback(promise, cb);
  }

  private async doAll(
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

  updateAll(
    modelName: string,
    where: Record<string, unknown> | undefined,
    data: Record<string, unknown>,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<{count: number}> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doUpdateAll(modelName, where, data, opts);
    return withCallback(promise, cb);
  }

  private async doUpdateAll(
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

  deleteAll(
    modelName: string,
    where: Record<string, unknown> | undefined,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<{count: number}> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doDeleteAll(modelName, where, opts);
    return withCallback(promise, cb);
  }

  private async doDeleteAll(
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

  count(
    modelName: string,
    where?: Record<string, unknown> | Callback,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<number> | void {
    let whereVal: Record<string, unknown> | undefined;
    let cb: Callback | undefined;
    let opts: Record<string, unknown> | undefined;

    if (typeof where === 'function') {
      cb = where;
      whereVal = undefined;
    } else {
      whereVal = where;
      const parsed = this.parseOptionsCallback(options, callback);
      cb = parsed.cb;
      opts = parsed.opts;
    }

    const promise = this.doCount(modelName, whereVal, opts);
    return withCallback(promise, cb);
  }

  private async doCount(
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

  replaceById(
    modelName: string,
    id: unknown,
    data: Record<string, unknown>,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<{count: number}> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doReplaceById(modelName, id, data, opts);
    return withCallback(promise, cb);
  }

  private async doReplaceById(
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

    const result = await collection.replaceOne(
      {_id: coercedId} as Document,
      dbDoc,
      sessionOpts,
    );

    return {count: result.modifiedCount};
  }

  updateOrCreate(
    modelName: string,
    data: Record<string, unknown>,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<Record<string, unknown>> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doUpdateOrCreate(modelName, data, opts);
    return withCallback(promise, cb);
  }

  private async doUpdateOrCreate(
    modelName: string,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const collection = await this.getCollection(modelName);
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    const id = data[idName];
    if (id === null || id === undefined) {
      const insertedId = await this.doCreate(modelName, data, options);
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

  findOrCreate(
    modelName: string,
    filter: Record<string, unknown>,
    data: Record<string, unknown>,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<[Record<string, unknown>, boolean]> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doFindOrCreate(modelName, filter, data, opts);
    return withCallback(promise, cb);
  }

  private async doFindOrCreate(
    modelName: string,
    filter: Record<string, unknown>,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<[Record<string, unknown>, boolean]> {
    try {
      const id = await this.doCreate(modelName, data, options);
      const modelDef = this._models[modelName];
      const idName = getIdPropertyName(modelDef);
      return [{...data, [idName]: id}, true];
    } catch (err) {
      if ((err as {code?: number}).code === 11000) {
        const existing = await this.doAll(modelName, filter, options);
        if (existing.length > 0) {
          return [existing[0], false];
        }
      }
      throw err;
    }
  }

  exists(
    modelName: string,
    id: unknown,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<boolean> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doExists(modelName, id, opts);
    return withCallback(promise, cb);
  }

  private async doExists(
    modelName: string,
    id: unknown,
    options?: Record<string, unknown>,
  ): Promise<boolean> {
    const result = await this.doFind(modelName, id, options);
    return result !== null;
  }

  // ---- Juggler-compatible aliases ----
  // The juggler DataAccessObject expects specific method names
  // that differ from our public API.

  /**
   * Juggler alias for updateAll.
   */
  update(
    modelName: string,
    where: Record<string, unknown> | undefined,
    data: Record<string, unknown>,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<{count: number}> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doUpdateAll(modelName, where, data, opts);
    return withCallback(promise, cb);
  }

  /**
   * Juggler alias for deleteAll.
   */
  destroyAll(
    modelName: string,
    where: Record<string, unknown> | undefined,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<{count: number}> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doDeleteAll(modelName, where, opts);
    return withCallback(promise, cb);
  }

  /**
   * Juggler: update specific attributes on a single document by id.
   */
  updateAttributes(
    modelName: string,
    id: unknown,
    data: Record<string, unknown>,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<Record<string, unknown>> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doUpdateAttributes(modelName, id, data, opts);
    return withCallback(promise, cb);
  }

  private async doUpdateAttributes(
    modelName: string,
    id: unknown,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const modelDef = this._models[modelName];
    const idName = getIdPropertyName(modelDef);

    await this.doUpdateAll(
      modelName,
      {[idName]: id},
      data,
      options,
    );

    const updated = await this.doFind(modelName, id, options);
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
  save(
    modelName: string,
    data: Record<string, unknown>,
    options?: Record<string, unknown> | Callback,
    callback?: Callback,
  ): Promise<Record<string, unknown>> | void {
    const {cb, opts} = this.parseOptionsCallback(options, callback);
    const promise = this.doSave(modelName, data, opts);
    return withCallback(promise, cb);
  }

  private async doSave(
    modelName: string,
    data: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.doUpdateOrCreate(modelName, data, options);
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

    const collection = await this.getCollection(modelName);

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
    const db = this.connectionManager.getDb();
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

    if (data._id !== undefined && idName !== '_id') {
      data[idName] = data._id;
      delete data._id;
    }

    return data;
  }

  /**
   * Parse options/callback from juggler-style arguments.
   * The juggler calls methods with either:
   *   (modelName, ...args, options, callback)
   *   (modelName, ...args, callback)
   * This detects which pattern is being used.
   */
  private parseOptionsCallback(
    optionsOrCb?: Record<string, unknown> | Callback,
    cb?: Callback,
  ): {opts?: Record<string, unknown>; cb?: Callback} {
    if (typeof optionsOrCb === 'function') {
      return {cb: optionsOrCb};
    }
    return {opts: optionsOrCb, cb};
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
 * Creates a standalone connector with its own connection manager.
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
      connector.connect(callback);
    }
  }
}
