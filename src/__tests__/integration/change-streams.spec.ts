import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {Application} from '@loopback/core';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import type {MongoService} from '../../index';
import {MongoComponent, MongoBindings} from '../../index';

describe('Integration: Change Streams', () => {
  let mongod: MongoMemoryReplSet;
  let app: Application;
  let service: MongoService;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({replSet: {count: 1}});

    app = new Application();
    app.bind(MongoBindings.CONFIG).to({
      url: mongod.getUri(),
      database: 'test_cs',
    });
    app.component(MongoComponent);
    await app.start();

    service = await app.get<MongoService>(MongoBindings.SERVICE);
  }, 30000);

  afterAll(async () => {
    // Give change streams time to fully close before stopping
    await new Promise(r => setTimeout(r, 500));
    await app?.stop();
    await mongod?.stop();
  }, 10000);

  it('opens a collection-level change stream', async () => {
    // Verify that watchCollection returns a valid ChangeStream
    // that can be opened and closed without error
    const col = service.getCollection('cs_orders');
    await col.insertOne({setup: true});

    const stream = service.watchCollection('cs_orders');
    expect(stream).toBeDefined();

    // The stream is open and can be closed cleanly
    await stream.close();
  }, 10000);

  it('watches database-level events', async () => {
    const stream = service.watchDatabase([{$match: {operationType: 'insert'}}]);

    await new Promise(r => setTimeout(r, 200));

    const changePromise = new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Change stream timeout')),
          5000,
        );
        stream.once('change', change => {
          clearTimeout(timeout);
          resolve(change as unknown as Record<string, unknown>);
        });
      },
    );

    const col = service.getCollection('events');
    await col.insertOne({type: 'test_event'});

    const change = await changePromise;
    expect(change.operationType).toBe('insert');

    await stream.close();
  }, 10000);

  it('provides resume tokens', async () => {
    const col = service.getCollection('tokens');
    await col.insertOne({setup: true});

    const stream = service.watchCollection('tokens');

    await new Promise(r => setTimeout(r, 200));

    const changePromise = new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Change stream timeout')),
          5000,
        );
        stream.once('change', change => {
          clearTimeout(timeout);
          resolve(change as unknown as Record<string, unknown>);
        });
      },
    );

    await col.insertOne({data: 'resume_test'});
    await changePromise;

    const token = stream.resumeToken;
    expect(token).toBeDefined();

    await stream.close();
  }, 10000);
});
