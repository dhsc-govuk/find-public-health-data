import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  boolSchema,
  isDeployedEnv,
  isDevClassEnv,
  loadWebServerConfig,
  logEnvFields,
  parseEnv,
  portSchema,
  resolveLog,
  resolveShutdown,
  serverEnvFields,
} from './env.ts';

describe('portSchema', () => {
  it('parses a valid port from env text', () => {
    expect(portSchema.parse('5433')).toBe(5433);
    expect(portSchema.parse('1')).toBe(1);
    expect(portSchema.parse('65535')).toBe(65_535);
  });

  it('rejects non-numeric values rather than passing NaN to a driver', () => {
    expect(() => portSchema.parse('abc')).toThrow();
  });

  it('rejects out-of-range and non-integer ports', () => {
    expect(() => portSchema.parse('0')).toThrow();
    expect(() => portSchema.parse('-1')).toThrow();
    expect(() => portSchema.parse('65536')).toThrow();
    expect(() => portSchema.parse('5432.5')).toThrow();
  });
});

describe('boolSchema', () => {
  it("parses 'true' and '1' as true", () => {
    expect(boolSchema.parse('true')).toBe(true);
    expect(boolSchema.parse('1')).toBe(true);
  });

  it("parses 'false' and '0' as false", () => {
    expect(boolSchema.parse('false')).toBe(false);
    expect(boolSchema.parse('0')).toBe(false);
  });

  it('rejects anything else instead of coercing it to true', () => {
    expect(() => boolSchema.parse('yes')).toThrow();
    expect(() => boolSchema.parse('TRUE')).toThrow();
    expect(() => boolSchema.parse('2')).toThrow();
  });
});

describe('isDevClassEnv', () => {
  it('allows the environments whose data is disposable', () => {
    expect(isDevClassEnv('local')).toBe(true);
    expect(isDevClassEnv('test')).toBe(true);
    expect(isDevClassEnv('dev')).toBe(true);
  });

  it('refuses the environments that hold data to keep, and an unset value', () => {
    expect(isDevClassEnv('preview')).toBe(false);
    expect(isDevClassEnv('production')).toBe(false);
    expect(isDevClassEnv(undefined)).toBe(false);
  });
});

describe('isDeployedEnv', () => {
  it('treats a developer machine and a test run as the same thing', () => {
    expect(isDeployedEnv('local')).toBe(false);
    expect(isDeployedEnv('test')).toBe(false);
  });

  it('treats every other environment as deployed', () => {
    expect(isDeployedEnv('dev')).toBe(true);
    expect(isDeployedEnv('preview')).toBe(true);
    expect(isDeployedEnv('production')).toBe(true);
  });
});

describe('serverEnvFields', () => {
  const schema = z.object(serverEnvFields({ port: 4000 }));

  it('defaults to all interfaces with the given port', () => {
    expect(schema.parse({ APP_ENV: 'local' })).toEqual({
      APP_ENV: 'local',
      HOST: '0.0.0.0',
      PORT: 4000,
      SHUTDOWN_GRACE_PERIOD_MS: 25_000,
    });
  });

  it('reads overrides from the environment', () => {
    expect(
      schema.parse({
        APP_ENV: 'preview',
        HOST: '127.0.0.1',
        PORT: '8080',
        SHUTDOWN_GRACE_PERIOD_MS: '60000',
      }),
    ).toEqual({
      APP_ENV: 'preview',
      HOST: '127.0.0.1',
      PORT: 8080,
      SHUTDOWN_GRACE_PERIOD_MS: 60_000,
    });
  });

  it('requires APP_ENV rather than assuming the environment it relaxes everything for', () => {
    expect(() => schema.parse({})).toThrow();
  });

  it('rejects unknown environments', () => {
    expect(() => schema.parse({ APP_ENV: 'qa' })).toThrow();
  });

  it('rejects a grace period too short to have phases at all', () => {
    expect(() => schema.parse({ APP_ENV: 'local', SHUTDOWN_GRACE_PERIOD_MS: '0' })).toThrow();
  });
});

describe('resolveShutdown', () => {
  const budget = { SHUTDOWN_GRACE_PERIOD_MS: 25_000 };

  it('drains only where something is routing to the process', () => {
    expect(resolveShutdown('local', budget).drainDelayMs).toBe(0);
    expect(resolveShutdown('test', budget).drainDelayMs).toBe(0);
    expect(resolveShutdown('production', budget).drainDelayMs).toBe(5_000);
  });

  it('takes the drain from the environment over either default', () => {
    expect(resolveShutdown('production', { ...budget, SHUTDOWN_DRAIN_MS: 250 }).drainDelayMs).toBe(
      250,
    );
  });

  // The drain comes out of the budget rather than adding to it, so one that fills it leaves
  // nothing to finish in-flight work in.
  it('refuses a drain that leaves the stop no time to stop in', () => {
    expect(() =>
      resolveShutdown('production', {
        SHUTDOWN_DRAIN_MS: 30_000,
        SHUTDOWN_GRACE_PERIOD_MS: 25_000,
      }),
    ).toThrow(/SHUTDOWN_DRAIN_MS/);
  });
});

