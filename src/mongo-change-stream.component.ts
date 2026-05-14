import {Binding, BindingScope, type Component} from '@loopback/core';
import {TransportBindings} from '@ebarahona/loopback-transport-core';
import {ChangeStreamDiscoverer} from './discovery';
import {MongoChangeStreamServer} from './servers';
import {MongoBindings} from './keys';

/**
 * Registers MongoDB change streams as a transport-core transport.
 *
 * Bind alongside `MongoComponent` and `TransportComponent`:
 *
 * ```typescript
 * app.component(MongoComponent);
 * app.component(MongoChangeStreamComponent);
 * app.component(TransportComponent);
 * ```
 *
 * Once bound, any `@changeStream`-decorated controller method receives
 * matching change events at runtime. The `mongodb` lifecycle group
 * (which opens the shared MongoClient) starts before the `transport`
 * group (which calls `listen()` on every transport server), so the
 * driver is always connected by the time this server opens its
 * underlying `ChangeStream` instances.
 *
 * @experimental
 */
export class MongoChangeStreamComponent implements Component {
  readonly bindings: Binding<unknown>[] = [
    Binding.bind('mongo.change-stream.discoverer')
      .toClass(ChangeStreamDiscoverer)
      .tag(TransportBindings.tags.HANDLER_DISCOVERER)
      .inScope(BindingScope.SINGLETON),
    Binding.bind(MongoBindings.CHANGE_STREAM_SERVER)
      .toClass(MongoChangeStreamServer)
      .tag(TransportBindings.tags.SERVER)
      .tag({[TransportBindings.tags.NAME]: 'mongo-change-stream'})
      .inScope(BindingScope.SINGLETON),
  ];
}
