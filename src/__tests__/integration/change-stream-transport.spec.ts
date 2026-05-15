import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {Application} from '@loopback/core';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import type {MongoService} from '../../index';
import {
  MongoBindings,
  MongoComponent,
  MongoChangeStreamComponent,
  changeStream,
} from '../../index';
import {TransportComponent, payload} from '@ebarahona/loopback-transport-core';

/**
 * Integration tests for the `@changeStream` decorator + `MongoChangeStreamServer`
 * transport integration. These tests verify the wiring between the decorator,
 * the discoverer, and the server, not the raw `watchCollection` semantics
 * (those are covered by `change-streams.spec.ts`).
 */
describe('Integration: Change Stream Transport', () => {
  let mongod: MongoMemoryReplSet;
  let app: Application;
  let service: MongoService;

  /**
   * Poll a condition until it returns true or the timeout elapses.
   * Throws a clear error if the condition is not met in time.
   */
  async function waitFor(
    condition: () => boolean,
    {
      timeoutMs = 5000,
      intervalMs = 50,
      message = 'condition not met',
    }: {timeoutMs?: number; intervalMs?: number; message?: string} = {},
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (condition()) return;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting: ${message}`);
  }

  beforeEach(async () => {
    mongod = await MongoMemoryReplSet.create({replSet: {count: 1}});

    app = new Application();
    app.bind(MongoBindings.CONFIG).to({
      url: mongod.getUri(),
      database: 'test_cs_transport',
    });
    app.component(MongoComponent);
    app.component(TransportComponent);
    app.component(MongoChangeStreamComponent);
  }, 30000);

  afterEach(async () => {
    // Give change streams time to fully close before stopping
    await new Promise(r => setTimeout(r, 200));
    try {
      await app?.stop();
    } catch {
      // Ignore stop errors in cleanup; individual tests assert on clean shutdown.
    }
    await mongod?.stop();
  }, 30000);

  it('fires the handler on a matching change', async () => {
    class AuditController {
      static received: Array<Record<string, unknown>> = [];
      @changeStream({collection: 'users', op: 'insert'})
      async onUserCreated(@payload() change: Record<string, unknown>) {
        AuditController.received.push(change);
      }
    }
    AuditController.received = [];
    app.controller(AuditController);

    await app.start();
    service = await app.get<MongoService>(MongoBindings.SERVICE);

    // Give the server a moment to open the change stream before inserting.
    await new Promise(r => setTimeout(r, 300));

    await service
      .getCollection('users')
      .insertOne({name: 'alice', email: 'a@example.com'});

    await waitFor(() => AuditController.received.length >= 1, {
      timeoutMs: 5000,
      message: 'expected handler to receive at least one change',
    });

    const change = AuditController.received[0];
    expect(change.operationType).toBe('insert');
    const fullDoc = change.fullDocument as Record<string, unknown> | undefined;
    expect(fullDoc).toBeDefined();
    expect(fullDoc?.name).toBe('alice');

    await app.stop();
  }, 20000);

  it('excludes operations that do not match the op filter', async () => {
    class AuditController {
      static received: Array<Record<string, unknown>> = [];
      @changeStream({collection: 'users', op: 'insert'})
      async onUserCreated(@payload() change: Record<string, unknown>) {
        AuditController.received.push(change);
      }
    }
    AuditController.received = [];
    app.controller(AuditController);

    await app.start();
    service = await app.get<MongoService>(MongoBindings.SERVICE);

    await new Promise(r => setTimeout(r, 300));

    const col = service.getCollection('users');
    const insertResult = await col.insertOne({name: 'bob'});

    await waitFor(() => AuditController.received.length >= 1, {
      timeoutMs: 5000,
      message: 'expected insert to be received',
    });

    await col.updateOne(
      {_id: insertResult.insertedId},
      {$set: {name: 'robert'}},
    );

    // Give the (filtered out) update time to propagate so we can prove it
    // never gets delivered.
    await new Promise(r => setTimeout(r, 800));

    expect(AuditController.received).toHaveLength(1);
    expect(AuditController.received[0].operationType).toBe('insert');

    await app.stop();
  }, 20000);

  it('delivers all operations when op is "*"', async () => {
    class AuditController {
      static received: Array<Record<string, unknown>> = [];
      @changeStream({collection: 'orders', op: '*'})
      async onOrderChange(@payload() change: Record<string, unknown>) {
        AuditController.received.push(change);
      }
    }
    AuditController.received = [];
    app.controller(AuditController);

    await app.start();
    service = await app.get<MongoService>(MongoBindings.SERVICE);

    await new Promise(r => setTimeout(r, 300));

    const col = service.getCollection('orders');
    const inserted = await col.insertOne({sku: 'ABC-123', qty: 1});

    await waitFor(() => AuditController.received.length >= 1, {
      timeoutMs: 5000,
      message: 'expected insert delivered',
    });

    await col.updateOne({_id: inserted.insertedId}, {$set: {qty: 2}});

    await waitFor(() => AuditController.received.length >= 2, {
      timeoutMs: 5000,
      message: 'expected update delivered',
    });

    await col.deleteOne({_id: inserted.insertedId});

    await waitFor(() => AuditController.received.length >= 3, {
      timeoutMs: 5000,
      message: 'expected delete delivered',
    });

    const ops = AuditController.received.map(c => c.operationType);
    expect(ops).toEqual(['insert', 'update', 'delete']);

    await app.stop();
  }, 20000);

  it('routes events to multiple decorators on the same controller', async () => {
    class MultiController {
      static users: Array<Record<string, unknown>> = [];
      static orders: Array<Record<string, unknown>> = [];

      @changeStream({collection: 'users', op: 'insert'})
      async onUser(@payload() change: Record<string, unknown>) {
        MultiController.users.push(change);
      }

      @changeStream({collection: 'orders', op: 'insert'})
      async onOrder(@payload() change: Record<string, unknown>) {
        MultiController.orders.push(change);
      }
    }
    MultiController.users = [];
    MultiController.orders = [];
    app.controller(MultiController);

    await app.start();
    service = await app.get<MongoService>(MongoBindings.SERVICE);

    await new Promise(r => setTimeout(r, 300));

    await service.getCollection('users').insertOne({name: 'carol'});
    await service.getCollection('orders').insertOne({sku: 'XYZ-9'});

    await waitFor(
      () =>
        MultiController.users.length >= 1 && MultiController.orders.length >= 1,
      {timeoutMs: 5000, message: 'expected both handlers to receive changes'},
    );

    // Give any cross-talk a chance to surface.
    await new Promise(r => setTimeout(r, 500));

    expect(MultiController.users).toHaveLength(1);
    expect(MultiController.orders).toHaveLength(1);

    const userDoc = MultiController.users[0].fullDocument as
      | Record<string, unknown>
      | undefined;
    const orderDoc = MultiController.orders[0].fullDocument as
      | Record<string, unknown>
      | undefined;

    expect(userDoc?.name).toBe('carol');
    expect(orderDoc?.sku).toBe('XYZ-9');

    // Neither handler saw the other collection's document.
    expect(
      MultiController.users.some(
        c =>
          (c.fullDocument as Record<string, unknown> | undefined)?.sku ===
          'XYZ-9',
      ),
    ).toBe(false);
    expect(
      MultiController.orders.some(
        c =>
          (c.fullDocument as Record<string, unknown> | undefined)?.name ===
          'carol',
      ),
    ).toBe(false);

    await app.stop();
  }, 20000);

  it('shuts down cleanly without unhandled rejections', async () => {
    class AuditController {
      static received: Array<Record<string, unknown>> = [];
      @changeStream({collection: 'cleanup', op: '*'})
      async onChange(@payload() change: Record<string, unknown>) {
        AuditController.received.push(change);
      }
    }
    AuditController.received = [];
    app.controller(AuditController);

    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);

    try {
      await app.start();

      // Let the server fully open before tearing down.
      await new Promise(r => setTimeout(r, 300));

      await expect(app.stop()).resolves.toBeUndefined();

      // Drain the microtask queue so any deferred rejections surface.
      await new Promise(r => setTimeout(r, 300));

      const sessionEnded = rejections.find(
        r =>
          r instanceof Error &&
          /Cannot use a session that has ended/i.test(r.message),
      );
      expect(sessionEnded).toBeUndefined();
      expect(rejections).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  }, 20000);
});
