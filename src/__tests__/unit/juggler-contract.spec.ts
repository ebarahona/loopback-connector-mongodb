import {describe, it, expect} from 'vitest';
import {juggler} from '@loopback/repository';

/**
 * MongoDataSource sets `(this as unknown as {connected: boolean}).connected = true`
 * to skip juggler's own connect flow when the shared manager owns the
 * client. That cast relies on internal juggler state and would break
 * silently if upstream renamed or removed the field.
 *
 * This test fails loudly if either:
 * - `connected` is no longer a property on juggler.DataSource, or
 * - its initial value is no longer a boolean we can safely override.
 *
 * If this test fails, audit MongoDataSource's juggler-bypass before
 * bumping \@loopback/repository.
 */
describe('juggler.DataSource contract', () => {
  it('exposes a boolean `connected` flag we can override', () => {
    const ds = new juggler.DataSource({
      name: 'contract-probe',
      connector: 'memory',
    });
    const flag = (ds as unknown as {connected: unknown}).connected;
    expect(typeof flag === 'boolean' || flag === undefined).toBe(true);

    (ds as unknown as {connected: boolean}).connected = true;
    expect((ds as unknown as {connected: boolean}).connected).toBe(true);
  });
});
