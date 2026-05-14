import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests each spin up their own mongod via
    // mongodb-memory-server. Running them in parallel saturates
    // CPU and makes time-sensitive change-stream assertions flake.
    // Unit tests run in the same pool with no measurable impact.
    pool: 'threads',
    minWorkers: 1,
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
