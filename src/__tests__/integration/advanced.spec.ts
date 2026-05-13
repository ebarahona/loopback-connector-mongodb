import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {Application} from '@loopback/core';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {Readable} from 'stream';
import {MongoComponent, MongoBindings, MongoService} from '../../index';

describe('Integration: Advanced Features', () => {
  let mongod: MongoMemoryReplSet;
  let app: Application;
  let service: MongoService;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({replSet: {count: 1}});

    app = new Application();
    app.bind(MongoBindings.CONFIG).to({
      url: mongod.getUri(),
      database: 'test_advanced',
    });
    app.component(MongoComponent);
    await app.start();

    service = await app.get<MongoService>(MongoBindings.SERVICE);
  }, 30000);

  afterAll(async () => {
    await app?.stop();
    await mongod?.stop();
  });

  describe('bulk operations', () => {
    it('executes bulkWrite with mixed operations', async () => {
      const col = service.getCollection('bulk_test');
      await col.insertMany([
        {name: 'A', value: 1},
        {name: 'B', value: 2},
      ]);

      const result = await service.bulkWrite('bulk_test', [
        {insertOne: {document: {name: 'C', value: 3}}},
        {updateOne: {filter: {name: 'A'}, update: {$set: {value: 10}}}},
        {deleteOne: {filter: {name: 'B'}}},
      ]);

      expect(result.insertedCount).toBe(1);
      expect(result.modifiedCount).toBe(1);
      expect(result.deletedCount).toBe(1);
    });
  });

  describe('transactions', () => {
    it('commits a transaction', async () => {
      const col = service.getCollection('tx_test');

      await service.withTransaction(async session => {
        await col.insertOne({name: 'tx_item'}, {session});
      });

      const docs = await col.find({name: 'tx_item'}).toArray();
      expect(docs).toHaveLength(1);
    });

    it('rolls back on error', async () => {
      const col = service.getCollection('tx_rollback');
      await col.insertOne({name: 'existing'});

      try {
        await service.withTransaction(async session => {
          await col.insertOne({name: 'will_rollback'}, {session});
          throw new Error('Intentional rollback');
        });
      } catch {
        // expected
      }

      const docs = await col.find({name: 'will_rollback'}).toArray();
      expect(docs).toHaveLength(0);
    });
  });

  describe('GridFS', () => {
    it('uploads and downloads a file', async () => {
      const bucket = service.getGridFSBucket('test_files');

      // Upload
      const content = 'Hello, GridFS!';
      const uploadStream = bucket.openUploadStream('test.txt');
      const readable = Readable.from([content]);
      await new Promise<void>((resolve, reject) => {
        readable.pipe(uploadStream).on('finish', resolve).on('error', reject);
      });

      const fileId = uploadStream.id;

      // Download
      const downloadStream = bucket.openDownloadStream(fileId);
      const chunks: Buffer[] = [];
      for await (const chunk of downloadStream) {
        chunks.push(chunk);
      }
      const downloaded = Buffer.concat(chunks).toString();

      expect(downloaded).toBe(content);
    });
  });

  describe('index management', () => {
    it('creates and lists indexes', async () => {
      const col = service.getCollection('idx_test');
      await col.insertOne({email: 'test@test.com', name: 'Test'});

      const indexName = await service.createIndex('idx_test', {
        email: 1,
      }, {unique: true});

      expect(indexName).toBe('email_1');

      const indexes = await service.listIndexes('idx_test');
      const emailIdx = indexes.find(i => i.name === 'email_1');
      expect(emailIdx).toBeDefined();
      expect(emailIdx!.unique).toBe(true);
    });

    it('drops an index', async () => {
      await service.dropIndex('idx_test', 'email_1');
      const indexes = await service.listIndexes('idx_test');
      const emailIdx = indexes.find(i => i.name === 'email_1');
      expect(emailIdx).toBeUndefined();
    });
  });

  describe('admin', () => {
    it('lists databases', async () => {
      const result = await service.listDatabases();
      expect(result.databases.length).toBeGreaterThan(0);
    });

    it('lists collections', async () => {
      // Ensure at least one collection exists
      await service.getCollection('admin_test').insertOne({x: 1});
      const collections = await service.listCollections();
      expect(collections.length).toBeGreaterThan(0);
    });

    it('gets database stats', async () => {
      const stats = await service.dbStats();
      expect(stats.db).toBe('test_advanced');
    });
  });
});
