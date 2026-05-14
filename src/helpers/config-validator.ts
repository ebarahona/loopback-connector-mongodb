import type {MongoConnectorConfig} from '../types';

/**
 * Error thrown when the connector config fails framework-level
 * validation before any MongoDB driver call is made.
 *
 * Messages never contain credentials -- the offending URL or
 * config object is redacted before formatting.
 *
 * @public
 */
export class MongoConfigError extends Error {
  override readonly name = 'MongoConfigError';
  constructor(message: string) {
    super(message);
  }
}

const SUPPORTED_SCHEMES = new Set(['mongodb:', 'mongodb+srv:']);

/**
 * Validate connector config. Throws MongoConfigError for cases the
 * driver would otherwise surface as opaque runtime errors:
 * - neither `url` nor `host` set
 * - `url` is not a parseable mongodb:// or mongodb+srv:// URL
 *
 * Everything else (auth shape, TLS, pool sizing) is passed through
 * to the driver, which has good error messages for those.
 *
 * @public
 */
export function validateConfig(config: MongoConnectorConfig | undefined): void {
  if (!config) {
    throw new MongoConfigError(
      'MongoDB config is missing. Bind MongoBindings.CONFIG or ' +
        'pass settings to the DataSource.',
    );
  }

  if (!config.url && !config.host) {
    throw new MongoConfigError(
      'MongoDB config requires either `url` or `host`. Got neither.',
    );
  }

  if (config.url) {
    let parsed: URL;
    try {
      parsed = new URL(config.url);
    } catch {
      throw new MongoConfigError(
        `MongoDB url is not a valid URL: ${redactUrl(config.url)}`,
      );
    }
    if (!SUPPORTED_SCHEMES.has(parsed.protocol)) {
      throw new MongoConfigError(
        `MongoDB url scheme must be mongodb:// or mongodb+srv://, ` +
          `got "${parsed.protocol}" in ${redactUrl(config.url)}`,
      );
    }
  }
}

/**
 * Replace `username:password@` with `<credentials>@` in a connection
 * string. Safe to log.
 *
 * @public
 */
export function redactUrl(url: string): string {
  return url.replace(/\/\/[^@/]+@/, '//<credentials>@');
}
