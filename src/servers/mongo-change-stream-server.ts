import {inject} from '@loopback/core';
import debugFactory from 'debug';
import type {
  ChangeStream,
  ChangeStreamDocument,
  ChangeStreamOptions,
  Document,
} from 'mongodb';
import {ServerBase} from '@ebarahona/loopback-transport-core';
import {MongoBindings} from '../keys';
import type {MongoService} from '../services';
import type {MongoChangeStreamHandlerOptions} from '../decorators/constants';

const debug = debugFactory('loopback:connector:mongodb:change-stream-server');

/**
 * Structured pattern produced by {@link ChangeStreamDiscoverer}. The
 * registry serializes it via `normalizePattern()` and the server
 * recovers it by parsing the resulting JSON key.
 *
 * @internal
 */
interface ChangeStreamPattern {
  collection: string;
  op: MongoChangeStreamHandlerOptions['op'];
}

/**
 * Transport server that exposes MongoDB change streams as a
 * transport-core transport.
 *
 * Each `@changeStream`-decorated handler in the application corresponds
 * to one underlying `ChangeStream` opened on `listen()` and closed on
 * `close()`. Multiple handlers sharing the same collection and op pair
 * share a single underlying stream and fan out to every matching
 * handler via transport-core's event dispatch.
 *
 * The server reads the original {@link MongoChangeStreamHandlerOptions}
 * off each handler's `extras` field (populated by the discoverer) and
 * uses them to build the watch pipeline and stream options. When a
 * group of handlers under the same pattern declare conflicting watch
 * options (e.g. different `pipeline` or `fullDocument` settings), the
 * server silently picks the first handler's options. The simplest way
 * to fan out distinct configs is to vary either `collection` or `op`,
 * both of which participate in the pattern key. A diagnostic
 * conflict-detection log is a planned follow-up.
 *
 * Bound by {@link MongoChangeStreamComponent} under
 * `TransportBindings.tags.SERVER` with NAME `'mongo-change-stream'`.
 *
 * @experimental
 */
export class MongoChangeStreamServer extends ServerBase {
  private readonly streams: ChangeStream[] = [];

  constructor(
    @inject(MongoBindings.SERVICE) private readonly mongo: MongoService,
  ) {
    super();
  }

  async listen(): Promise<void> {
    for (const [key, handlers] of this.getHandlers().entries()) {
      const pattern = this.parseKey(key);
      if (pattern === undefined) {
        debug('skipping handler with unparsable pattern key: %s', key);
        continue;
      }
      const watchOpts = this.pickWatchOptions(key, handlers);
      const stream = this.openStream(pattern, watchOpts);
      this.streams.push(stream);
      stream.on('change', (change: ChangeStreamDocument<Document>) => {
        // Dispatch via ServerBase's event pipeline. `handleEvent` looks
        // up the same handler chain by pattern and fans out to every
        // handler with proper error isolation and timeouts.
        void this.handleEvent({pattern: key, data: change});
      });
      stream.on('error', err => {
        // Change streams can recover; surface via status but do not
        // throw. Consumers can subscribe to `status$` to react.
        debug('change stream error on %o: %O', pattern, err);
        this.setStatus('error');
      });
      debug(
        'opened change stream for pattern %o (%d handlers)',
        pattern,
        handlers.length,
      );
    }
    this.setStatus('connected');
  }

  async close(): Promise<void> {
    const results = await Promise.allSettled(this.streams.map(s => s.close()));
    for (const r of results) {
      if (r.status === 'rejected') {
        debug('change stream close failed: %O', r.reason);
      }
    }
    this.streams.length = 0;
    this.setStatus('disconnected');
  }

  unwrap<T>(): T {
    // Change streams do not share a single native client object; the
    // closest equivalent is the MongoService that owns them.
    return this.mongo as unknown as T;
  }

  /**
   * Recover the structured pattern from a normalized registry key.
   * Returns `undefined` when the key cannot be parsed as a pattern of
   * the shape the discoverer emits.
   */
  private parseKey(key: string): ChangeStreamPattern | undefined {
    try {
      const parsed: unknown = JSON.parse(key);
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        return undefined;
      }
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.collection !== 'string' || obj.collection.length === 0) {
        return undefined;
      }
      const op = obj.op as ChangeStreamPattern['op'] | undefined;
      return {
        collection: obj.collection,
        op: op ?? '*',
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Recover the full {@link MongoChangeStreamHandlerOptions} attached
   * to the first handler in the chain. If no handler carries the
   * options (e.g. the chain was added by an external caller bypassing
   * the discoverer), falls back to a minimal options object built from
   * the pattern alone.
   */
  private pickWatchOptions(
    key: string,
    handlers: readonly {extras?: Readonly<Record<string, unknown>>}[],
  ): MongoChangeStreamHandlerOptions {
    for (const handler of handlers) {
      const opts = handler.extras?.options;
      if (opts !== undefined && this.isHandlerOptions(opts)) {
        return opts;
      }
    }
    const pattern = this.parseKey(key);
    if (pattern === undefined) {
      // Should never happen: listen() already filtered these out.
      throw new Error(
        `mongo-change-stream: cannot derive watch options for key ${key}`,
      );
    }
    return {
      collection: pattern.collection,
      ...(pattern.op !== undefined ? {op: pattern.op} : {}),
    };
  }

  private isHandlerOptions(
    value: unknown,
  ): value is MongoChangeStreamHandlerOptions {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as {collection?: unknown}).collection === 'string'
    );
  }

  private openStream(
    pattern: ChangeStreamPattern,
    opts: MongoChangeStreamHandlerOptions,
  ): ChangeStream {
    const pipeline: Document[] = [];
    if (opts.op && opts.op !== '*') {
      pipeline.push({$match: {operationType: opts.op}});
    } else if (pattern.op && pattern.op !== '*') {
      pipeline.push({$match: {operationType: pattern.op}});
    }
    if (opts.pipeline) {
      pipeline.push(...(opts.pipeline as unknown as Document[]));
    }
    const streamOpts: ChangeStreamOptions = {};
    if (opts.fullDocument !== undefined) {
      streamOpts.fullDocument = opts.fullDocument;
    }
    if (opts.fullDocumentBeforeChange !== undefined) {
      streamOpts.fullDocumentBeforeChange = opts.fullDocumentBeforeChange;
    }
    if (opts.batchSize !== undefined) {
      streamOpts.batchSize = opts.batchSize;
    }
    if (opts.maxAwaitTimeMS !== undefined) {
      streamOpts.maxAwaitTimeMS = opts.maxAwaitTimeMS;
    }
    // `MongoService.watchCollection` resolves the database via the
    // connector's configured default. Per-pattern database overrides
    // are not supported in this experimental release; callers that need
    // a non-default database should set the connector's `database`
    // config or bind a separate `MongoService` instance.
    return this.mongo.watchCollection(
      opts.collection ?? pattern.collection,
      pipeline,
      streamOpts,
    );
  }
}
