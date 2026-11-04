import { parseEnv, z } from '@fphd/config';
import { describe, expect, it } from 'vitest';

import { dbAuthEnvFields, dbEnvFields, resolveDbLogin, resolveDbTls } from './env.ts';

describe('dbEnvFields', () => {
  const schema = z.object(dbEnvFields);

  it('defaults to the local docker compose database', () => {
    expect(parseEnv(schema, {})).toEqual({
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      POSTGRES_DB: 'fphd',
    });
  });

  it('reads overrides from the environment', () => {
    expect(
      parseEnv(schema, { DB_HOST: 'db.internal', DB_PORT: '5433', POSTGRES_DB: 'fphd_test' }),
    ).toEqual({
      DB_HOST: 'db.internal',
      DB_PORT: 5433,
      POSTGRES_DB: 'fphd_test',
    });
  });

  it('rejects an invalid DB_PORT with a clear config error', () => {
    expect(() => parseEnv(schema, { DB_PORT: 'abc' })).toThrow(/DB_PORT/);
  });

  it('leaves DB_TLS undefined when unset, so the APP_ENV default decides', () => {
    expect(parseEnv(schema, {}).DB_TLS).toBeUndefined();
    expect(parseEnv(schema, { DB_TLS: '1' }).DB_TLS).toBe(true);
    expect(parseEnv(schema, { DB_TLS: 'false' }).DB_TLS).toBe(false);
  });
});

describe('resolveDbTls', () => {
  it('is off only where the database runs on this machine', () => {
    expect(resolveDbTls('local', undefined)).toBe(false);
    expect(resolveDbTls('test', undefined)).toBe(false);
  });

  it('is on for an environment it has never heard of', () => {
    // appEnvSchema is what rejects an unknown value; if one ever reaches here the safe
    // reading is that it is deployed.
    expect(resolveDbTls('staging' as never, undefined)).toBe(true);
  });

  it('is on for every deployed environment', () => {
    expect(resolveDbTls('dev', undefined)).toBe(true);
    expect(resolveDbTls('preview', undefined)).toBe(true);
    expect(resolveDbTls('production', undefined)).toBe(true);
  });

  it('lets DB_TLS override the default in both directions', () => {
    expect(resolveDbTls('local', true)).toBe(true);
    expect(resolveDbTls('production', false)).toBe(false);
  });
});

describe('dbAuthEnvFields', () => {
  const schema = z.object(dbAuthEnvFields);

  it('defaults to password sign-in', () => {
    expect(parseEnv(schema, {}).DB_AUTH).toBe('password');
  });

  it('rejects an unknown method', () => {
    expect(() => parseEnv(schema, { DB_AUTH: 'token' })).toThrow(/DB_AUTH/);
  });
});

describe('resolveDbLogin', () => {
  const clientId = '11111111-1111-1111-1111-111111111111';
  const names = { userVariable: 'DB_USER', passwordVariable: 'PUBLIC_API_PASSWORD' };

  it('signs in with the password under password', () => {
    expect(
      resolveDbLogin({
        ...names,
        auth: 'password',
        clientId: undefined,
        user: 'public_api',
        password: 'pw',
      }),
    ).toEqual({ user: 'public_api', password: 'pw' });
  });

  it('signs in with the managed identity under entra, ignoring any password', () => {
    expect(
      resolveDbLogin({
        ...names,
        auth: 'entra',
        clientId,
        user: 'id-public-api',
        password: 'pw',
      }),
    ).toEqual({ user: 'id-public-api', entraClientId: clientId });
  });

  it('names the missing password under password', () => {
    expect(() =>
      resolveDbLogin({
        ...names,
        auth: 'password',
        clientId,
        user: 'public_api',
        password: undefined,
      }),
    ).toThrow('DB_AUTH=password needs PUBLIC_API_PASSWORD');
  });

  it('names both missing values under entra', () => {
    expect(() =>
      resolveDbLogin({
        ...names,
        auth: 'entra',
        clientId: undefined,
        user: undefined,
        password: 'pw',
      }),
    ).toThrow('DB_AUTH=entra needs DB_USER and AZURE_CLIENT_ID');
  });
});
