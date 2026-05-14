/**
 * Benchmark harness for @ebarahona/loopback-connector-mongodb.
 *
 * Spins up an in-memory MongoDB, shares a single MongoConnectionManager
 * between a MongoConnector and a MongoServiceImpl, and measures the
 * hot-path operations the connector exposes.
 *
 * --------------------------------------------------------------
 * HELP WANTED
 * --------------------------------------------------------------
 * Numbers from this harness are MEANINGFUL ONLY RELATIVE TO EACH
 * OTHER on the same machine. We deliberately do NOT publish a
 * baseline JSON — environment variance (CPU, RAM, OS, Node version,
 * laptop vs. CI runner) makes absolute numbers misleading.
 *
 * What we need from contributors:
 *   - Side-by-side comparison against the official
 *     `loopback-connector-mongodb` (driver 5.x, callback-style).
 *   - Pipeline benchmarks ($lookup, $facet, $merge).
 *   - Multi-tenant DataSource throughput.
 *   - GridFS upload/download streaming.
 *   - A published baseline JSON in bench/baseline.json so PRs can
 *     detect regressions via CI.
 *
 * See HELP_WANTED.md for the full open list.
 * --------------------------------------------------------------
 *
 * Invocation:
 *   npm run build
 *   npm run bench
 */

import {Bench} from 'tinybench';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MongoConnectionManager} from '../dist/helpers/connection-manager.js';
import {MongoConnector} from '../dist/connector/mongo.connector.js';
import {MongoServiceImpl} from '../dist/services/mongo.service.impl.js';

const SEED_SIZE = 100;
const COLLECTION = 'Bench';

function buildModelDef() {
  return {
    model: {modelName: COLLECTION},
    properties: {
      id: {type: String, id: true},
      name: {type: String},
      value: {type: Number},
    },
    settings: {},
  };
}

async function seedDocs(connector) {
  for (let i = 0; i < SEED_SIZE; i += 1) {
    await connector.create(COLLECTION, {
      id: `seed-${i}`,
      name: `seed-${i}`,
      value: i,
    });
  }
}

async function main() {
  console.log('Booting in-memory MongoDB...');
  const mongod = await MongoMemoryServer.create();
  const url = mongod.getUri();

  const manager = new MongoConnectionManager({url, database: 'bench_db'});
  await manager.connect();

  const connector = new MongoConnector({url, database: 'bench_db'}, manager);
  connector.define(buildModelDef());

  const service = new MongoServiceImpl(manager);

  // Track every doc the `create` case inserts so we can clear between
  // measurement and the rest of the suite.
  const createdIds = [];

  try {
    console.log(`Seeding ${SEED_SIZE} documents...`);
    await seedDocs(connector);

    const bench = new Bench({time: 1000, warmupTime: 1000});

    let createCounter = 0;
    bench.add('connector.create (insert one)', async () => {
      const id = `bench-create-${createCounter++}`;
      createdIds.push(id);
      await connector.create(COLLECTION, {
        id,
        name: 'created',
        value: createCounter,
      });
    });

    bench.add('connector.find by id', async () => {
      await connector.find(COLLECTION, 'seed-42');
    });

    bench.add('connector.all where value>50 limit 10', async () => {
      await connector.all(COLLECTION, {
        where: {value: {gt: 50}},
        limit: 10,
      });
    });

    bench.add('service.aggregate ($match + $group)', async () => {
      await service.aggregate(COLLECTION, [
        {$match: {value: {$gte: 0}}},
        {$group: {_id: null, total: {$sum: '$value'}, count: {$sum: 1}}},
      ]);
    });

    console.log('Running benchmarks (this takes a minute)...');
    await bench.run();

    console.log('');
    console.log('--- Benchmark results ---');
    console.table(bench.table());
  } finally {
    try {
      const db = manager.getDb();
      await db.collection(COLLECTION).deleteMany({});
    } catch {
      // best effort
    }
    await manager.disconnect();
    await mongod.stop();
  }
}

main().catch((err) => {
  console.error('Benchmark harness crashed:', err);
  process.exitCode = 1;
});
