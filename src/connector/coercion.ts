import {ObjectId, Decimal128, Binary} from 'mongodb';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Coerce a value to ObjectId if it matches the 24-char hex pattern.
 * Returns the original value if it's not a valid ObjectId string.
 */
export function toObjectId(value: unknown): unknown {
  if (value instanceof ObjectId) return value;
  if (typeof value === 'string' && OBJECT_ID_REGEX.test(value)) {
    return new ObjectId(value);
  }
  return value;
}

/**
 * Check if a value is a valid ObjectId hex string.
 */
export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_REGEX.test(value);
}

/**
 * Coerce a value to Decimal128 if it's a number or numeric string.
 */
export function toDecimal128(value: unknown): unknown {
  if (value instanceof Decimal128) return value;
  if (typeof value === 'number') return Decimal128.fromString(String(value));
  if (typeof value === 'string') {
    try {
      return Decimal128.fromString(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Convert a Binary value to a Buffer.
 */
export function binaryToBuffer(value: unknown): unknown {
  if (value instanceof Binary) {
    return value.buffer;
  }
  return value;
}

/**
 * Coerce ID values for a model based on property definitions.
 *
 * @param idValue - The ID value to coerce
 * @param idProp - The property definition for the ID field
 * @param strict - If true, only coerce when explicitly marked as ObjectId
 */
export function coerceId(
  idValue: unknown,
  idProp?: {mongodb?: {dataType?: string}; type?: unknown},
  strict = false,
): unknown {
  if (idValue === null || idValue === undefined) return idValue;

  // Explicitly marked as ObjectId
  if (idProp?.mongodb?.dataType === 'ObjectId') {
    return toObjectId(idValue);
  }

  // Strict mode: only coerce if explicitly marked
  if (strict) return idValue;

  // Lenient mode: auto-coerce 24-char hex strings
  return toObjectId(idValue);
}