describe('logEnvFields', () => {
  const schema = z.object(logEnvFields);

  it('leaves every field for resolveLog to derive', () => {
    expect(schema.parse({})).toEqual({});
  });

  it('accepts pino level names and boolean text', () => {
    expect(
      schema.parse({ LOG_LEVEL: 'debug', LOG_PRETTY: '1', LOG_REQUEST_DETAILS: 'true' }),
    ).toEqual({
      LOG_LEVEL: 'debug',
      LOG_PRETTY: true,
      LOG_REQUEST_DETAILS: true,
    });
  });

  it('rejects unknown level names', () => {
    expect(() => schema.parse({ LOG_LEVEL: 'verbose' })).toThrow();
  });
});

describe('resolveLog', () => {
  it.each(['production', 'preview'] as const)('defaults to info under %s', (appEnv) => {
    expect(resolveLog(appEnv, {})).toEqual({
      level: 'info',
      pretty: false,
      requestDetails: false,
    });
  });

  it.each(['local', 'test', 'dev'] as const)('defaults to debug under %s', (appEnv) => {
    expect(resolveLog(appEnv, {}).level).toBe('debug');
  });

  it('takes LOG_LEVEL over the default', () => {
    expect(resolveLog('production', { LOG_LEVEL: 'trace' }).level).toBe('trace');
    expect(resolveLog('local', { LOG_LEVEL: 'warn' }).level).toBe('warn');
  });

  it('pretty-prints only under local, and only unless LOG_PRETTY turns it off', () => {
    expect(resolveLog('local', {}).pretty).toBe(true);
    expect(resolveLog('local', { LOG_PRETTY: false }).pretty).toBe(false);
    expect(resolveLog('dev', { LOG_PRETTY: true }).pretty).toBe(false);
  });

  it('prints request details only in pretty output, and only when LOG_REQUEST_DETAILS asks', () => {
    expect(resolveLog('local', {}).requestDetails).toBe(false);
    expect(resolveLog('local', { LOG_REQUEST_DETAILS: true }).requestDetails).toBe(true);
    expect(
      resolveLog('local', { LOG_PRETTY: false, LOG_REQUEST_DETAILS: true }).requestDetails,
    ).toBe(false);
    expect(resolveLog('dev', { LOG_REQUEST_DETAILS: true }).requestDetails).toBe(false);
  });
});

describe('parseEnv', () => {
  const schema = z.object({
    PORT: portSchema.default(4000),
    SECRET: z.string().min(1),
  });

  it('returns the typed, defaulted result', () => {
    expect(parseEnv(schema, { PORT: '4100', SECRET: 's3cret' })).toEqual({
      PORT: 4100,
      SECRET: 's3cret',
    });
    expect(parseEnv(schema, { SECRET: 's3cret' })).toEqual({ PORT: 4000, SECRET: 's3cret' });
  });

  it('treats blank values as unset so defaults still apply', () => {
    expect(parseEnv(schema, { PORT: '', SECRET: 's3cret' })).toEqual({
      PORT: 4000,
      SECRET: 's3cret',
    });
    expect(parseEnv(schema, { PORT: '   ', SECRET: 's3cret' })).toEqual({
      PORT: 4000,
      SECRET: 's3cret',
    });
  });

  it('names the missing variable and points at .env.example', () => {
    expect(() => parseEnv(schema, {})).toThrow(/SECRET/);
    expect(() => parseEnv(schema, {})).toThrow(/\.env\.example/);
  });

  it('reports every problem in one error', () => {
    expect(() => parseEnv(schema, { PORT: 'abc' })).toThrow(/PORT[\s\S]*SECRET/);
  });

  it('ignores env vars the schema does not mention', () => {
    expect(parseEnv(schema, { SECRET: 's3cret', UNRELATED: 'x' })).toEqual({
      PORT: 4000,
      SECRET: 's3cret',
    });
  });
});

