import type {Document, Filter, Sort} from 'mongodb';
import {toObjectId} from './coercion';

/**
 * Convert a LoopBack where filter to a MongoDB query document.
 *
 * Supports:
 * - Simple equality: {name: 'test'}
 * - Comparison operators: gt, gte, lt, lte, neq, between
 * - Array operators: inq, nin
 * - String operators: like, nlike, regexp
 * - Logical operators: and, or, nor
 * - Existence: exists
 * - Null type matching
 *
 * @param where - LoopBack where filter
 * @param idName - The model's ID property name (mapped to _id)
 */
export function buildWhere(
  where: Record<string, unknown> | undefined,
  idName = 'id',
): Filter<Document> {
  if (!where) return {};

  const query: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(where)) {
    // Logical operators
    if (key === 'and' || key === 'or' || key === 'nor') {
      if (!Array.isArray(value)) {
        throw new Error(`"${key}" operator requires an array`);
      }
      const conditions = value as Record<string, unknown>[];
      query[`$${key}`] = conditions.map(c => buildWhere(c, idName));
      continue;
    }

    // Map id property to _id
    const fieldName = key === idName ? '_id' : key;

    if (value === null || value === undefined) {
      query[fieldName] = null;
      continue;
    }

    if (typeof value !== 'object' || value instanceof Date) {
      // Simple equality
      query[fieldName] =
        fieldName === '_id' ? toObjectId(value) : value;
      continue;
    }

    // Operator expressions
    const spec = value as Record<string, unknown>;
    const mongoExpr: Record<string, unknown> = {};
    let hasOperator = false;
    let allKeysAreOperators = true;

    for (const [op, operand] of Object.entries(spec)) {
      let matched = true;
      switch (op) {
        case 'gt':
          mongoExpr.$gt = fieldName === '_id' ? toObjectId(operand) : operand;
          break;
        case 'gte':
          mongoExpr.$gte = fieldName === '_id' ? toObjectId(operand) : operand;
          break;
        case 'lt':
          mongoExpr.$lt = fieldName === '_id' ? toObjectId(operand) : operand;
          break;
        case 'lte':
          mongoExpr.$lte = fieldName === '_id' ? toObjectId(operand) : operand;
          break;
        case 'neq':
          mongoExpr.$ne = fieldName === '_id' ? toObjectId(operand) : operand;
          break;
        case 'between':
          if (!Array.isArray(operand) || operand.length !== 2) {
            throw new Error(
              `"between" operator requires a 2-element array, got: ${JSON.stringify(operand)}`,
            );
          }
          mongoExpr.$gte = operand[0];
          mongoExpr.$lte = operand[1];
          break;
        case 'inq':
          mongoExpr.$in = Array.isArray(operand)
            ? operand.map(v =>
                fieldName === '_id' ? toObjectId(v) : v,
              )
            : operand;
          break;
        case 'nin':
          mongoExpr.$nin = Array.isArray(operand)
            ? operand.map(v =>
                fieldName === '_id' ? toObjectId(v) : v,
              )
            : operand;
          break;
        case 'like':
          mongoExpr.$regex = new RegExp(
            escapeRegex(String(operand)),
          );
          break;
        case 'nlike':
          mongoExpr.$not = new RegExp(
            escapeRegex(String(operand)),
          );
          break;
        case 'regexp':
          if (operand instanceof RegExp) {
            mongoExpr.$regex = operand;
          } else {
            mongoExpr.$regex = new RegExp(String(operand));
          }
          break;
        case 'exists':
          mongoExpr.$exists = Boolean(operand);
          break;
        default:
          if (op.startsWith('$')) {
            // Pass through native operators (e.g. $elemMatch, $size)
            mongoExpr[op] = operand;
          } else {
            matched = false;
          }
          break;
      }
      if (matched) {
        hasOperator = true;
      } else {
        allKeysAreOperators = false;
      }
    }

    if (hasOperator && allKeysAreOperators) {
      query[fieldName] = mongoExpr;
    } else {
      // Plain object value (equality match). Includes the
      // mixed case where some keys look like operators but
      // others do not -- safer to treat as a literal match
      // than to silently drop the non-operator keys.
      query[fieldName] =
        fieldName === '_id' ? toObjectId(value) : value;
    }
  }

  return query as Filter<Document>;
}

/**
 * Convert a LoopBack order specification to a MongoDB sort document.
 *
 * @param order - LoopBack order string or array
 *   - 'name ASC'
 *   - 'name DESC'
 *   - ['name ASC', 'date DESC']
 * @param idName - The model's ID property name
 */
export function buildSort(
  order: string | string[] | undefined,
  idName = 'id',
): Sort | undefined {
  if (!order) return undefined;

  const orders = Array.isArray(order) ? order : [order];
  const sort: Record<string, 1 | -1> = {};

  for (const item of orders) {
    const parts = item.trim().split(/\s+/);
    let field = parts[0];
    const direction =
      parts[1]?.toUpperCase() === 'DESC' ? -1 : 1;

    if (field === idName) field = '_id';
    sort[field] = direction as 1 | -1;
  }

  return sort;
}

/**
 * Convert a LoopBack fields filter to a MongoDB projection.
 *
 * @param fields - LoopBack fields specification
 *   - ['name', 'email'] (include only)
 *   - {name: true, email: true} (include)
 *   - {password: false} (exclude)
 * @param idName - The model's ID property name
 */
export function buildFields(
  fields: string[] | Record<string, boolean> | undefined,
  idName = 'id',
): Document | undefined {
  if (!fields) return undefined;

  const projection: Record<string, 0 | 1> = {};

  if (Array.isArray(fields)) {
    for (let field of fields) {
      if (field === idName) field = '_id';
      projection[field] = 1;
    }
  } else {
    for (let [field, include] of Object.entries(fields)) {
      if (field === idName) field = '_id';
      projection[field] = include ? 1 : 0;
    }
  }

  return projection;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
