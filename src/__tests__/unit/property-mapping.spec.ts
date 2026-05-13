import {describe, it, expect} from 'vitest';
import {ObjectId, Decimal128, Binary, Document} from 'mongodb';
import {
  toDatabase,
  fromDatabase,
  getIdPropertyName,
  getDatabaseColumnName,
  ModelDefinition,
} from '../../connector/property-mapping';

const testModel: ModelDefinition = {
  model: {modelName: 'TestModel'},
  properties: {
    id: {type: String, id: true},
    name: {type: String},
    amount: {type: Number, mongodb: {dataType: 'Decimal128'}},
    refId: {type: String, mongodb: {dataType: 'ObjectId'}},
    customField: {type: String, mongodb: {fieldName: 'custom_field'}},
  },
};

describe('toDatabase', () => {
  it('maps property names to custom field names', () => {
    const result = toDatabase(testModel, {customField: 'test'});
    expect(result.custom_field).toBe('test');
    expect(result.customField).toBeUndefined();
  });

  it('coerces Decimal128 properties', () => {
    const result = toDatabase(testModel, {amount: 99.99});
    expect(result.amount).toBeInstanceOf(Decimal128);
  });

  it('coerces ObjectId properties', () => {
    const hex = '507f1f77bcf86cd799439011';
    const result = toDatabase(testModel, {refId: hex});
    expect(result.refId).toBeInstanceOf(ObjectId);
  });

  it('passes through regular values', () => {
    const result = toDatabase(testModel, {name: 'hello'});
    expect(result.name).toBe('hello');
  });

  it('handles undefined model definition', () => {
    const data = {a: 1, b: 2};
    const result = toDatabase(undefined, data);
    expect(result).toEqual(data);
  });
});

describe('fromDatabase', () => {
  it('reverses custom field name mappings', () => {
    const result = fromDatabase(testModel, {custom_field: 'test'});
    expect(result.customField).toBe('test');
  });

  it('converts Binary to Buffer', () => {
    const bin = new Binary(Buffer.from('hello'));
    const result = fromDatabase(testModel, {name: bin});
    expect(Buffer.isBuffer(result.name)).toBe(true);
  });

  it('converts Decimal128 to number', () => {
    const dec = Decimal128.fromString('99.99');
    const result = fromDatabase(testModel, {amount: dec});
    expect(result.amount).toBe(99.99);
  });

  it('converts ObjectId to string for non-ObjectId properties', () => {
    const oid = new ObjectId();
    const result = fromDatabase(testModel, {name: oid});
    expect(typeof result.name).toBe('string');
  });

  it('keeps ObjectId for ObjectId-typed properties', () => {
    const oid = new ObjectId();
    const result = fromDatabase(testModel, {refId: oid});
    expect(result.refId).toBeInstanceOf(ObjectId);
  });

  it('handles null data', () => {
    const result = fromDatabase(testModel, null as unknown as Document);
    expect(result).toBeNull();
  });

  it('handles undefined model definition', () => {
    const data = {a: 1};
    const result = fromDatabase(undefined, data);
    expect(result).toEqual(data);
  });
});

describe('getIdPropertyName', () => {
  it('returns the id property name', () => {
    expect(getIdPropertyName(testModel)).toBe('id');
  });

  it('returns "id" as default', () => {
    expect(getIdPropertyName(undefined)).toBe('id');
  });

  it('returns "id" when no property has id: true', () => {
    const model: ModelDefinition = {
      model: {modelName: 'NoId'},
      properties: {name: {type: String}},
    };
    expect(getIdPropertyName(model)).toBe('id');
  });
});

describe('getDatabaseColumnName', () => {
  it('returns custom field name', () => {
    expect(getDatabaseColumnName(testModel, 'customField')).toBe('custom_field');
  });

  it('returns property name when no mapping', () => {
    expect(getDatabaseColumnName(testModel, 'name')).toBe('name');
  });

  it('returns property name for undefined model', () => {
    expect(getDatabaseColumnName(undefined, 'test')).toBe('test');
  });
});
