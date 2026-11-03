import { describe, expect, it } from 'vitest';

import { loadConfig } from './load-config.ts';

describe('loadConfig', () => {
  const local = { APP_ENV: 'local', PUBLIC_API_PASSWORD: 'pw' };

  it('applies local defaults when only APP_ENV and the password are set', () => {
    expect(loadConfig({ ...local })).toEqual({
      appEnv: 'local',
      host: '0.0.0.0',
      port: 4000,
      revision: 'unknown',
      log: { level: 'debug', pretty: true, requestDetails: false },
      shutdown: { drainDelayMs: 0, gracePeriodMs: 25_000 },
      db: {
        host: 'localhost',
        port: 5432,
        database: 'fphd',
        user: 'public_api',
        password: 'pw',
        ssl: false,
      },
    });
  });

  it('reads every value from the environment', () => {
    const config = loadConfig({
      APP_ENV: 'preview',
      HOST: '127.0.0.1',
      PORT: '8080',
      REVISION: 'f3c1a0d5e2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d1',
      LOG_LEVEL: 'debug',
      LOG_PRETTY: '1',
      DB_HOST: 'db.internal',
      DB_PORT: '5433',
      POSTGRES_DB: 'fphd_preview',
      PUBLIC_API_PASSWORD: 'pw',
    });

    expect(config).toEqual({
      appEnv: 'preview',
      host: '127.0.0.1',
      port: 8080,
      revision: 'f3c1a0d5e2b4c6d8e0f1a2b3c4d5e6f7a8b9c0d1',
      log: { level: 'debug', pretty: false, requestDetails: false },
      shutdown: { drainDelayMs: 5_000, gracePeriodMs: 25_000 },
      db: {
        host: 'db.internal',
        port: 5433,
        database: 'fphd_preview',
        user: 'public_api',
        password: 'pw',
        ssl: true,
      },
    });
  });

  it('turns database TLS on everywhere but this machine, and lets DB_TLS override', () => {
    expect(loadConfig({ ...local }).db.ssl).toBe(false);
    expect(loadConfig({ ...local, APP_ENV: 'test' }).db.ssl).toBe(false);
    expect(loadConfig({ ...local, APP_ENV: 'dev' }).db.ssl).toBe(true);
    expect(loadConfig({ ...local, APP_ENV: 'production' }).db.ssl).toBe(true);
    expect(loadConfig({ ...local, DB_TLS: '1' }).db.ssl).toBe(true);
    expect(loadConfig({ ...local, APP_ENV: 'production', DB_TLS: '0' }).db.ssl).toBe(false);
  });

  it('allows pretty logging only locally, where it defaults on', () => {
    expect(loadConfig({ ...local }).log.pretty).toBe(true);
    expect(loadConfig({ ...local, LOG_PRETTY: '0' }).log.pretty).toBe(false);
    expect(loadConfig({ ...local, APP_ENV: 'production' }).log.pretty).toBe(false);
    // pino-pretty is absent from deployed installs; LOG_PRETTY must not be able to force it.
    expect(loadConfig({ ...local, APP_ENV: 'production', LOG_PRETTY: '1' }).log.pretty).toBe(false);
  });

  it('requires APP_ENV rather than assuming the environment that relaxes TLS', () => {
    expect(() => loadConfig({ PUBLIC_API_PASSWORD: 'pw' })).toThrow(/APP_ENV/);
  });

  it('drains before shutting down everywhere but a developer machine', () => {
    expect(loadConfig({ ...local }).shutdown.drainDelayMs).toBe(0);
    expect(loadConfig({ ...local, APP_ENV: 'production' }).shutdown.drainDelayMs).toBe(5_000);
    expect(loadConfig({ ...local, SHUTDOWN_DRAIN_MS: '250' }).shutdown.drainDelayMs).toBe(250);
  });

  it('bounds the whole stop the same everywhere, because it is a ceiling and not a wait', () => {
    expect(loadConfig({ ...local }).shutdown.gracePeriodMs).toBe(25_000);
    expect(loadConfig({ ...local, APP_ENV: 'production' }).shutdown.gracePeriodMs).toBe(25_000);
    expect(loadConfig({ ...local, SHUTDOWN_GRACE_PERIOD_MS: '60000' }).shutdown.gracePeriodMs).toBe(
      60_000,
    );
  });

  it('throws naming the missing password', () => {
    expect(() => loadConfig({ APP_ENV: 'local' })).toThrow(/PUBLIC_API_PASSWORD/);
  });

  it('rejects an invalid PORT', () => {
    expect(() => loadConfig({ ...local, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('reports all problems in one error', () => {
    expect(() => loadConfig({ APP_ENV: 'local', PORT: '999999' })).toThrow(
      /PORT[\s\S]*PUBLIC_API_PASSWORD/,
    );
  });
});
