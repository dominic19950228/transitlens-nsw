import { describe, it, expect } from 'vitest';
import { DEFAULT_CONNECTION_LIMIT, MAX_CONNECTION_LIMIT, parseDbEnv } from './env';

const baseEnv = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'root',
  DB_NAME: 'nsw_transit',
};

describe('parseDbEnv', () => {
  it('parses a valid environment into a typed pool config', () => {
    const config = parseDbEnv({ ...baseEnv, DB_PASSWORD: 'secret' });

    expect(config).toEqual({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: 'secret',
      database: 'nsw_transit',
      connectionLimit: DEFAULT_CONNECTION_LIMIT,
    });
  });

  it('defaults the password to an empty string', () => {
    expect(parseDbEnv({ ...baseEnv }).password).toBe('');
  });

  it('honours an explicit connection limit', () => {
    expect(parseDbEnv({ ...baseEnv, DB_CONNECTION_LIMIT: '10' }).connectionLimit).toBe(10);
  });

  it('reports every missing required variable in one error', () => {
    expect(() => parseDbEnv({ DB_PORT: '3306' })).toThrow(/DB_HOST/);
    expect(() => parseDbEnv({ DB_HOST: 'localhost', DB_PORT: '3306' })).toThrow(/DB_USER/);
    expect(() => parseDbEnv({ ...baseEnv, DB_NAME: '' })).toThrow(/DB_NAME/);
  });

  it('rejects invalid ports', () => {
    expect(() => parseDbEnv({ ...baseEnv, DB_PORT: 'abc' })).toThrow(/DB_PORT/);
    expect(() => parseDbEnv({ ...baseEnv, DB_PORT: '70000' })).toThrow(/DB_PORT/);
  });

  it('rejects an out-of-range connection limit', () => {
    expect(() => parseDbEnv({ ...baseEnv, DB_CONNECTION_LIMIT: '0' })).toThrow(/DB_CONNECTION_LIMIT/);
    expect(() =>
      parseDbEnv({ ...baseEnv, DB_CONNECTION_LIMIT: String(MAX_CONNECTION_LIMIT + 1) })
    ).toThrow(/DB_CONNECTION_LIMIT/);
  });
});
