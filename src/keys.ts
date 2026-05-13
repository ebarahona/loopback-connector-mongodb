import {BindingKey} from '@loopback/core';
import type {MongoClient} from 'mongodb';
import type {MongoService} from './services/mongo.service';
import type {MongoConnectorConfig} from './types';

export namespace MongoBindings {
  /**
   * Binding key for the shared MongoClient singleton.
   */
  export const CLIENT = BindingKey.create<MongoClient>(
    'mongo.client',
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
}
