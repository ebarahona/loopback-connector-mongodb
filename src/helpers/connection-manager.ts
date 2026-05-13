import {MongoClient, Db} from 'mongodb';
import debugFactory from 'debug';
import {MongoConnectorConfig} from '../types';
import {buildConnectionUrl} from './url-builder';
import {detectTopology, TopologyInfo} from './topology';

const debug = debugFactory('loopback:connector:mongodb:connection');

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

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
 */
export class MongoConnectionManager {
  private client?: MongoClient;
  private db?: Db;
  private state: ConnectionState = 'disconnected';
  private connectPromise?: Promise<void>;
  private topologyInfo?: TopologyInfo;
  private generation = 0;

  constructor(private readonly config: MongoConnectorConfig) {}

  /**
   * Connect to MongoDB. Idempotent and concurrency-safe.
   * Concurrent calls share the same connection promise.
   * If disconnect is in progress, waits for it then connects.
   */
  async connect(): Promise<void> {
    if (this.isConnected()) return;
    if (this.state === 'disconnecting') {
      await this.waitForDisconnect();
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
   * Disconnect from MongoDB. Idempotent.
   * Waits for any in-flight connect to settle before closing.
   * Uses generation counter to prevent stale connect from
   * overriding this disconnect.
   */
  async disconnect(): Promise<void> {
    if (this.state === 'disconnected' && !this.client && !this.connectPromise) {
      return;
    }

    this.generation++;
    this.state = 'disconnecting';

    // Wait for in-flight connect to settle
    if (this.connectPromise) {
      try {
        await this.connectPromise;
      } catch {
        // connect failed, proceed with disconnect
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
      throw new Error('MongoClient is not connected');
    }
    return this.client;
  }

  /**
   * Get the default Db instance. Throws if not connected.
   */
  getDb(name?: string): Db {
    if (!this.client || this.state !== 'connected') {
      throw new Error('MongoClient is not connected');
    }
    if (name) return this.client.db(name);
    if (!this.db) {
      throw new Error('MongoClient is not connected');
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
    const url = buildConnectionUrl(this.config);
    debug(
      'connecting to %s',
      url.replace(/\/\/[^@]*@/, '//<credentials>@'),
    );

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
      throw new Error('Connection cancelled by disconnect');
    }

    this.client = client;
    const dbName =
      this.config.database ?? this.extractDatabaseFromUrl(url);
    this.db = client.db(dbName);
    this.topologyInfo = detectTopology(client);
    this.state = 'connected';

    debug(
      'connected to database [%s] (topology: %s)',
      dbName,
      this.topologyInfo.topologyType,
    );
  }

  private async waitForDisconnect(): Promise<void> {
    // Spin-wait is not ideal, but disconnect is fast
    // and this only happens in edge cases (shutdown during startup)
    let attempts = 0;
    while (this.state === 'disconnecting' && attempts < 50) {
      await new Promise(r => setTimeout(r, 10));
      attempts++;
    }
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
