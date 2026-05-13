import {MongoClient, Db} from 'mongodb';
import debugFactory from 'debug';
import {MongoConnectorConfig} from '../types';
import {buildConnectionUrl} from './url-builder';
import {detectTopology, TopologyInfo} from './topology';

const debug = debugFactory('loopback:connector:mongodb:connection');

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * Centralized connection manager for the MongoDB client.
 *
 * Owns one MongoClient singleton. Both the juggler connector and
 * MongoService use the same manager, guaranteeing one connection
 * pool, one lifecycle, and one topology state.
 *
 * - `connect()` is idempotent and concurrency-safe.
 * - `disconnect()` is idempotent.
 * - Repeated start/stop cycles are safe (test restarts, hot reload).
 */
export class MongoConnectionManager {
  private client?: MongoClient;
  private db?: Db;
  private state: ConnectionState = 'disconnected';
  private connectPromise?: Promise<void>;
  private topologyInfo?: TopologyInfo;

  constructor(private readonly config: MongoConnectorConfig) {}

  /**
   * Connect to MongoDB. Idempotent and concurrency-safe.
   * Concurrent calls share the same connection promise.
   */
  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }

    this.state = 'connecting';
    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = undefined;
    });

    try {
      await this.connectPromise;
    } catch (err) {
      this.state = 'disconnected';
      throw err;
    }
  }

  /**
   * Disconnect from MongoDB. Idempotent.
   */
  async disconnect(): Promise<void> {
    if (this.state === 'disconnected' && !this.client) return;

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
    if (!this.client) {
      throw new Error('MongoClient is not connected');
    }
    return this.client;
  }

  /**
   * Get the default Db instance. Throws if not connected.
   */
  getDb(name?: string): Db {
    if (!this.client) {
      throw new Error('MongoClient is not connected');
    }
    if (name) return this.client.db(name);
    if (!this.db) {
      throw new Error('MongoClient is not connected');
    }
    return this.db;
  }

  /**
   * Get topology info. Returns undefined if not connected.
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

  private async doConnect(): Promise<void> {
    const url = buildConnectionUrl(this.config);
    debug(
      'connecting to %s',
      url.replace(/\/\/[^@]*@/, '//<credentials>@'),
    );

    this.client = new MongoClient(url, this.config.clientOptions);

    try {
      await this.client.connect();
    } catch (err) {
      // Clean up partially initialized client
      await this.client.close().catch(() => {});
      this.client = undefined;
      throw err;
    }

    const dbName =
      this.config.database ?? this.extractDatabaseFromUrl(url);
    this.db = this.client.db(dbName);
    this.topologyInfo = detectTopology(this.client);
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
