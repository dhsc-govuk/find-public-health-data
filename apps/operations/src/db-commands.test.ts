import type { SqlClient } from '@fphd/db';
import {
  DATA_MIGRATION_FORMAT_VERSION,
  DATA_MIGRATION_NULL,
  DATA_MIGRATION_SCHEMA,
  type DataMigrationManifest,
  SEED_TABLES,
  SEEDED_TABLES,
} from '@fphd/db-operations';
import { createLogger, type Logger } from '@fphd/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from './commands.ts';
import {
  bootstrap,
  importCoreData,
  importPublishedSnapshot,
  migrateLiveData,
  principalsToBootstrap,
  rolesToBootstrap,
} from './db-commands.ts';
import type { Config } from './load-config.ts';
import type { PublishedManifest } from './published-snapshot.ts';

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  assertCoreData: vi.fn(),
  seedPublished: vi.fn(),
  rebuild: vi.fn(),
  analyze: vi.fn(),
  importCoreData: vi.fn(),
  migrationDownload: vi.fn(),
  migrationApply: vi.fn(),
  createClient: vi.fn(),
  bootstrapEntra: vi.fn(),
  createOwnerGroup: vi.fn(),
}));

vi.mock('./published-snapshot.ts', () => ({ downloadPublishedSnapshot: mocks.download }));
vi.mock('./data-migration-package.ts', () => ({
  downloadDataMigration: mocks.migrationDownload,
}));
vi.mock('@fphd/db-operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fphd/db-operations')>()),
  assertCoreDataPresent: mocks.assertCoreData,
  seedPublishedTables: mocks.seedPublished,
  rebuildReadModelTables: mocks.rebuild,
  analyzeReadModels: mocks.analyze,
  importCoreData: mocks.importCoreData,
  applyDataMigration: mocks.migrationApply,
  bootstrapEntraPrincipals: mocks.bootstrapEntra,
  createOwnerGroup: mocks.createOwnerGroup,
}));
vi.mock('@fphd/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fphd/db')>()),
  createPostgresClient: mocks.createClient,
}));

afterEach(() => vi.clearAllMocks());

const logger = createLogger({ name: 'operations-test', level: 'silent' });

function publishedContext() {
  let committed = false;
  const tx = { unsafe: vi.fn(async () => [{ count: 0 }]) };
  const sql = {
    begin: vi.fn(async (run: (transaction: typeof tx) => Promise<unknown>) => {
      const result = await run(tx);
      committed = true;
      return result;
    }),
  } as unknown as SqlClient;
  const config = {
    appEnv: 'dev',
    publishedSnapshot: { url: 'https://example.test/snapshot.tar', sha256: 'a'.repeat(64) },
  } as Config;
  return {
    context: { sql, config, logger } satisfies CommandContext,
    tx,
    wasCommitted: () => committed,
  };
}

function publishedManifest(): PublishedManifest {
  return {
    source: 'PHOLIO_LIVE_B export',
    source_database: 'pholio_live_b',
    source_indicators: 1_329,
    source_observations: 29_656_329,
    excluded_indicators: [90_366, 90_776, 92_774, 93_280],
    excluded_observations: 126_515,
    source_csv_null: '__FPHD_NULL_5f92c66de4b849b4a717c23f5cbdb8a1__',
    id_mapping: 'deterministic-uuidv7-v1',
    tables: Object.fromEntries(
      SEED_TABLES.map((table) => [table, { rows: 1, bytes: 1, sha256: 'a'.repeat(64) }]),
    ),
  };
}

function seededTables(count: (table: string) => number) {
  return {
    tables: Object.fromEntries(SEED_TABLES.map((table) => [table, count(table)])),
    relationships: { links: 1 },
  };
}