describe('loadWebServerConfig', () => {
  const sessionSecret = 'a-jwt-session-secret-that-is-long-enough';
  const webSessionSecret = 'a-web-session-secret-that-is-long-enough';
  const secrets = { SESSION_JWT_SECRET: sessionSecret, WEB_SESSION_SECRET: webSessionSecret };
  const defaults = { port: 3000, apiUrl: 'http://localhost:4000' };

  it('uses the app port, api url and local logging defaults', () => {
    expect(loadWebServerConfig({ APP_ENV: 'local', ...secrets }, defaults)).toEqual({
      offersDevTools: true,
      development: false,
      host: '0.0.0.0',
      port: 3000,
      apiUrl: 'http://localhost:4000',
      apiUploadTimeoutMs: undefined,
      trustedProxyHops: 2,
      log: { level: 'debug', pretty: true, requestDetails: false },
      shutdown: { drainDelayMs: 0, gracePeriodMs: 25_000 },
      session: { secret: sessionSecret, secure: false },
      webSession: { secret: webSessionSecret, secure: false },
    });
  });

  it.each([
    ['local', true],
    ['test', true],
    ['dev', true],
    ['preview', false],
    ['production', false],
  ])('offers development tools under APP_ENV %s: %s', (appEnv, offered) => {
    expect(loadWebServerConfig({ APP_ENV: appEnv, ...secrets }, defaults).offersDevTools).toBe(
      offered,
    );
  });

  it('parses runtime and logging configuration', () => {
    expect(
      loadWebServerConfig(
        {
          APP_ENV: 'preview',
          HOST: '127.0.0.1',
          NODE_ENV: 'development',
          PORT: '8080',
          API_URL: 'http://api.internal:9000',
          API_UPLOAD_TIMEOUT_MS: '45000',
          TRUSTED_PROXY_HOPS: '1',
          LOG_LEVEL: 'debug',
          LOG_PRETTY: '1',
          ...secrets,
        },
        defaults,
      ),
    ).toEqual({
      offersDevTools: false,
      development: true,
      host: '127.0.0.1',
      port: 8080,
      apiUrl: 'http://api.internal:9000',
      apiUploadTimeoutMs: 45_000,
      trustedProxyHops: 1,
      log: { level: 'debug', pretty: false, requestDetails: false },
      shutdown: { drainDelayMs: 5_000, gracePeriodMs: 25_000 },
      session: { secret: sessionSecret, secure: true },
      webSession: { secret: webSessionSecret, secure: true },
    });
  });

  it.each(['dev', 'preview', 'production'] as const)(
    'uses secure session cookies in the %s environment',
    (appEnv) => {
      expect(
        loadWebServerConfig(
          {
            APP_ENV: appEnv,
            NODE_ENV: 'development',
            ...secrets,
          },
          defaults,
        ),
      ).toMatchObject({ session: { secure: true }, webSession: { secure: true } });
    },
  );

  it.each(['local', 'test'] as const)(
    'leaves session cookies insecure in the %s environment, which is served over http',
    (appEnv) => {
      expect(
        loadWebServerConfig(
          {
            APP_ENV: appEnv,
            NODE_ENV: 'development',
            ...secrets,
          },
          defaults,
        ),
      ).toMatchObject({ session: { secure: false }, webSession: { secure: false } });
    },
  );

  it('requires APP_ENV', () => {
    expect(() => loadWebServerConfig(secrets, defaults)).toThrow(/APP_ENV/);
  });

  it.each(['SESSION_JWT_SECRET', 'WEB_SESSION_SECRET'] as const)(
    'requires a %s of at least 32 characters',
    (name) => {
      expect(() => loadWebServerConfig({ APP_ENV: 'local' }, defaults)).toThrow(name);
      expect(() =>
        loadWebServerConfig({ APP_ENV: 'local', ...secrets, [name]: 'too-short' }, defaults),
      ).toThrow(name);
    },
  );

  it('strips a trailing slash from the api url so callers can build paths without doubling it', () => {
    expect(
      loadWebServerConfig(
        { APP_ENV: 'local', API_URL: 'http://api.internal:9000/', ...secrets },
        defaults,
      ).apiUrl,
    ).toBe('http://api.internal:9000');
  });

  it.each(['-1', '1.5', 'two'])('rejects %s trusted proxy hops', (value) => {
    expect(() =>
      loadWebServerConfig({ APP_ENV: 'local', TRUSTED_PROXY_HOPS: value, ...secrets }, defaults),
    ).toThrow(/TRUSTED_PROXY_HOPS/);
  });

  it('rejects an invalid api url', () => {
    expect(() =>
      loadWebServerConfig({ APP_ENV: 'local', API_URL: 'not-a-url', ...secrets }, defaults),
    ).toThrow(/API_URL/);
  });

  it('leaves basic auth off when neither credential is set', () => {
    expect(loadWebServerConfig({ APP_ENV: 'local', ...secrets }, defaults).basicAuth).toBe(
      undefined,
    );
  });

  it('turns basic auth on when both credentials are set', () => {
    expect(
      loadWebServerConfig(
        {
          APP_ENV: 'dev',
          BASIC_AUTH_USERNAME: 'preview',
          BASIC_AUTH_PASSWORD: 'pass:word',
          ...secrets,
        },
        defaults,
      ).basicAuth,
    ).toEqual({ username: 'preview', password: 'pass:word' });
  });

  it.each([{ BASIC_AUTH_USERNAME: 'preview' }, { BASIC_AUTH_PASSWORD: 'password' }])(
    'refuses one basic auth credential without the other: %o',
    (credential) => {
      expect(() =>
        loadWebServerConfig({ APP_ENV: 'dev', ...credential, ...secrets }, defaults),
      ).toThrow(/must be set together/);
    },
  );

  it('refuses a basic auth username containing a colon', () => {
    expect(() =>
      loadWebServerConfig(
        {
          APP_ENV: 'dev',
          BASIC_AUTH_USERNAME: 'pre:view',
          BASIC_AUTH_PASSWORD: 'password',
          ...secrets,
        },
        defaults,
      ),
    ).toThrow(/BASIC_AUTH_USERNAME/);
  });
});
