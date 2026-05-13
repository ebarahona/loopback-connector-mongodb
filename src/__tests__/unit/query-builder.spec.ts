import {describe, it, expect} from 'vitest';
import {buildWhere, buildSort, buildFields} from '../../connector/query-builder';
import {ObjectId} from 'mongodb';

describe('buildWhere', () => {
  it('returns empty object for undefined', () => {
    expect(buildWhere(undefined)).toEqual({});
  });

  it('handles simple equality', () => {
    expect(buildWhere({name: 'test'})).toEqual({name: 'test'});
  });

  it('maps id to _id', () => {
    const result = buildWhere({id: 'abc'});
    expect(result._id).toBe('abc');
    expect(result.id).toBeUndefined();
  });

  it('coerces ObjectId strings for _id', () => {
    const hex = '507f1f77bcf86cd799439011';
    const result = buildWhere({id: hex});
    expect(result._id).toBeInstanceOf(ObjectId);
  });

  it('handles gt/gte/lt/lte operators', () => {
    expect(buildWhere({total: {gt: 100}})).toEqual({
      total: {$gt: 100},
    });
    expect(buildWhere({total: {gte: 50, lte: 200}})).toEqual({
      total: {$gte: 50, $lte: 200},
    });
  });

  it('handles neq operator', () => {
    expect(buildWhere({status: {neq: 'cancelled'}})).toEqual({
      status: {$ne: 'cancelled'},
    });
  });

  it('handles between operator', () => {
    expect(buildWhere({total: {between: [10, 50]}})).toEqual({
      total: {$gte: 10, $lte: 50},
    });
  });

  it('handles inq operator', () => {
    expect(buildWhere({status: {inq: ['a', 'b']}})).toEqual({
      status: {$in: ['a', 'b']},
    });
  });

  it('handles nin operator', () => {
    expect(buildWhere({status: {nin: ['x']}})).toEqual({
      status: {$nin: ['x']},
    });
  });

  it('handles like operator', () => {
    const result = buildWhere({name: {like: 'test'}});
    expect(result.name).toEqual({$regex: /test/});
  });

  it('handles nlike operator', () => {
    const result = buildWhere({name: {nlike: 'bad'}});
    expect(result.name).toEqual({$not: /bad/});
  });

  it('handles regexp operator', () => {
    const result = buildWhere({name: {regexp: '^test'}});
    expect(result.name).toEqual({$regex: /^test/});
  });

  it('handles exists operator', () => {
    expect(buildWhere({email: {exists: true}})).toEqual({
      email: {$exists: true},
    });
  });

  it('handles and/or/nor logical operators', () => {
    const result = buildWhere({
      and: [{status: 'active'}, {total: {gt: 0}}],
    });
    expect(result.$and).toEqual([
      {status: 'active'},
      {total: {$gt: 0}},
    ]);
  });

  it('handles null values', () => {
    expect(buildWhere({name: null})).toEqual({name: null});
  });

  it('passes through $ operators', () => {
    const result = buildWhere({
      tags: {$elemMatch: {name: 'test'}},
    });
    expect(result.tags).toEqual({$elemMatch: {name: 'test'}});
  });
});

describe('buildSort', () => {
  it('returns undefined for no order', () => {
    expect(buildSort(undefined)).toBeUndefined();
  });

  it('handles single ascending order', () => {
    expect(buildSort('name ASC')).toEqual({name: 1});
  });

  it('handles single descending order', () => {
    expect(buildSort('date DESC')).toEqual({date: -1});
  });

  it('handles multiple orders', () => {
    expect(buildSort(['name ASC', 'date DESC'])).toEqual({
      name: 1,
      date: -1,
    });
  });

  it('defaults to ascending', () => {
    expect(buildSort('name')).toEqual({name: 1});
  });

  it('maps id to _id', () => {
    expect(buildSort('id ASC')).toEqual({_id: 1});
  });
});

describe('buildFields', () => {
  it('returns undefined for no fields', () => {
    expect(buildFields(undefined)).toBeUndefined();
  });

  it('handles array of field names', () => {
    expect(buildFields(['name', 'email'])).toEqual({
      name: 1,
      email: 1,
    });
  });

  it('handles object with boolean values', () => {
    expect(buildFields({name: true, password: false})).toEqual({
      name: 1,
      password: 0,
    });
  });

  it('maps id to _id', () => {
    expect(buildFields(['id', 'name'])).toEqual({
      _id: 1,
      name: 1,
    });
  });
});