function migrationManifest(): DataMigrationManifest {
  const file = (name: string) => ({
    file: name,
    rows: 0,
    bytes: 0,
    sha256: 'a'.repeat(64),
  });
  return {
    format_version: DATA_MIGRATION_FORMAT_VERSION,
    schema: DATA_MIGRATION_SCHEMA,
    migration_id: 'baseline-1',
    kind: 'baseline',
    predecessor: null,
    source: {
      system: 'fingertips',
      environment: 'live',
      database: 'fphd_new',
      snapshot_at: '2026-09-22T10:00:00Z',
      cutoff_at: '2026-09-22T10:00:00Z',
    },
    source_csv_null: DATA_MIGRATION_NULL,
    id_mapping: 'deterministic-uuidv7-v1',
    relationships: {
      file: 'indicator-relationships.json',
      rows: 0,
      bytes: 0,
      sha256: 'a'.repeat(64),
    },
    tables: Object.fromEntries(SEED_TABLES.map((table) => [table, file(`${table}.csv.gz`)])),
  };
}

function migrationContext() {
  let committed = false;
  const tx = { unsafe: vi.fn(async (_statement: string) => []) };
  const sql = {
    begin: vi.fn(async (run: (transaction: typeof tx) => Promise<unknown>) => {
      const result = await run(tx);
      committed = true;
      return result;
    }),
  } as unknown as SqlClient;
  const config = {
    appEnv: 'production',
    dataMigration: { url: 'https://example.test/migration.tar', sha256: 'b'.repeat(64) },
  } as Config;
  return {
    context: { sql, config, logger } satisfies CommandContext,
    tx,
    wasCommitted: () => committed,
  };
}

const noRoles: Config['roles'] = {
  publicApiPassword: undefined,
  internalApiPassword: undefined,
  publicApiPrincipal: undefined,
  internalApiPrincipal: undefined,
};

describe('rolesToBootstrap', () => {
  it('pairs each fixed role name with its injected password', () => {
    expect(
      rolesToBootstrap({
        ...noRoles,
        publicApiPassword: 'public-pw',
        internalApiPassword: 'internal-pw',
      }),
    ).toEqual([
      { name: 'public_api', password: 'public-pw' },
      { name: 'internal_api', password: 'internal-pw' },
    ]);
  });

  it('names every missing password in one error', () => {
    expect(() => rolesToBootstrap(noRoles)).toThrow(
      /PUBLIC_API_PASSWORD and INTERNAL_API_PASSWORD/,
    );
  });

  it('refuses a half-configured pair rather than bootstrapping one role', () => {
    expect(() => rolesToBootstrap({ ...noRoles, publicApiPassword: 'public-pw' })).toThrow(
      /INTERNAL_API_PASSWORD/,
    );
  });
});

describe('principalsToBootstrap', () => {
  const publicApiPrincipal = {
    name: 'id-public-api',
    objectId: '22222222-2222-2222-2222-222222222222',
  };
  const internalApiPrincipal = {
    name: 'id-internal-api',
    objectId: '33333333-3333-3333-3333-333333333333',
  };

  it('puts each identity in its API group', () => {
    expect(principalsToBootstrap({ ...noRoles, publicApiPrincipal, internalApiPrincipal })).toEqual(
      [
        { group: 'public_api', ...publicApiPrincipal },
        { group: 'internal_api', ...internalApiPrincipal },
      ],
    );
  });

  it('refuses a half-configured pair, naming what is missing', () => {
    expect(() => principalsToBootstrap({ ...noRoles, publicApiPrincipal })).toThrow(
      'db bootstrap needs INTERNAL_API_DB_USER, INTERNAL_API_OBJECT_ID in the environment',
    );
  });
});

