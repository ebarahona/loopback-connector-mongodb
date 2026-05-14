import {BindingKey} from '@loopback/core';
import type {juggler} from '@loopback/repository';
import type {MongoService} from './services/mongo.service';
import type {MongoConnectorConfig} from './types';
import type {MongoConnectionManager} from './helpers/connection-manager';

export namespace MongoBindings {
  /**
   * Binding key for the shared MongoConnectionManager singleton.
   * Owns the MongoClient and connection lifecycle.
   */
  export const CONNECTION_MANAGER =
    BindingKey.create<MongoConnectionManager>(
      'mongo.connection-manager',
    );

  /**
   * Binding key for the MongoService.
   */
  export const SERVICE = BindingKey.create<MongoService>(
    'mongo.service',
  );

  /**
   * Binding key for the connector configuration.
   */
  export const CONFIG = BindingKey.create<MongoConnectorConfig>(
    'mongo.config',
  );

  /**
   * Binding key for the shared juggler DataSource. The connector
   * behind it uses the shared MongoConnectionManager, so repositories
   * and MongoService share one connection pool.
   */
  export const DATASOURCE = BindingKey.create<juggler.DataSource>(
    'datasources.mongo',
  );
}
