import {inject, Provider} from '@loopback/core';
import {juggler} from '@loopback/repository';
import {MongoBindings} from '../keys';
import {MongoConnectionManager} from '../helpers/connection-manager';
import {MongoConnectorConfig} from '../types';
import {MongoDataSource} from './mongo.datasource';

/**
 * Factory for building per-tenant or per-database MongoDataSources
 * that share the singleton MongoConnectionManager (one MongoClient,
 * one pool).
 *
 * Pass `{database: 'tenant_42'}` (or any other override) to target
 * a different database on the same cluster without opening a new
 * connection. Useful for multi-tenant deployments where each tenant
 * gets its own database.
 *
 * @public
 */
export type MongoDataSourceFactory = (
  override?: Partial<MongoConnectorConfig>,
) => juggler.DataSource;

/**
 * Provider that yields a MongoDataSourceFactory bound at
 * `MongoBindings.DATASOURCE_FACTORY`. Each call constructs a new
 * MongoDataSource wired to the shared MongoConnectionManager.
 *
 * @public
 */
export class MongoDataSourceFactoryProvider implements Provider<MongoDataSourceFactory> {
  constructor(
    @inject(MongoBindings.CONFIG, {optional: true})
    private config: MongoConnectorConfig | undefined,
    @inject(MongoBindings.CONNECTION_MANAGER)
    private manager: MongoConnectionManager,
  ) {}

  value(): MongoDataSourceFactory {
    const base = this.config ?? {};
    const manager = this.manager;
    return (override?: Partial<MongoConnectorConfig>) =>
      new MongoDataSource({...base, ...(override ?? {})}, manager);
  }
}
