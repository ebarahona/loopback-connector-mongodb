import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {Application} from '@loopback/core';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import type {MongoService} from '../../index';
import {MongoComponent, MongoBindings} from '../../index';

describe('Integration: Time Series Collections', () => {
  let mongod: MongoMemoryReplSet;
  let app: Application;
  let service: MongoService;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: {count: 1},
    });

    app = new Application();
    app.bind(MongoBindings.CONFIG).to({
      url: mongod.getUri(),
      database: 'test_ts',
    });
    app.component(MongoComponent);
    await app.start();

    service = await app.get<MongoService>(MongoBindings.SERVICE);
  }, 30000);

  afterAll(async () => {
    await app?.stop();
    await mongod?.stop();
  });

  it('creates a time series collection', async () => {
    const col = await service.createTimeSeriesCollection('ts_metrics', {
      timeField: 'timestamp',
      metaField: 'source',
      granularity: 'minutes',
    });

    expect(col.collectionName).toBe('ts_metrics');

    // Verify it's a time series collection
    const collections = await service.listCollections();
    const tsCol = collections.find(c => c.name === 'ts_metrics');
    expect(tsCol).toBeDefined();
    expect(tsCol?.options?.timeseries).toBeDefined();
    expect(tsCol?.options?.timeseries?.timeField).toBe('timestamp');
  });

  it('creates a time series collection with options', async () => {
    const col = await service.createTimeSeriesCollection(
      'ts_with_options',
      {
        timeField: 'ts',
        metaField: 'metadata',
        granularity: 'hours',
      },
      undefined,
      {expireAfterSeconds: 86400},
    );

    expect(col.collectionName).toBe('ts_with_options');

    const collections = await service.listCollections();
    const tsCol = collections.find(c => c.name === 'ts_with_options');
    expect(tsCol).toBeDefined();
    expect(tsCol?.options?.timeseries?.granularity).toBe('hours');
  });

  it('inserts and queries time series data', async () => {
    // Use the collection created above
    const col = service.getCollection('ts_metrics');

    const now = new Date();
    await col.insertMany([
      {
        timestamp: now,
        source: 'ads',
        spend: 100,
        impressions: 5000,
      },
      {
        timestamp: new Date(now.getTime() - 60000),
        source: 'ads',
        spend: 200,
        impressions: 8000,
      },
      {
        timestamp: now,
        source: 'organic',
        spend: 0,
        impressions: 3000,
      },
    ]);

    // Aggregate by source
    const results = await service.aggregate('ts_metrics', [
      {$group: {_id: '$source', totalSpend: {$sum: '$spend'}}},
      {$sort: {_id: 1}},
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]._id).toBe('ads');
    expect(results[0].totalSpend).toBe(300);
    expect(results[1]._id).toBe('organic');
    expect(results[1].totalSpend).toBe(0);
  });
});
