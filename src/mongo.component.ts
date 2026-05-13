import {
  Binding,
  BindingScope,
  Component,
  Constructor,
  LifeCycleObserver,
  inject,
  lifeCycleObserver,
} from '@loopback/core';
import {MongoClient} from 'mongodb';
import debugFactory from 'debug';
import {MongoBindings} from './keys';
import {MongoClientProvider} from './providers/mongo-client.provider';
import {MongoServiceImpl} from './services/mongo.service.impl';

const debug = debugFactory('loopback:connector:mongodb:lifecycle');

/**
 * Lifecycle observer that manages MongoClient connection and shutdown.
 */
@lifeCycleObserver('mongodb')
export class MongoLifecycleObserver implements LifeCycleObserver {
  constructor(
    @inject(MongoBindings.CLIENT)
    private client: MongoClient,
  ) {}

  async start(): Promise<void> {
    await this.client.connect();
    debug('MongoClient connected');
  }

  async stop(): Promise<void> {
    await this.client.close();
    debug('MongoClient disconnected');
  }
}

/**
 * LoopBack 4 component that provides MongoDB connectivity.
 *
 * Registers:
 * - MongoClient (singleton provider, shared across connector and service)
 * - MongoService (singleton, advanced native operations)
 * - MongoLifecycleObserver (connects on start, disconnects on stop)
 *
 * Usage:
 * ```typescript
 * const app = new Application();
 * app.bind(MongoBindings.CONFIG).to({
 *   url: 'mongodb://localhost:27017',
 *   database: 'mydb',
 * });
 * app.component(MongoComponent);
 * ```
 */
export class MongoComponent implements Component {
  readonly bindings: Binding<unknown>[] = [
    Binding.bind(MongoBindings.CLIENT)
      .toProvider(MongoClientProvider)
      .inScope(BindingScope.SINGLETON),
    Binding.bind(MongoBindings.SERVICE)
      .toClass(MongoServiceImpl)
      .inScope(BindingScope.SINGLETON),
  ];

  readonly lifeCycleObservers: Constructor<LifeCycleObserver>[] = [
    MongoLifecycleObserver,
  ];
}
