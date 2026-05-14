import type {Db} from 'mongodb';
import {MongoClient} from 'mongodb';
import debugFactory from 'debug';
import type {MongoConnectorConfig} from '../types';
import {buildConnectionUrl} from './url-builder';
import {validateConfig, redactUrl} from './config-validator';
import type {TopologyInfo} from './topology';
import {detectTopology} from './topology';

const debug = debugFactory('loopback:connector:mongodb:connection');

type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting';

/**
 * Thrown when an operation against the connection manager is invalid
 * for its current state (no client connected, manager disposed, etc.).
 *
 * @public
 */
export class MongoConnectionError extends Error {
  override readonly name = 'MongoConnectionError';
  constructor(message: string) {
    super(message);
  }
}

/**
 * Centralized connection manager for the MongoDB client.
 *
 * Owns one MongoClient singleton. Both the juggler connector and
 * MongoService use the same manager, guaranteeing one connection
 * pool, one lifecycle, and one topology state.
 *
 * - `connect()` is idempotent and concurrency-safe.
 * - `disconnect()` is idempotent and coordinates with in-flight connects.
 * - Repeated start/stop cycles are safe (test restarts, hot reload).
 * - A generation counter prevents stale connect from overriding disconnect.
 *
 * @public
 */
export class MongoConnectionManager {
  private client?: MongoClient;
  private db?: Db;
  private state: ConnectionState = 'disconnected';
  private connectPromise?: Promise<void>;
  private disconnectPromise?: Promise<void>;
  private topologyInfo?: TopologyInfo;
  private generation = 0;

  constructor(private readonly config: MongoConnectorConfig) {}

  /**
   * Connect to MongoDB. Idempotent and concurrency-safe.
   * Concurrent calls share the same connection promise.
   * If disconnect is in progress, awaits the real disconnect
   * promise (no spin wait, no timeout) before starting connect.
   */
  async connect(): Promise<void> {
    if (this.isConnected()) return;

    if (this.disconnectPromise) {
      try {
        await this.disconnectPromise;
      } catch {
        // disconnect failed; proceed with a fresh connect
      }
    }
    if (this.isConnected()) return;

    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }

    const gen = this.generation;
    this.state = 'connecting';
    this.connectPromise = this.doConnect(gen).finally(() => {
      this.connectPromise = undefined;
    });

    try {
      await this.connectPromise;
    } catch (err) {
      if (this.generation === gen) {
        this.state = 'disconnected';
      }
      throw err;
    }
  }

  /**
   * Disconnect from MongoDB. Idempotent and concurrency-safe.
   * Concurrent calls share the same disconnect promise.
   * Waits for any in-flight connect to settle before closing.
   * Uses generation counter to prevent stale connect from
   * overriding this disconnect.
   */
  async disconnect(): Promise<void> {
    if (this.disconnectPromise) {
      await this.disconnectPromise;
      return;
    }
    if (this.state === 'disconnected' && !this.client && !this.connectPromise) {
      return;
    }

    this.generation++;
    this.state = 'disconnecting';

    this.disconnectPromise = this.doDisconnect().finally(() => {
      this.disconnectPromise = undefined;
    });
    await this.disconnectPromise;
  }

  private async doDisconnect(): Promise<void> {
    if (this.connectPromise) {
      try {
        await this.connectPromise;
      } catch {
        // connect failed; proceed with disconnect
      }
    }

    if (this.client) {
      try {
        await this.client.close();
      } catch (err) {
        debug('disconnect error: %O', err);
      }
    }
    this.client = undefined;
    this.db = undefined;
    this.topologyInfo = undefined;
    this.state = 'disconnected';
    debug('disconnected');
  }

  /**
   * Get the connected MongoClient. Throws if not connected.
   */
  getClient(): MongoClient {
    if (!this.client || this.state !== 'connected') {
      throw new MongoConnectionError('MongoClient is not connected');
    }
    return this.client;
  }

  /**
   * Get the default Db instance. Throws if not connected.
   */
  getDb(name?: string): Db {
    if (!this.client || this.state !== 'connected') {
      throw new MongoConnectionError('MongoClient is not connected');
    }
    if (name) return this.client.db(name);
    if (!this.db) {
      throw new MongoConnectionError('MongoClient is not connected');
    }
    return this.db;
  }

  /**
   * Get topology info. Best-effort detection using driver internals.
   * Returns unknown topology if not connected.
   */
  getTopology(): TopologyInfo {
    if (!this.client) {
      return {isReplicaSet: false, topologyType: 'Unknown'};
    }
    return detectTopology(this.client);
  }

  /**
   * Whether the client is connected.
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Ping the server. Throws if not connected or server unreachable.
   */
  async ping(): Promise<void> {
    const db = this.getDb();
    await db.command({ping: 1});
  }

  private async doConnect(gen: number): Promise<void> {
    validateConfig(this.config);
    const url = buildConnectionUrl(this.config);
    debug('connecting to %s', redactUrl(url));

    const client = new MongoClient(url, this.config.clientOptions);

    try {
      await client.connect();
    } catch (err) {
      await client.close().catch(() => {});
      throw err;
    }

    // Check generation: if disconnect happened during connect, don't
    // set connected state -- close the client we just opened
    if (this.generation !== gen) {
      await client.close().catch(() => {});
      throw new MongoConnectionError('Connection cancelled by disconnect');
    }

    this.client = client;
    const dbName = this.config.database ?? this.extractDatabaseFromUrl(url);
    this.db = client.db(dbName);
    this.topologyInfo = detectTopology(client);
    this.state = 'connected';

    debug(
      'connected to database [%s] (topology: %s)',
      dbName,
      this.topologyInfo.topologyType,
    );
  }

  private extractDatabaseFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;
      return path.startsWith('/') ? path.slice(1) || 'test' : 'test';
    } catch {
      return 'test';
    }
  }
}
