import type {MongoClientOptions} from 'mongodb';

/**
 * Configuration for the MongoDB connector and service.
 */
export interface MongoConnectorConfig {
  /**
   * MongoDB connection string.
   * Supports mongodb:// and mongodb+srv:// schemes.
   */
  url?: string;

  /**
   * Default database name. Used when no database is specified
   * in the connection string.
   */
  database?: string;

  /**
   * Host for connection (used when url is not provided).
   */
  host?: string;

  /**
   * Port for connection (used when url is not provided).
   * @defaultValue 27017
   */
  port?: number;

  /**
   * Username for authentication.
   */
  username?: string;

  /**
   * Password for authentication.
   */
  password?: string;

  /**
   * Authentication source database.
   */
  authSource?: string;

  /**
   * Replica set name.
   */
  replicaSet?: string;

  /**
   * Native MongoClient options passed directly to the driver.
   */
  clientOptions?: MongoClientOptions;

  /**
   * Enable lazy connection. If true, connection is deferred
   * until the first operation. Only applies when using the
   * connector via juggler DataSource, not via MongoComponent.
   * @defaultValue false
   */
  lazyConnect?: boolean;

  /**
   * Enable debug logging.
   * @defaultValue false
   */
  debug?: boolean;

  /**
   * Enable extended operators ($inc, $set, $push, etc.)
   * in update operations.
   * @defaultValue true
   */
  allowExtendedOperators?: boolean;

  /**
   * Enable GeoPoint indexing support.
   * @defaultValue false
   */
  enableGeoIndexing?: boolean;

  /**
   * Coerce ObjectId strings strictly. When true, only properties
   * explicitly marked with mongodb.dataType: 'ObjectId' are coerced.
   * When false, any 24-char hex string is auto-coerced.
   * @defaultValue false
   */
  strictObjectIDCoercion?: boolean;

  /**
   * Connector name override.
   */
  connector?: string;

  /**
   * Name for this connector instance.
   */
  name?: string;
}
