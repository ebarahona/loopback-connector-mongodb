import {inject, Provider} from '@loopback/core';
import {MongoClient} from 'mongodb';
import debugFactory from 'debug';
import {MongoBindings} from '../keys';
import {MongoConnectorConfig} from '../types';

const debug = debugFactory('loopback:connector:mongodb:client');

/**
 * Provider for a singleton MongoClient instance.
 *
 * Creates the client from configuration but does NOT connect it.
 * Connection is handled by the connector's connect() method or
 * lazily on first operation.
 *
 * The same MongoClient is shared between the connector and
 * the MongoService.
 */
export class MongoClientProvider implements Provider<MongoClient> {
  constructor(
    @inject(MongoBindings.CONFIG, {optional: true})
    private config?: MongoConnectorConfig,
  ) {}

  value(): MongoClient {
    const url = this.buildUrl();
    debug('creating MongoClient for %s', url.replace(/\/\/[^@]*@/, '//<credentials>@'));
    return new MongoClient(url, this.config?.clientOptions);
  }

  private buildUrl(): string {
    if (this.config?.url) return this.config.url;

    const host = this.config?.host ?? 'localhost';
    const port = this.config?.port ?? 27017;
    const database = this.config?.database ?? 'test';

    let auth = '';
    if (this.config?.username && this.config?.password) {
      const user = encodeURIComponent(this.config.username);
      const pass = encodeURIComponent(this.config.password);
      auth = `${user}:${pass}@`;
    }

    let params = '';
    if (this.config?.authSource) {
      params = `?authSource=${this.config.authSource}`;
    }
    if (this.config?.replicaSet) {
      const sep = params ? '&' : '?';
      params += `${sep}replicaSet=${this.config.replicaSet}`;
    }

    return `mongodb://${auth}${host}:${port}/${database}${params}`;
  }
}
