import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {Application} from '@loopback/core';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import type {MongoService} from '../../index';
import {MongoComponent, MongoBindings} from '../../index';

describe('Integration: Aggregation', () => {
  let mongod: MongoMemoryReplSet;
  let app: Application;
  let service: MongoService;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({replSet: {count: 1}});

    app = new Application();
    app.bind(MongoBindings.CONFIG).to({
      url: mongod.getUri(),
      database: 'test_agg',
    });
    app.component(MongoComponent);
    await app.start();

    service = await app.get<MongoService>(MongoBindings.SERVICE);

    // Seed test data
    const col = service.getCollection('sales');
    await col.insertMany([
      {product: 'A', amount: 100, region: 'US'},
      {product: 'B', amount: 200, region: 'US'},
      {product: 'A', amount: 150, region: 'EU'},
      {product: 'B', amount: 50, region: 'EU'},
      {product: 'A', amount: 300, region: 'US'},
    ]);
  }, 30000);

  afterAll(async () => {
    await app?.stop();
    await mongod?.stop();
  });

  it('runs a simple aggregation pipeline', async () => {
    const results = await service.aggregate('sales', [
      {$group: {_id: '$product', total: {$sum: '$amount'}}},
      {$sort: {_id: 1}},
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]._id).toBe('A');
    expect(results[0].total).toBe(550);
    expect(results[1]._id).toBe('B');
    expect(results[1].total).toBe(250);
  });

  it('runs aggregation with $match and $group', async () => {
    const results = await service.aggregate('sales', [
      {$match: {region: 'US'}},
      {$group: {_id: '$product', total: {$sum: '$amount'}}},
      {$sort: {total: -1}},
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]._id).toBe('A');
    expect(results[0].total).toBe(400);
  });

  it('returns an aggregation cursor', async () => {
    const cursor = service.aggregateCursor('sales', [
      {$group: {_id: '$region', count: {$sum: 1}}},
    ]);

    const results = await cursor.toArray();
    expect(results).toHaveLength(2);
  });
});
