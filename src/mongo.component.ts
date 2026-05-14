import {
  Binding,
  BindingScope,
  Component,
  Constructor,
  LifeCycleObserver,
  inject,
  lifeCycleObserver,
} from '@loopback/core';
import debugFactory from 'debug';
import {MongoBindings} from './keys';
import {MongoConnectionManager} from './helpers/connection-manager';
import {MongoDataSourceProvider} from './datasource/mongo.datasource.provider';
import {MongoDataSourceFactoryProvider} from './datasource/mongo.datasource.factory';
import {MongoServiceImpl} from './services/mongo.service.impl';
import type {MongoService} from './services/mongo.service';
import {MongoConnectorConfig} from './types';

const debug = debugFactory('loopback:connector:mongodb:lifecycle');

/**
 * Provider that creates a singleton MongoConnectionManager.
 */
class ConnectionManagerProvider {
  constructor(
    @inject(MongoBindings.CONFIG, {optional: true})
    private config?: MongoConnectorConfig,
  ) {}

  value(): MongoConnectionManager {
    return new MongoConnectionManager(this.config ?? {});
  }
}

/**
 * Lifecycle observer that connects and disconnects the shared
 * MongoConnectionManager.
 *
 * On stop, also closes any change streams opened through the
 * `MongoService` (if bound) before disconnecting the client, to
 * prevent server-side cursor leaks on app shutdown.
 *
 * Idempotent: repeated start/stop cycles are safe.
 *
 * @public
 */
@lifeCycleObserver('mongodb')
export class MongoLifecycleObserver implements LifeCycleObserver {
  constructor(
    @inject(MongoBindings.CONNECTION_MANAGER)
    private manager: MongoConnectionManager,
    @inject(MongoBindings.SERVICE, {optional: true})
    private service?: MongoService,
  ) {}

  async start(): Promise<void> {
    await this.manager.connect();
    debug('MongoClient connected');
  }

  async stop(): Promise<void> {
    if (this.service) {
      try {
        await this.service.closeAll();
      } catch (err) {
        debug('closeAll failed during shutdown: %O', err);
      }
    }
    await this.manager.disconnect();
    debug('MongoClient disconnected');
  }
}

/**
 * LoopBack 4 component that provides MongoDB connectivity.
 *
 * Registers:
 * - MongoBindings.CONNECTION_MANAGER -- shared MongoConnectionManager
 *   singleton; owns the MongoClient and its lifecycle.
 * - MongoBindings.SERVICE -- MongoService singleton for advanced
 *   native operations (aggregation, Change Streams, GridFS, ...).
 * - MongoBindings.DATASOURCE -- juggler DataSource singleton wired
 *   to the shared manager, for repository-based code paths.
 * - MongoBindings.DATASOURCE_FACTORY -- factory for per-tenant
 *   or per-database DataSource instances on the shared pool.
 * - MongoLifecycleObserver -- connects on start, disconnects on stop.
 *
 * The juggler DataSource, the repositories built on it, and the
 * MongoService all share one MongoConnectionManager, guaranteeing
 * one connection pool, one lifecycle, and one topology state.
 *
 * Usage:
 * ```typescript
 * const app = new Application();
 * app.bind(MongoBindings.CONFIG).to({
 *   url: 'mongodb://localhost:27017',
 *   database: 'mydb',
 * });
 * app.component(MongoComponent);
 *
 * const ds = await app.get(MongoBindings.DATASOURCE);
 * const service = await app.get(MongoBindings.SERVICE);
 * ```
 *
 * @public
 */
export class MongoComponent implements Component {
  readonly bindings: Binding<unknown>[] = [
    Binding.bind(MongoBindings.CONNECTION_MANAGER)
      .toProvider(ConnectionManagerProvider)
      .inScope(BindingScope.SINGLETON),
    Binding.bind(MongoBindings.SERVICE)
      .toClass(MongoServiceImpl)
      .inScope(BindingScope.SINGLETON),
    Binding.bind(MongoBindings.DATASOURCE)
      .toProvider(MongoDataSourceProvider)
      .inScope(BindingScope.SINGLETON),
    Binding.bind(MongoBindings.DATASOURCE_FACTORY)
      .toProvider(MongoDataSourceFactoryProvider)
      .inScope(BindingScope.SINGLETON),
  ];

  readonly lifeCycleObservers: Constructor<LifeCycleObserver>[] = [
    MongoLifecycleObserver,
  ];
}
