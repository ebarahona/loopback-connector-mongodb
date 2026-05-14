/**
 * Leak detection harness for MongoConnectionManager.
 *
 * Runs N iterations of connect/disconnect against a real in-memory
 * MongoDB (no mocks) and reports the heap delta. If the delta
 * exceeds the threshold, exits non-zero.
 *
 * --------------------------------------------------------------
 * HELP WANTED
 * --------------------------------------------------------------
 * The iteration count (default 1000) and threshold (default 10 MB)
 * are STARTING POINTS, not validated baselines. Empirical tuning
 * is needed:
 *
 *   - Run across Node 20.x, 22.x, 24.x and capture stable deltas.
 *   - Pick a threshold that's tight enough to catch real leaks
 *     but loose enough to absorb GC jitter on shared CI runners.
 *   - Add scenarios for change streams, transactions, GridFS.
 *
 * See HELP_WANTED.md for the full open list.
 * --------------------------------------------------------------
 *
 * Invocation:
 *   npm run build
 *   node --expose-gc scripts/leak-detection.mjs
 *
 * The `--expose-gc` flag is required so `global.gc()` is available;
 * without it the heap measurement is dominated by uncollected garbage
 * and the result is meaningless.
 *
 * This script imports from `../dist/` and therefore REQUIRES a prior
 * `npm run build`. It is not wired into CI yet — that's the
 * "needs tuning" gate; once the threshold is empirically validated
 * we'll add it as a blocking job.
 *
 * Environment overrides:
 *   LEAK_ITERATIONS    — number of connect/disconnect cycles (default 1000)
 *   LEAK_THRESHOLD_MB  — max acceptable heap delta in MB (default 10)
 */

import {MongoMemoryServer} from 'mongodb-memory-server';
import {MongoConnectionManager} from '../dist/helpers/connection-manager.js';

const ITERATIONS = Number.parseInt(process.env.LEAK_ITERATIONS ?? '1000', 10);
const THRESHOLD_MB = Number.parseFloat(process.env.LEAK_THRESHOLD_MB ?? '10');

function snapshot() {
  if (typeof global.gc === 'function') {
    global.gc();
    global.gc();
  }
  return process.memoryUsage().heapUsed;
}

function toMB(bytes) {
  return bytes / (1024 * 1024);
}

async function main() {
  if (typeof global.gc !== 'function') {
    console.error(
      'ERROR: global.gc is not exposed. Re-run with `node --expose-gc scripts/leak-detection.mjs`.',
    );
    process.exit(2);
  }

  console.log('Booting in-memory MongoDB...');
  const mongod = await MongoMemoryServer.create();
  const url = mongod.getUri();
  console.log(`MongoDB ready at ${url.replace(/:[^:@/]+@/, ':***@')}`);
  console.log(
    `Running ${ITERATIONS} connect/disconnect cycles (threshold ${THRESHOLD_MB} MB)...`,
  );

  try {
    // Warm-up: one cycle to load modules, allocate caches, etc.
    {
      const warm = new MongoConnectionManager({url, database: 'leak_test'});
      await warm.connect();
      await warm.disconnect();
    }

    const before = snapshot();
    const startedAt = Date.now();

    for (let i = 0; i < ITERATIONS; i += 1) {
      const mgr = new MongoConnectionManager({url, database: 'leak_test'});
      await mgr.connect();
      await mgr.disconnect();
      if ((i + 1) % 100 === 0) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        process.stdout.write(`  ${i + 1}/${ITERATIONS}  (${elapsed}s)\n`);
      }
    }

    const after = snapshot();
    const deltaMB = toMB(after - before);
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log('');
    console.log('--- Leak detection results ---');
    console.log(`Iterations:    ${ITERATIONS}`);
    console.log(`Duration:      ${elapsedSec}s`);
    console.log(`Heap before:   ${toMB(before).toFixed(2)} MB`);
    console.log(`Heap after:    ${toMB(after).toFixed(2)} MB`);
    console.log(`Heap delta:    ${deltaMB.toFixed(2)} MB`);
    console.log(`Threshold:     ${THRESHOLD_MB.toFixed(2)} MB`);

    if (deltaMB > THRESHOLD_MB) {
      console.error(
        `FAIL: heap delta ${deltaMB.toFixed(2)} MB exceeds threshold ${THRESHOLD_MB} MB.`,
      );
      process.exitCode = 1;
    } else {
      console.log('PASS: heap delta within threshold.');
    }
  } finally {
    await mongod.stop();
  }
}

main().catch((err) => {
  console.error('Leak detection harness crashed:', err);
  process.exitCode = 2;
});
