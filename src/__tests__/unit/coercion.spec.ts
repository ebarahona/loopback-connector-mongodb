import {describe, it, expect} from 'vitest';
import {ObjectId, Decimal128} from 'mongodb';
import {
  toObjectId,
  isObjectIdString,
  toDecimal128,
  coerceId,
} from '../../connector/coercion';

describe('toObjectId', () => {
  it('returns ObjectId instances unchanged', () => {
    const oid = new ObjectId();
    expect(toObjectId(oid)).toBe(oid);
  });

  it('converts 24-char hex strings to ObjectId', () => {
    const hex = '507f1f77bcf86cd799439011';
    const result = toObjectId(hex);
    expect(result).toBeInstanceOf(ObjectId);
    expect((result as ObjectId).toHexString()).toBe(hex);
  });

  it('returns non-hex strings unchanged', () => {
    expect(toObjectId('not-an-id')).toBe('not-an-id');
  });

  it('returns numbers unchanged', () => {
    expect(toObjectId(42)).toBe(42);
  });

  it('returns null unchanged', () => {
    expect(toObjectId(null)).toBeNull();
  });
});

describe('isObjectIdString', () => {
  it('returns true for valid ObjectId strings', () => {
    expect(isObjectIdString('507f1f77bcf86cd799439011')).toBe(true);
  });

  it('returns false for non-hex strings', () => {
    expect(isObjectIdString('not-hex')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(isObjectIdString(42)).toBe(false);
  });
});

describe('toDecimal128', () => {
  it('converts numbers to Decimal128', () => {
    const result = toDecimal128(42.5);
    expect(result).toBeInstanceOf(Decimal128);
    expect((result as Decimal128).toString()).toBe('42.5');
  });

  it('converts numeric strings to Decimal128', () => {
    const result = toDecimal128('99.99');
    expect(result).toBeInstanceOf(Decimal128);
  });

  it('returns Decimal128 instances unchanged', () => {
    const d = Decimal128.fromString('10');
    expect(toDecimal128(d)).toBe(d);
  });

  it('returns non-numeric strings unchanged', () => {
    expect(toDecimal128('abc')).toBe('abc');
  });
});

describe('coerceId', () => {
  it('returns null/undefined unchanged', () => {
    expect(coerceId(null)).toBeNull();
    expect(coerceId(undefined)).toBeUndefined();
  });

  it('coerces when property is marked as ObjectId', () => {
    const hex = '507f1f77bcf86cd799439011';
    const result = coerceId(hex, {mongodb: {dataType: 'ObjectId'}});
    expect(result).toBeInstanceOf(ObjectId);
  });

  it('auto-coerces in lenient mode', () => {
    const hex = '507f1f77bcf86cd799439011';
    const result = coerceId(hex, undefined, false);
    expect(result).toBeInstanceOf(ObjectId);
  });

  it('does not auto-coerce in strict mode', () => {
    const hex = '507f1f77bcf86cd799439011';
    const result = coerceId(hex, undefined, true);
    expect(result).toBe(hex);
  });
});
