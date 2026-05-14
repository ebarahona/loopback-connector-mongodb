import {MetadataAccessor} from '@loopback/metadata';

/**
 * Options for the `@changeStream` decorator. Captured as a named type
 * so consumers can construct option objects programmatically and so the
 * server can re-derive watch configuration from the discovered pattern.
 *
 * `collection` is required. All other fields are optional, with the
 * defaults matching MongoDB's own change-stream defaults.
 *
 * Named `MongoChangeStreamHandlerOptions` (not `ChangeStreamOptions`) to
 * avoid clashing with the `ChangeStreamOptions` type exported by the
 * `mongodb` driver, which describes a different (lower-level) shape.
 *
 * @experimental
 */
export interface MongoChangeStreamHandlerOptions {
  /** Target collection name in the connector's configured database. */
  collection: string;
  /**
   * Operation filter. `'*'` (default) accepts every operation type.
   * Anything else is appended as a `$match: {operationType: op}` stage.
   */
  op?:
    | 'insert'
    | 'update'
    | 'delete'
    | 'replace'
    | 'invalidate'
    | 'drop'
    | 'dropDatabase'
    | 'rename'
    | '*';
  /** Optional MongoDB aggregation pipeline appended after the op filter. */
  pipeline?: Record<string, unknown>[];
  /** Forwarded to ChangeStream options (e.g. `fullDocument: 'updateLookup'`). */
  fullDocument?: 'default' | 'updateLookup' | 'whenAvailable' | 'required';
  /** Forwarded to ChangeStream options. */
  fullDocumentBeforeChange?: 'off' | 'whenAvailable' | 'required';
  /** Forwarded to ChangeStream options. */
  batchSize?: number;
  /** Forwarded to ChangeStream options. */
  maxAwaitTimeMS?: number;
}

/**
 * Metadata key written by `@changeStream` and read by
 * `ChangeStreamDiscoverer`.
 *
 * @internal
 */
export const CHANGE_STREAM_METADATA = MetadataAccessor.create<
  MongoChangeStreamHandlerOptions,
  MethodDecorator
>('mongo:change-stream');
