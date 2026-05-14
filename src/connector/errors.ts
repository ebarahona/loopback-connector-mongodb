/**
 * Error thrown for connector-level failures that aren't config or
 * driver errors (allowlist denial, unknown command, missing document
 * after update, invalid query operator operand). Always wraps the
 * underlying issue in a typed name consumers can match via
 * `instanceof` or `error.name`.
 *
 * @public
 */
export class MongoConnectorError extends Error {
  override readonly name = 'MongoConnectorError';
  constructor(message: string) {
    super(message);
  }
}
