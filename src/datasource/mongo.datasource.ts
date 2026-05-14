import {juggler} from '@loopback/repository';
import {ObjectId} from 'mongodb';
import {MongoConnector} from '../connector/mongo.connector';
import {MongoConnectionManager} from '../helpers/connection-manager';
import {MongoConnectorConfig} from '../types';

/**
 * A juggler DataSource whose underlying connector uses a shared
 * MongoConnectionManager. Repositories built on this DataSource
 * share one connection pool with MongoService.
 *
 * Lifecycle is owned by the shared manager (MongoComponent's
 * lifecycle observer). Calling `disconnect()` on the underlying
 * connector is a no-op.
 */
export class MongoDataSource extends juggler.DataSource {
  constructor(
    config: MongoConnectorConfig,
    connectionManager: MongoConnectionManager,
  ) {
    const connector = new MongoConnector(config, connectionManager);
    super({
      name: 'mongo',
      ...config,
      connector,
    });
    // juggler.DataSource only assigns `this.connector` when it
    // resolves the connector via an initialize() module. We pass
    // a fully constructed connector instance, so wire it directly.
    (this as unknown as {connector: MongoConnector}).connector =
      connector;
    connector.dataSource = this as unknown as Record<string, unknown>;
    (this as unknown as Record<string, unknown>).ObjectID = ObjectId;

    // The shared MongoConnectionManager owns the real connection.
    // Tell the juggler this DataSource is already connected so
    // repository operations don't hang waiting for juggler's own
    // connect flow.
    (this as unknown as {connected: boolean}).connected = true;
  }
}
