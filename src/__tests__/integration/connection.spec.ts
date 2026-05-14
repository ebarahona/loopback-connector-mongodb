import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {Application} from '@loopback/core';
import {
  DefaultCrudRepository,
  Entity,
  juggler,
  model,
  property,
} from '@loopback/repository';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {
  MongoComponent,
  MongoBindings,
  MongoService,
  MongoConnectionManager,
  MongoConnector,
} from '../../index';

@model()
class TestItem extends Entity {
  @property({type: 'string', id: true, generated: false})
  id: string;

  @property({type: 'string', required: true})
  name: string;

  @property({type: 'number'})
  value?: number;
}

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
    await app?.stop();
    await mongod?.stop();
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

  it('resolves a shared MongoDataSource from the container', async () => {
    const ds = await app.get<juggler.DataSource>(
      MongoBindings.DATASOURCE,
    );
    expect(ds).toBeInstanceOf(juggler.DataSource);

    const connector = (ds as unknown as {connector: MongoConnector})
      .connector;
    const dsManager = connector.getConnectionManager();
    const sharedManager = await app.get<MongoConnectionManager>(
      MongoBindings.CONNECTION_MANAGER,
    );
    // The DataSource must wrap the shared manager, not its own.
    expect(dsManager).toBe(sharedManager);
  });

  describe('repository CRUD via shared DataSource', () => {
    let repo: DefaultCrudRepository<TestItem, string>;

    beforeAll(async () => {
      const ds = await app.get<juggler.DataSource>(
        MongoBindings.DATASOURCE,
      );
      repo = new DefaultCrudRepository(TestItem, ds);
    });

    it('creates and finds a document', async () => {
      const created = await repo.create({
        id: 'repo-test-1',
        name: 'Test Item',
        value: 42,
      });
      expect(created.id).toBe('repo-test-1');
      expect(created.name).toBe('Test Item');

      const found = await repo.findById('repo-test-1');
      expect(found.name).toBe('Test Item');
      expect(found.value).toBe(42);
    });

    it('updates a document', async () => {
      await repo.updateById('repo-test-1', {value: 99});
      const found = await repo.findById('repo-test-1');
      expect(found.value).toBe(99);
    });

    it('queries with a where filter', async () => {
      await repo.create({id: 'repo-test-2', name: 'Other', value: 10});
      const results = await repo.find({
        where: {value: {gt: 50}},
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('repo-test-1');
    });

    it('counts documents', async () => {
      const count = await repo.count();
      expect(count.count).toBeGreaterThanOrEqual(2);
    });

    it('deletes a document', async () => {
      await repo.deleteById('repo-test-1');
      const exists = await repo.exists('repo-test-1');
      expect(exists).toBe(false);
    });
  });
});
