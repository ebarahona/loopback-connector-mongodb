import {describe, it, expect} from 'vitest';
import {
  MongoConfigError,
  validateConfig,
  redactUrl,
} from '../../helpers/config-validator';

describe('validateConfig', () => {
  it('throws when config is undefined', () => {
    expect(() => validateConfig(undefined)).toThrow(MongoConfigError);
  });

  it('throws when neither url nor host is set', () => {
    expect(() => validateConfig({})).toThrow(/url.*host/);
  });

  it('accepts a mongodb:// url', () => {
    expect(() =>
      validateConfig({url: 'mongodb://localhost:27017/test'}),
    ).not.toThrow();
  });

  it('accepts a mongodb+srv:// url', () => {
    expect(() =>
      validateConfig({url: 'mongodb+srv://cluster.example.net/test'}),
    ).not.toThrow();
  });

  it('accepts host without url', () => {
    expect(() =>
      validateConfig({host: 'localhost', port: 27017}),
    ).not.toThrow();
  });

  it('throws on malformed url', () => {
    expect(() => validateConfig({url: 'not a url'})).toThrow(MongoConfigError);
  });

  it('throws on wrong scheme', () => {
    expect(() => validateConfig({url: 'http://localhost:27017/test'})).toThrow(
      /scheme/,
    );
  });

  it('never leaks credentials in error messages', () => {
    try {
      validateConfig({url: 'http://user:secret@host/db'});
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain('secret');
      expect(msg).not.toContain('user');
      expect(msg).toContain('<credentials>');
    }
  });
});

describe('redactUrl', () => {
  it('redacts user:password in mongodb:// urls', () => {
    expect(redactUrl('mongodb://alice:hunter2@host:27017/db')).toBe(
      'mongodb://<credentials>@host:27017/db',
    );
  });

  it('redacts user:password in mongodb+srv:// urls', () => {
    expect(
      redactUrl('mongodb+srv://alice:hunter2@cluster.example.net/db'),
    ).toBe('mongodb+srv://<credentials>@cluster.example.net/db');
  });

  it('leaves urls without credentials untouched', () => {
    expect(redactUrl('mongodb://localhost:27017/db')).toBe(
      'mongodb://localhost:27017/db',
    );
  });
});
