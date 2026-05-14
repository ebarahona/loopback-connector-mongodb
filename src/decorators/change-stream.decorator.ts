import {MethodDecoratorFactory} from '@loopback/metadata';
import {
  CHANGE_STREAM_METADATA,
  type MongoChangeStreamHandlerOptions,
} from './constants';

/**
 * Mark a controller method as a MongoDB change stream handler.
 *
 * The method fires for every change event that matches the configured
 * `collection`, `op`, and optional `pipeline`. The decorated method
 * receives the `ChangeStreamDocument` as `@payload()`.
 *
 * Pairs with {@link MongoChangeStreamServer}, which opens one underlying
 * `ChangeStream` per discovered handler on `listen()` and closes them
 * on `close()`. Handlers are fire-and-forget (event semantics): the
 * server invokes them through transport-core's event dispatcher and
 * does not collect responses.
 *
 * @experimental
 * @param opts - Watch configuration.
 * @returns A method decorator that stores the change-stream metadata.
 *
 * @example
 * ```typescript
 * import {payload} from '@ebarahona/loopback-transport-core';
 * import {changeStream} from '@ebarahona/loopback-connector-mongodb';
 * import type {ChangeStreamDocument} from 'mongodb';
 *
 * export class AuditController {
 *   @changeStream({collection: 'users', op: 'insert'})
 *   async onUserCreated(
 *     @payload() change: ChangeStreamDocument,
 *   ): Promise<void> {
 *     // ...
 *   }
 * }
 * ```
 */
export function changeStream(
  opts: MongoChangeStreamHandlerOptions,
): MethodDecorator {
  return MethodDecoratorFactory.createDecorator<MongoChangeStreamHandlerOptions>(
    CHANGE_STREAM_METADATA,
    opts,
  );
}
