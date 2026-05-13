import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {MongoConnector} from '../../connector/mongo.connector';

describe('Integration: Connector CRUD', () => {
  let mongod: MongoMemoryReplSet;
  let connector: MongoConnector;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: {count: 1},
    });

    connector = new MongoConnector({
      url: mongod.getUri(),
      database: 'test_crud',
    });

    connector.define({
      model: {modelName: 'Order'},
      properties: {
        id: {type: String, id: true},
        name: {type: String},
        total: {type: Number},
        status: {type: String},
      },
      settings: {},
    });

    await connector.connect();
  }, 30000);

  afterAll(async () => {
    await connector.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    const db = connector.getDb();
    if (db) {
      try {
        await db.collection('Order').deleteMany({});
      } catch {
        // collection may not exist yet
      }
    }
  });

  describe('create', () => {
    it('inserts a document and returns the id', async () => {
      const id = await connector.create('Order', {
        name: 'Test Order',
        total: 99.99,
        status: 'pending',
      });

      expect(id).toBeDefined();
    });

    it('uses provided id when given', async () => {
      const id = await connector.create('Order', {
        id: 'custom-id-123',
        name: 'Custom ID Order',
        total: 50,
      });

      expect(String(id)).toBe('custom-id-123');
    });
  });

  describe('find', () => {
    it('finds a document by id', async () => {
      const id = await connector.create('Order', {
        name: 'Find Me',
        total: 42,
      });

      const found = await connector.find('Order', id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Find Me');
      expect(found!.total).toBe(42);
    });

    it('returns null for non-existent id', async () => {
      const found = await connector.find('Order', 'nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('all (query)', () => {
    it('returns all documents without filter', async () => {
      await connector.create('Order', {name: 'A', total: 10});
      await connector.create('Order', {name: 'B', total: 20});

      const results = await connector.all('Order');
      expect(results).toHaveLength(2);
    });

    it('filters with where clause', async () => {
      await connector.create('Order', {
        name: 'Cheap',
        total: 10,
        status: 'active',
      });
      await connector.create('Order', {
        name: 'Expensive',
        total: 100,
        status: 'active',
      });
      await connector.create('Order', {
        name: 'Cancelled',
        total: 50,
        status: 'cancelled',
      });

      const active = await connector.all('Order', {
        where: {status: 'active'},
      });
      expect(active).toHaveLength(2);

      const expensive = await connector.all('Order', {
        where: {total: {gt: 50}},
      });
      expect(expensive).toHaveLength(1);
      expect(expensive[0].name).toBe('Expensive');
    });

    it('supports order, limit, and skip', async () => {
      await connector.create('Order', {name: 'C', total: 30});
      await connector.create('Order', {name: 'A', total: 10});
      await connector.create('Order', {name: 'B', total: 20});

      const sorted = await connector.all('Order', {
        order: 'total ASC',
      });
      expect(sorted.map(o => o.name)).toEqual(['A', 'B', 'C']);

      const limited = await connector.all('Order', {
        order: 'total ASC',
        limit: 2,
      });
      expect(limited).toHaveLength(2);

      const skipped = await connector.all('Order', {
        order: 'total ASC',
        skip: 1,
        limit: 1,
      });
      expect(skipped[0].name).toBe('B');
    });

    it('supports field projection', async () => {
      await connector.create('Order', {
        name: 'Projected',
        total: 99,
        status: 'active',
      });

      const results = await connector.all('Order', {
        fields: ['name'],
      });
      expect(results[0].name).toBe('Projected');
      expect(results[0].total).toBeUndefined();
    });
  });

  describe('updateAll', () => {
    it('updates matching documents', async () => {
      await connector.create('Order', {
        name: 'Update Me',
        status: 'pending',
      });
      await connector.create('Order', {
        name: 'Leave Me',
        status: 'active',
      });

      const result = await connector.updateAll(
        'Order',
        {status: 'pending'},
        {status: 'processed'},
      );
      expect(result.count).toBe(1);

      const updated = await connector.all('Order', {
        where: {status: 'processed'},
      });
      expect(updated).toHaveLength(1);
      expect(updated[0].name).toBe('Update Me');
    });
  });

  describe('deleteAll', () => {
    it('deletes matching documents', async () => {
      await connector.create('Order', {name: 'Keep', status: 'active'});
      await connector.create('Order', {
        name: 'Delete',
        status: 'cancelled',
      });

      const result = await connector.deleteAll('Order', {
        status: 'cancelled',
      });
      expect(result.count).toBe(1);

      const remaining = await connector.all('Order');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('Keep');
    });
  });

  describe('count', () => {
    it('counts documents', async () => {
      await connector.create('Order', {name: 'A', status: 'active'});
      await connector.create('Order', {name: 'B', status: 'active'});
      await connector.create('Order', {name: 'C', status: 'done'});

      const total = await connector.count('Order');
      expect(total).toBe(3);

      const active = await connector.count('Order', {status: 'active'});
      expect(active).toBe(2);
    });
  });

  describe('replaceById', () => {
    it('replaces a document by id', async () => {
      const id = await connector.create('Order', {
        name: 'Original',
        total: 10,
      });

      await connector.replaceById('Order', id, {
        name: 'Replaced',
        total: 20,
      });

      const found = await connector.find('Order', id);
      expect(found!.name).toBe('Replaced');
      expect(found!.total).toBe(20);
    });
  });

  describe('exists', () => {
    it('returns true for existing document', async () => {
      const id = await connector.create('Order', {name: 'Exists'});
      expect(await connector.exists('Order', id)).toBe(true);
    });

    it('returns false for non-existent document', async () => {
      expect(await connector.exists('Order', 'nope')).toBe(false);
    });
  });

  describe('updateOrCreate', () => {
    it('creates when not found', async () => {
      const result = await connector.updateOrCreate('Order', {
        id: 'upsert-1',
        name: 'Upserted',
        total: 77,
      });
      expect(result.name).toBe('Upserted');

      const found = await connector.find('Order', 'upsert-1');
      expect(found).not.toBeNull();
    });

    it('updates when found', async () => {
      await connector.create('Order', {
        id: 'upsert-2',
        name: 'Original',
        total: 10,
      });

      const result = await connector.updateOrCreate('Order', {
        id: 'upsert-2',
        name: 'Updated',
        total: 20,
      });
      expect(result.name).toBe('Updated');
    });
  });
});
