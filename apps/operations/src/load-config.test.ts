import { describe, expect, it } from 'vitest';

import { loadConfig } from './load-config.ts';

describe('loadConfig', () => {
  const local = { APP_ENV: 'local', POSTGRES_PASSWORD: 'owner-pw' };

  it('applies local defaults when only APP_ENV and the owner password are set', () => {
    expect(loadConfig({ ...local })).toEqual({
      appEnv: 'local',
      log: { level: 'debug', pretty: true, requestDetails: false },
      db: {
        host: 'localhost',
        port: 5432,
        database: 'fphd',
        user: 'fphd',
        password: 'owner-pw',
        ssl: false,
      },
      roles: {
        publicApiPassword: undefined,
        internalApiPassword: undefined,
        publicApiPrincipal: undefined,
        internalApiPrincipal: undefined,
      },
      publishedSnapshot: { url: undefined, sha256: undefined },
      dataMigration: { url: undefined, sha256: undefined },
    });
  });

  it('connects as the owner role over TLS when deployed', () => {
    const config = loadConfig({
      APP_ENV: 'production',
      DB_HOST: 'fphd.postgres.database.azure.com',
      POSTGRES_DB: 'fphd',
      POSTGRES_USER: 'fphd_admin',
      POSTGRES_PASSWORD: 'owner-pw',
      PUBLIC_API_PASSWORD: 'public-pw',
      INTERNAL_API_PASSWORD: 'internal-pw',
    });

    expect(config.db).toEqual({
      host: 'fphd.postgres.database.azure.com',
      port: 5432,
      database: 'fphd',
      user: 'fphd_admin',
      password: 'owner-pw',
      ssl: true,
    });
    expect(config.roles).toMatchObject({
      publicApiPassword: 'public-pw',
      internalApiPassword: 'internal-pw',
    });
  });

  it('throws naming the missing owner password', () => {
    expect(() => loadConfig({ APP_ENV: 'local' })).toThrow(/POSTGRES_PASSWORD/);
  });

  it('requires APP_ENV rather than assuming the environment that relaxes TLS', () => {
    expect(() => loadConfig({ POSTGRES_PASSWORD: 'owner-pw' })).toThrow(/APP_ENV/);
  });

  it('requires POSTGRES_USER when deployed rather than assuming the dev superuser', () => {
    expect(() => loadConfig({ APP_ENV: 'production', POSTGRES_PASSWORD: 'owner-pw' })).toThrow(
      /POSTGRES_USER/,
    );
  });

  it('does not require the role passwords, which only db bootstrap uses', () => {
    expect(() => loadConfig({ ...local })).not.toThrow();
  });

  it('parses the published snapshot URL and checksum only when provided', () => {
    const config = loadConfig({
      ...local,
      PUBLISHED_SNAPSHOT_URL: 'https://example.blob.core.windows.net/import/snapshot.tar',
      PUBLISHED_SNAPSHOT_SHA256: 'a'.repeat(64),
    });
    expect(config.publishedSnapshot).toEqual({
      url: 'https://example.blob.core.windows.net/import/snapshot.tar',
      sha256: 'a'.repeat(64),
    });
  });

  it('parses the live data migration URL and checksum only when provided', () => {
    const config = loadConfig({
      ...local,
      DATA_MIGRATION_URL: 'https://example.blob.core.windows.net/import/live.tar',
      DATA_MIGRATION_SHA256: 'b'.repeat(64),
    });
    expect(config.dataMigration).toEqual({
      url: 'https://example.blob.core.windows.net/import/live.tar',
      sha256: 'b'.repeat(64),
    });
  });

  describe('under DB_AUTH=entra', () => {
    const entra = {
      APP_ENV: 'production',
      DB_AUTH: 'entra',
      POSTGRES_USER: 'id-ops',
      AZURE_CLIENT_ID: '11111111-1111-1111-1111-111111111111',
    };

    it("connects as the job's Entra principal with no password", () => {
      expect(loadConfig(entra).db).toMatchObject({
        user: 'id-ops',
        entraClientId: '11111111-1111-1111-1111-111111111111',
      });
    });

    it('needs POSTGRES_USER rather than assuming the dev superuser, even locally', () => {
      expect(() => loadConfig({ ...entra, APP_ENV: 'local', POSTGRES_USER: undefined })).toThrow(
        /POSTGRES_USER/,
      );
    });

    it("reads each API identity's principal for db bootstrap", () => {
      const config = loadConfig({
        ...entra,
        PUBLIC_API_DB_USER: 'id-public-api',
        PUBLIC_API_OBJECT_ID: '22222222-2222-2222-2222-222222222222',
        INTERNAL_API_DB_USER: 'id-internal-api',
        INTERNAL_API_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
      });

      expect(config.roles.publicApiPrincipal).toEqual({
        name: 'id-public-api',
        objectId: '22222222-2222-2222-2222-222222222222',
      });
      expect(config.roles.internalApiPrincipal).toEqual({
        name: 'id-internal-api',
        objectId: '33333333-3333-3333-3333-333333333333',
      });
    });
  });
});
