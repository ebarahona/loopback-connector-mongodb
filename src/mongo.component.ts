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
import {MongoServiceImpl} from './services/mongo.service.impl';
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
 * Idempotent: repeated start/stop cycles are safe.
 */
@lifeCycleObserver('mongodb')
export class MongoLifecycleObserver implements LifeCycleObserver {
  constructor(
    @inject(MongoBindings.CONNECTION_MANAGER)
    private manager: MongoConnectionManager,
  ) {}

  async start(): Promise<void> {
    await this.manager.connect();
    debug('MongoClient connected');
  }

  async stop(): Promise<void> {
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
  ];

  readonly lifeCycleObservers: Constructor<LifeCycleObserver>[] = [
    MongoLifecycleObserver,
  ];
}
