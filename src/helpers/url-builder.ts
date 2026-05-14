import type {MongoConnectorConfig} from '../types';

/**
 * Build a MongoDB connection URL from config.
 * Single source of truth -- used by both the connection manager
 * and the juggler initialize path.
 */
export function buildConnectionUrl(config: MongoConnectorConfig): string {
  if (config.url) return config.url;

  const host = config.host ?? 'localhost';
  const port = config.port ?? 27017;
  const database = config.database ?? 'test';

  let auth = '';
  if (config.username && config.password) {
    const user = encodeURIComponent(config.username);
    const pass = encodeURIComponent(config.password);
    auth = `${user}:${pass}@`;
  }

  const params = new URLSearchParams();
  if (config.authSource) params.set('authSource', config.authSource);
  if (config.replicaSet) params.set('replicaSet', config.replicaSet);

  const queryString = params.toString();
  const suffix = queryString ? `?${queryString}` : '';

  return `mongodb://${auth}${host}:${port}/${database}${suffix}`;
}