describe('bootstrap under DB_AUTH=entra', () => {
  const clientId = '11111111-1111-1111-1111-111111111111';
  const principal = (name: string) => ({ name, objectId: '22222222-2222-2222-2222-222222222222' });

  function entraContext(): CommandContext {
    const sql = {
      begin: vi.fn(async (run: (transaction: object) => Promise<unknown>) => run({})),
    } as unknown as SqlClient;
    const config = {
      db: {
        host: 'db.example',
        port: 5432,
        database: 'fphd',
        user: 'id-ops',
        entraClientId: clientId,
        ssl: true,
      },
      roles: {
        ...noRoles,
        publicApiPrincipal: principal('id-public-api'),
        internalApiPrincipal: principal('id-internal-api'),
      },
    } as Config;
    return { sql, config, logger };
  }

  function serverClient() {
    const server = { end: vi.fn(async () => {}) };
    mocks.createClient.mockReturnValue(server);
    return server;
  }

  it('creates the principals over its own client to the postgres database, then closes it', async () => {
    const server = serverClient();

    await bootstrap(entraContext());

    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ database: 'postgres', user: 'id-ops', entraClientId: clientId }),
      expect.objectContaining({ max: 1 }),
    );
    expect(mocks.bootstrapEntra).toHaveBeenCalledWith(server, [
      { group: 'public_api', ...principal('id-public-api') },
      { group: 'internal_api', ...principal('id-internal-api') },
    ]);
    expect(server.end).toHaveBeenCalledOnce();
    expect(mocks.createOwnerGroup).toHaveBeenCalledOnce();
  });

  it('closes that client when creating the principals fails', async () => {
    const server = serverClient();
    mocks.bootstrapEntra.mockRejectedValueOnce(new Error('function does not exist'));

    await expect(bootstrap(entraContext())).rejects.toThrow('function does not exist');

    expect(server.end).toHaveBeenCalledOnce();
  });
});

describe('importCoreData', () => {
  it('names orphaned rows without a name key, which pino would take as the logger name', async () => {
    const summary = { inserted: 0, updated: 0, unchanged: 1 };
    mocks.importCoreData.mockResolvedValue({
      topics: { summary, orphaned: [{ id: 'topic-id', slug: 'a-topic' }] },
      subtopics: { summary, orphaned: [] },
      ciMethods: { summary, orphaned: [{ id: 'method-id', name: 'A method' }] },
      classifications: { summary, orphaned: [{ id: 'classification-id', slug: 'a-tag' }] },
      dataProviders: {
        providers: summary,
        sources: summary,
        orphaned: [{ id: 'provider-id', name: 'A provider' }],
      },
      valueTypes: { summary, orphaned: [{ id: 'value-type-id', name: 'A value type' }] },
      units: { summary, orphaned: [{ id: 'unit-id', name: 'A unit' }] },
      comparatorMethods: { summary, orphaned: [{ id: 'comparator-id', name: 'A comparator' }] },
      geography: { area: { summary, orphaned: 0 }, area_relationship: { summary, orphaned: 0 } },
      references: Object.fromEntries(
        ['areaTypes', 'dimensionTypes', 'dimensionValues', 'noteTypes'].map((key) => [
          key,
          { summary, orphaned: [] },
        ]),
      ),
    });
    const warn = vi.fn();
    const context = {
      sql: {} as SqlClient,
      config: {} as Config,
      logger: { info: vi.fn(), warn } as unknown as Logger,
    };

    await importCoreData(context);

    expect(warn.mock.calls.map(([fields]) => fields)).toEqual([
      { id: 'topic-id', slug: 'a-topic' },
      { id: 'method-id', methodName: 'A method' },
      { id: 'classification-id', slug: 'a-tag' },
      { id: 'provider-id', providerOrSourceName: 'A provider' },
      { id: 'value-type-id', entryName: 'A value type' },
      { id: 'unit-id', entryName: 'A unit' },
      { id: 'comparator-id', entryName: 'A comparator' },
    ]);
  });
});

