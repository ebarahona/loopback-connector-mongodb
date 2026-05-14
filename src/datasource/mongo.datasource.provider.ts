import {inject, Provider} from '@loopback/core';
import {juggler} from '@loopback/repository';
import {MongoBindings} from '../keys';
import {MongoConnectionManager} from '../helpers/connection-manager';
import {MongoConnectorConfig} from '../types';
import {MongoDataSource} from './mongo.datasource';

/**
 * Provider that yields a singleton MongoDataSource wired to the
 * shared MongoConnectionManager. Bound by MongoComponent at
 * MongoBindings.DATASOURCE.
 */
export class MongoDataSourceProvider
  implements Provider<juggler.DataSource>
{
  constructor(
    @inject(MongoBindings.CONFIG, {optional: true})
    private config: MongoConnectorConfig | undefined,
    @inject(MongoBindings.CONNECTION_MANAGER)
    private manager: MongoConnectionManager,
  ) {}

  value(): juggler.DataSource {
    return new MongoDataSource(this.config ?? {}, this.manager);
  }
}
