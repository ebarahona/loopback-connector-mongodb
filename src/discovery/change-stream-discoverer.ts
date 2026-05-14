import {MetadataInspector, type Constructor} from '@loopback/core';
import {
  HANDLER_KIND_EVENT,
  type DiscoveredHandler,
  type HandlerDiscoverer,
} from '@ebarahona/loopback-transport-core';
import {
  CHANGE_STREAM_METADATA,
  type MongoChangeStreamHandlerOptions,
} from '../decorators/constants';

/**
 * Stable identifier for the discoverer, used in transport-core debug
 * output and by tests that match on `discovererId`.
 *
 * @internal
 */
export const CHANGE_STREAM_DISCOVERER_ID = 'mongo-change-stream';

/**
 * Stable transport name for the MongoDB change-stream transport.
 *
 * @internal
 */
export const CHANGE_STREAM_TRANSPORT = 'mongo-change-stream';

/**
 * Discovers `@changeStream`-decorated methods on controllers and
 * registers them with the `mongo-change-stream` transport.
 *
 * Each discovered handler produces a `DiscoveredHandler` of
 * `kind: HANDLER_KIND_EVENT` so transport-core treats it as
 * fire-and-forget and supports multiple handlers per pattern.
 *
 * The discovered pattern is a structured object containing
 * `collection` and `op`. Together these fields determine which
 * underlying `ChangeStream` is opened; pipeline / fullDocument /
 * batchSize options ride along in `options.extras` and are read by
 * {@link MongoChangeStreamServer} at `listen()` time.
 *
 * Bound by {@link MongoChangeStreamComponent} under
 * `TransportBindings.tags.HANDLER_DISCOVERER`.
 *
 * @experimental
 */
export class ChangeStreamDiscoverer implements HandlerDiscoverer {
  readonly id = CHANGE_STREAM_DISCOVERER_ID;

  discover(controllerClass: Constructor<unknown>): DiscoveredHandler[] {
    const meta =
      MetadataInspector.getAllMethodMetadata<MongoChangeStreamHandlerOptions>(
        CHANGE_STREAM_METADATA,
        controllerClass.prototype,
      );
    if (!meta) return [];
    const out: DiscoveredHandler[] = [];
    for (const methodName of Object.keys(meta)) {
      const opts = meta[methodName];
      if (!opts) continue;
      const op = opts.op ?? '*';
      const pattern: Record<string, unknown> = {
        collection: opts.collection,
        op,
      };
      out.push({
        pattern,
        transport: CHANGE_STREAM_TRANSPORT,
        kind: HANDLER_KIND_EVENT,
        methodName,
        // The full decorator options ride along via `extras` so the server
        // can recover pipeline / fullDocument / batchSize / etc. without
        // re-reading metadata. The registry forwards `extras` onto the
        // resulting `MessageHandler.extras` field, which the server reads
        // when opening the underlying ChangeStream.
        options: {extras: {options: opts}},
      });
    }
    return out;
  }
}