describe('importPublishedSnapshot', () => {
  it('rejects a row count mismatch inside the transaction and cleans up', async () => {
    const { context, tx, wasCommitted } = publishedContext();
    const cleanup = vi.fn(async () => {});
    mocks.download.mockResolvedValue({
      directory: '/tmp/fixture',
      manifest: publishedManifest(),
      cleanup,
    });
    mocks.seedPublished.mockResolvedValue(
      seededTables((table) => (table === 'observation' ? 2 : 1)),
    );

    await expect(importPublishedSnapshot(context)).rejects.toThrow(
      'Published snapshot row count failed for observation',
    );
    expect(wasCommitted()).toBe(false);
    expect(tx.unsafe).not.toHaveBeenCalled();
    expect(mocks.rebuild).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('loads published tables, rebuilds read models and cleans up', async () => {
    const { context, tx, wasCommitted } = publishedContext();
    const cleanup = vi.fn(async () => {});
    mocks.download.mockResolvedValue({
      directory: '/tmp/fixture',
      manifest: publishedManifest(),
      cleanup,
    });
    mocks.seedPublished.mockResolvedValue(seededTables(() => 1));

    await importPublishedSnapshot(context);

    expect(mocks.seedPublished).toHaveBeenCalledWith(tx, '/tmp/fixture');
    expect(tx.unsafe).toHaveBeenCalledTimes(SEEDED_TABLES.length + 5);
    expect(mocks.rebuild).toHaveBeenCalledWith(tx);
    expect(wasCommitted()).toBe(true);
    expect(mocks.analyze).toHaveBeenCalledWith(context.sql);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('rejects unpublished versions before committing the imported snapshot', async () => {
    const { context, tx, wasCommitted } = publishedContext();
    const cleanup = vi.fn(async () => {});
    mocks.download.mockResolvedValue({
      directory: '/tmp/fixture',
      manifest: publishedManifest(),
      cleanup,
    });
    mocks.seedPublished.mockResolvedValue(seededTables(() => 1));
    tx.unsafe.mockResolvedValueOnce([{ count: 1 }]);

    await expect(importPublishedSnapshot(context)).rejects.toThrow(
      'Published snapshot contains an unpublished indicator version',
    );
    expect(wasCommitted()).toBe(false);
    expect(mocks.rebuild).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('rejects an indicator without exactly one published version before committing', async () => {
    const { context, tx, wasCommitted } = publishedContext();
    const cleanup = vi.fn(async () => {});
    mocks.download.mockResolvedValue({
      directory: '/tmp/fixture',
      manifest: publishedManifest(),
      cleanup,
    });
    mocks.seedPublished.mockResolvedValue(seededTables(() => 1));
    tx.unsafe.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([{ count: 1 }]);

    await expect(importPublishedSnapshot(context)).rejects.toThrow(
      'Published snapshot does not hold one published version per indicator',
    );
    expect(wasCommitted()).toBe(false);
    expect(mocks.rebuild).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe('migrateLiveData', () => {
  it('applies a verified package, rebuilds read models and cleans up', async () => {
    const { context, tx, wasCommitted } = migrationContext();
    const cleanup = vi.fn(async () => {});
    const manifest = migrationManifest();
    mocks.migrationDownload.mockResolvedValue({ directory: '/tmp/migration', manifest, cleanup });
    mocks.migrationApply.mockResolvedValue({ applied: true, changes: {} });

    await migrateLiveData(context);

    expect(mocks.migrationApply).toHaveBeenCalledWith(
      tx,
      '/tmp/migration',
      manifest,
      'b'.repeat(64),
      expect.any(Function),
    );
    // Only tables the service keeps: the staged-only legacy source list has none to analyze.
    expect(tx.unsafe.mock.calls.map(([statement]) => statement)).toEqual(
      [
        ...SEEDED_TABLES,
        'indicator_version_topic',
        'indicator_version_subtopic',
        'indicator_version_classification',
      ].map((table) => `ANALYZE "${table}"`),
    );
    expect(mocks.rebuild).toHaveBeenCalledWith(tx);
    expect(mocks.analyze).toHaveBeenCalledWith(context.sql);
    expect(wasCommitted()).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('leaves read models alone when the package was already applied', async () => {
    const { context, tx } = migrationContext();
    const cleanup = vi.fn(async () => {});
    mocks.migrationDownload.mockResolvedValue({
      directory: '/tmp/migration',
      manifest: migrationManifest(),
      cleanup,
    });
    mocks.migrationApply.mockResolvedValue({ applied: false, changes: {} });

    await migrateLiveData(context);

    expect(tx.unsafe).not.toHaveBeenCalled();
    expect(mocks.rebuild).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('rolls back and cleans up when package application fails', async () => {
    const { context, wasCommitted } = migrationContext();
    const cleanup = vi.fn(async () => {});
    mocks.migrationDownload.mockResolvedValue({
      directory: '/tmp/migration',
      manifest: migrationManifest(),
      cleanup,
    });
    mocks.migrationApply.mockRejectedValue(new Error('migration failed'));

    await expect(migrateLiveData(context)).rejects.toThrow('migration failed');

    expect(wasCommitted()).toBe(false);
    expect(mocks.rebuild).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
