/**
 * Property and model mapping helpers for the MongoDB connector.
 *
 * Decimal128 values returned through this connector pass through
 * `parseFloat` and may lose precision outside JS Number range. A
 * `decimalAsString` mode is planned.
 */
import type {Document} from 'mongodb';
import {ObjectId, Binary, Decimal128} from 'mongodb';
import {toObjectId, toDecimal128} from './coercion';

/**
 * Model property definition as stored by the juggler connector.
 *
 * @public
 */
export interface PropertyDefinition {
  type?: unknown;
  mongodb?: {
    fieldName?: string;
    dataType?: string;
  };
  id?: boolean | number;
}

/**
 * Model definition as stored by the juggler connector.
 *
 * @public
 */
export interface ModelDefinition {
  model: {modelName: string};
  properties: Record<string, PropertyDefinition>;
  settings?: Record<string, unknown>;
}

/**
 * Convert a model instance to its database representation.
 * Handles:
 * - Custom field name mappings (property.mongodb.fieldName)
 * - GeoPoint to GeoJSON conversion
 * - Decimal128 coercion
 *
 * @param modelDef - The model definition
 * @param data - The data to convert
 */
export function toDatabase(
  modelDef: ModelDefinition | undefined,
  data: Record<string, unknown>,
): Document {
  if (!modelDef) return data;

  const result: Record<string, unknown> = {};
  const props = modelDef.properties;

  for (const [key, value] of Object.entries(data)) {
    const prop = props[key];
    const dbName = prop?.mongodb?.fieldName ?? key;

    if (prop?.mongodb?.dataType === 'Decimal128' && value != null) {
      result[dbName] = toDecimal128(value);
    } else if (prop?.mongodb?.dataType === 'ObjectId' && value != null) {
      result[dbName] = toObjectId(value);
    } else {
      result[dbName] = value;
    }
  }

  return result;
}

/**
 * Convert a database document to a model instance.
 * Handles:
 * - Custom field name mappings (reverse)
 * - Binary to Buffer conversion
 * - Decimal128 to number conversion
 * - ObjectId to string conversion for non-ObjectId properties
 *
 * @param modelDef - The model definition
 * @param data - The database document
 */
export function fromDatabase(
  modelDef: ModelDefinition | undefined,
  data: Document,
): Record<string, unknown> {
  if (!modelDef || !data) return data as Record<string, unknown>;

  const result: Record<string, unknown> = {};
  const props = modelDef.properties;

  // Build reverse field name mapping
  const reverseMap = new Map<string, string>();
  for (const [propName, prop] of Object.entries(props)) {
    const dbName = prop?.mongodb?.fieldName;
    if (dbName) {
      reverseMap.set(dbName, propName);
    }
  }

  for (const [key, value] of Object.entries(data)) {
    const propName = reverseMap.get(key) ?? key;
    const prop = props[propName];

    if (value instanceof Binary) {
      result[propName] = value.buffer;
    } else if (value instanceof Decimal128) {
      result[propName] = parseFloat(value.toString());
    } else if (value instanceof ObjectId && prop && !isObjectIdProperty(prop)) {
      result[propName] = value.toHexString();
    } else {
      result[propName] = value;
    }
  }

  return result;
}

/**
 * Get the database column name for a model property.
 */
export function getDatabaseColumnName(
  modelDef: ModelDefinition | undefined,
  propertyName: string,
): string {
  if (!modelDef) return propertyName;
  const prop = modelDef.properties[propertyName];
  return prop?.mongodb?.fieldName ?? propertyName;
}

/**
 * Get the ID property name for a model.
 */
export function getIdPropertyName(
  modelDef: ModelDefinition | undefined,
): string {
  if (!modelDef) return 'id';
  for (const [name, prop] of Object.entries(modelDef.properties)) {
    if (prop.id) return name;
  }
  return 'id';
}

function isObjectIdProperty(prop: PropertyDefinition): boolean {
  return prop?.mongodb?.dataType === 'ObjectId';
}
