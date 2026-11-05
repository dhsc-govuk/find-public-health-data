import { describe, expect, it } from 'vitest';

import { loadConfig } from './load-config.ts';

describe('loadConfig', () => {
  const local = { APP_ENV: 'local', INTERNAL_API_PASSWORD: 'pw' };
  const entra = {
    APP_ENV: 'production',
    DB_AUTH: 'entra',
    DB_USER: 'id-internal-worker',
    AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000000',
  };

  it('applies local defaults when only APP_ENV and the password are set', () => {
    expect(loadConfig({ ...local })).toEqual({
      appEnv: 'local',
      host: '0.0.0.0',
      port: 4002,
      revision: 'unknown',
      log: { level: 'debug', pretty: true, requestDetails: false },
      shutdown: { drainDelayMs: 0, gracePeriodMs: 25_000 },
      db: {
        host: 'localhost',
        port: 5432,
        database: 'fphd',
        user: 'internal_api',
        password: 'pw',
        ssl: false,
      },
    });
  });

  it('reads every value from the environment', () => {
    const config = loadConfig({
      APP_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '8082',
      REVISION: 'f3c1a0d5e2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d1',
      LOG_LEVEL: 'warn',
      DB_HOST: 'db.internal',
      DB_PORT: '5433',
      POSTGRES_DB: 'fphd_prod',
      INTERNAL_API_PASSWORD: 'pw',
    });

    expect(config).toEqual({
      appEnv: 'production',
      host: '127.0.0.1',
      port: 8082,
      revision: 'f3c1a0d5e2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d1',
      log: { level: 'warn', pretty: false, requestDetails: false },
      shutdown: { drainDelayMs: 5_000, gracePeriodMs: 25_000 },
      db: {
        host: 'db.internal',
        port: 5433,
        database: 'fphd_prod',
        user: 'internal_api',
        password: 'pw',
        ssl: true,
      },
    });
  });

  it('signs in as its own principal with its managed identity under DB_AUTH=entra', () => {
    expect(loadConfig(entra).db).toMatchObject({
      user: 'id-internal-worker',
      entraClientId: '00000000-0000-0000-0000-000000000000',
    });
  });

  it('throws naming the missing password', () => {
    expect(() => loadConfig({ APP_ENV: 'local' })).toThrow(/INTERNAL_API_PASSWORD/);
  });

  it('throws naming the missing principal under DB_AUTH=entra', () => {
    const { DB_USER: _, ...withoutUser } = entra;
    expect(() => loadConfig(withoutUser)).toThrow(/DB_USER/);
  });

  it('requires APP_ENV', () => {
    expect(() => loadConfig({ INTERNAL_API_PASSWORD: 'pw' })).toThrow(/APP_ENV/);
  });
});
