import { describe, expect, it } from 'vitest';

import { loadConfig } from './load-config.ts';

describe('loadConfig', () => {
  const sessionSecret = 'a-jwt-session-secret-that-is-long-enough';
  const required = {
    INTERNAL_API_PASSWORD: 'pw',
    SESSION_JWT_SECRET: sessionSecret,
    STORAGE_CONTAINER: 'uploads',
  };
  const local = {
    ...required,
    APP_ENV: 'local',
    STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
  };
  const deployed = {
    ...required,
    APP_ENV: 'dev',
    STORAGE_ACCOUNT_URL: 'https://fphddev.blob.core.windows.net',
    AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000000',
  };

  it('applies local defaults when only APP_ENV, the password, the secret and storage are set', () => {
    expect(loadConfig({ ...local })).toEqual({
      appEnv: 'local',
      host: '0.0.0.0',
      port: 4001,
      revision: 'unknown',
      log: { level: 'debug', pretty: true, requestDetails: false },
      shutdown: { drainDelayMs: 0, gracePeriodMs: 25_000 },
      session: { secret: sessionSecret, secure: false },
      db: {
        host: 'localhost',
        port: 5432,
        database: 'fphd',
        user: 'internal_api',
        password: 'pw',
        ssl: false,
      },
      storage: { container: 'uploads', connectionString: 'UseDevelopmentStorage=true' },
    });
  });

  it('reads every value from the environment', () => {
    const config = loadConfig({
      APP_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '8081',
      REVISION: 'f3c1a0d5e2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d1',
      LOG_LEVEL: 'warn',
      LOG_PRETTY: 'false',
      DB_HOST: 'db.internal',
      DB_PORT: '5433',
      POSTGRES_DB: 'fphd_prod',
      INTERNAL_API_PASSWORD: 'pw',
      SESSION_JWT_SECRET: sessionSecret,
      STORAGE_CONTAINER: 'uploads',
      STORAGE_ACCOUNT_URL: 'https://fphdprod.blob.core.windows.net',
      AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000000',
    });

    expect(config).toEqual({
      appEnv: 'production',
      host: '127.0.0.1',
      port: 8081,
      revision: 'f3c1a0d5e2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d1',
      log: { level: 'warn', pretty: false, requestDetails: false },
      shutdown: { drainDelayMs: 5_000, gracePeriodMs: 25_000 },
      session: { secret: sessionSecret, secure: true },
      db: {
        host: 'db.internal',
        port: 5433,
        database: 'fphd_prod',
        user: 'internal_api',
        password: 'pw',
        ssl: true,
      },
      storage: {
        container: 'uploads',
        accountUrl: 'https://fphdprod.blob.core.windows.net',
        clientId: '00000000-0000-0000-0000-000000000000',
      },
    });
  });

  it('turns database TLS on everywhere but this machine, and lets DB_TLS override', () => {
    expect(loadConfig({ ...local }).db.ssl).toBe(false);
    expect(loadConfig({ ...local, APP_ENV: 'test' }).db.ssl).toBe(false);
    expect(loadConfig({ ...deployed }).db.ssl).toBe(true);
    expect(loadConfig({ ...deployed, APP_ENV: 'production' }).db.ssl).toBe(true);
    expect(loadConfig({ ...local, DB_TLS: '1' }).db.ssl).toBe(true);
    expect(loadConfig({ ...deployed, APP_ENV: 'production', DB_TLS: '0' }).db.ssl).toBe(false);
  });

  it('secures session cookies everywhere but this machine', () => {
    expect(loadConfig({ ...local }).session.secure).toBe(false);
    expect(loadConfig({ ...local, APP_ENV: 'test' }).session.secure).toBe(false);
    expect(loadConfig({ ...deployed }).session.secure).toBe(true);
  });

  it('allows pretty logging only locally, where it defaults on', () => {
    expect(loadConfig({ ...local }).log.pretty).toBe(true);
    expect(loadConfig({ ...local, LOG_PRETTY: '0' }).log.pretty).toBe(false);
    expect(loadConfig({ ...deployed }).log.pretty).toBe(false);
    // pino-pretty is absent from deployed installs; LOG_PRETTY must not be able to force it.
    expect(loadConfig({ ...deployed, LOG_PRETTY: '1' }).log.pretty).toBe(false);
  });

  it('requires APP_ENV rather than assuming the environment that relaxes TLS', () => {
    expect(() =>
      loadConfig({ INTERNAL_API_PASSWORD: 'pw', SESSION_JWT_SECRET: sessionSecret }),
    ).toThrow(/APP_ENV/);
  });

  it('throws naming the missing password', () => {
    const { INTERNAL_API_PASSWORD: _, ...withoutPassword } = local;
    expect(() => loadConfig(withoutPassword)).toThrow(/INTERNAL_API_PASSWORD/);
  });

  it('refuses the Azurite connection string in a deployed environment', () => {
    expect(() => loadConfig({ ...local, APP_ENV: 'dev' })).toThrow(/STORAGE_CONNECTION_STRING/);
  });

  it('rejects an invalid PORT', () => {
    expect(() => loadConfig({ ...local, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('requires a JWT session secret', () => {
    expect(() => loadConfig({ APP_ENV: 'local', INTERNAL_API_PASSWORD: 'pw' })).toThrow(
      /SESSION_JWT_SECRET/,
    );
  });

  it('signs in to the database with the same managed identity as storage under DB_AUTH=entra', () => {
    const { INTERNAL_API_PASSWORD: _, ...withoutPassword } = deployed;
    const config = loadConfig({ ...withoutPassword, DB_AUTH: 'entra', DB_USER: 'id-internal-api' });

    expect(config.db).toMatchObject({
      user: 'id-internal-api',
      entraClientId: '00000000-0000-0000-0000-000000000000',
    });
  });
});
