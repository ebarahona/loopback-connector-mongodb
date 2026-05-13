import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {Application} from '@loopback/core';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {
  MongoComponent,
  MongoBindings,
  MongoService,
} from '../../index';

describe('Integration: Connection and Component', () => {
  let mongod: MongoMemoryReplSet;
  let app: Application;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: {count: 1},
    });
    const uri = mongod.getUri();

    app = new Application();
    app.bind(MongoBindings.CONFIG).to({
      url: uri,
      database: 'test_db',
    });
    app.component(MongoComponent);
    await app.start();
  }, 30000);

  afterAll(async () => {
    await app.stop();
    await mongod.stop();
  });

  it('resolves MongoService from the container', async () => {
    const service = await app.get<MongoService>(MongoBindings.SERVICE);
    expect(service).toBeDefined();
    expect(service.getClient()).toBeDefined();
  });

  it('connects to the database', async () => {
    const service = await app.get<MongoService>(MongoBindings.SERVICE);
    const db = service.getDb();
    expect(db.databaseName).toBe('test_db');
  });

  it('detects replica set topology', async () => {
    const service = await app.get<MongoService>(MongoBindings.SERVICE);
    expect(service.isReplicaSet()).toBe(true);
    expect(service.getTopologyType()).toContain('ReplicaSet');
  });

  it('pings the server', async () => {
    const service = await app.get<MongoService>(MongoBindings.SERVICE);
    const result = await service.command({ping: 1});
    expect(result.ok).toBe(1);
  });
});
