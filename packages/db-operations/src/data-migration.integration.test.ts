import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { importCoreData } from './core-data.ts';
import {
  INDICATOR_ID,
  type MigrationFixtureOptions,
  migrationFixture,
  SOURCE_ID,
  VERSION_COLUMNS,
  VERSION_ID,
  VERSION_ROW,
} from './data-migration.testing.ts';
import { applyDataMigration, type DataMigrationProgress } from './data-migration.ts';
import {
  DATA_MIGRATION_REFERENCE_TABLES,
  DATA_MIGRATION_TABLES,
} from './data-migration-manifest.ts';

const { IMPORTED_INDICATOR_TEAM_ID, SYSTEM_USER_IDS } = schema;

// Packages name their writer as pholio-migration and the tables name users. Any user but the
// PHOLIO migration one stands for a publisher.
const MIGRATED = SYSTEM_USER_IDS.pholioMigration;
const PUBLISHER = SYSTEM_USER_IDS.testSeed;

let database: TestDb;
let sql: postgres.Sql;
let directory: string;
let topicId: string;
let frameworkId: string;
let lifeStageId: string;

beforeAll(async () => {
  database = await createTestDb();
  const core = database.connect({ max: 1 });
  try {
    await importCoreData(core);
  } finally {
    await core.end();
  }
  sql = database.sql;
  const [topic] = await sql<{ id: string }[]>`SELECT id FROM topic LIMIT 1`;
  const [framework] = await sql<
    { id: string }[]
  >`SELECT id FROM classification WHERE dimension = 'framework' LIMIT 1`;
  const [lifeStage] = await sql<
    { id: string }[]
  >`SELECT id FROM classification WHERE dimension = 'life_stage' LIMIT 1`;
  if (!topic || !framework || !lifeStage) throw new Error('Missing core fixture data');
  topicId = topic.id;
  frameworkId = framework.id;
  lifeStageId = lifeStage.id;
});
beforeEach(async () => {
  const tables = DATA_MIGRATION_TABLES.filter(
    (table) => !DATA_MIGRATION_REFERENCE_TABLES.includes(table),
  );
  await sql.unsafe(
    `TRUNCATE ${tables.map((table) => `"${table}"`).join(', ')}, data_migration, audit_log CASCADE`,
  );
  await sql`ALTER SEQUENCE indicator_short_id_seq RESTART WITH 100000`;
  directory = await mkdtemp(join(tmpdir(), 'fphd-data-migration-test-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true });
});
afterAll(async () => {
  await database.drop();
});

async function apply(options: MigrationFixtureOptions = {}) {
  const { manifest, sha256 } = await migrationFixture(sql, directory, topicId, options);
  return sql.begin((tx) => applyDataMigration(tx, directory, manifest, sha256));
}
async function baseline(options: MigrationFixtureOptions = {}) {
  return apply({ baseline: true, ...options });
}
function version(sources: [string | null, string | null] = [null, null]) {
  return { columns: VERSION_COLUMNS, rows: [[...VERSION_ROW.slice(0, -2), ...sources]] };
}
function versionWithBatch(batchId: string | null, confirmedAt: string | null) {
  return {
    columns: [...VERSION_COLUMNS, 'upload_batch_id', 'data_table_confirmed_at'],
    rows: [[...VERSION_ROW, batchId, confirmedAt]],
  };
}
function batch(id: string) {
  return {
    columns: [
      'id',
      'indicator_id',
      'indicator_version_id',
      'original_filename',
      'uploaded_by',
      'status',
    ],
    rows: [[id, INDICATOR_ID, VERSION_ID, 'migration.csv', 'pholio-migration', 'processed']],
  };
}
async function sourceCount() {
  const [row] = await sql<
    { count: number }[]
  >`SELECT count(*)::int AS count FROM indicator_version_source WHERE indicator_version_id = ${VERSION_ID}`;
  return row?.count;
}
async function assertRolledBack() {
  const [row] = await sql<{ name: string; migrations: number; topics: number }[]>`
    SELECT v.name, (SELECT count(*)::int FROM data_migration) AS migrations,
      (SELECT count(*)::int FROM indicator_version_topic WHERE indicator_version_id = v.id) AS topics
    FROM indicator_version v WHERE id = ${VERSION_ID}
  `;
  expect(row).toEqual({ name: 'Test indicator', migrations: 1, topics: 1 });
}

describe('applyDataMigration', () => {
  it('loads the package writer as the PHOLIO migration user and its indicators into Fingertips', async () => {
    const batchId = '22222222-2222-7222-8222-222222222222';
    await baseline({
      upserts: { indicator_version: versionWithBatch(batchId, null), upload_batch: batch(batchId) },
    });

    expect(await sql`SELECT created_by, updated_by FROM indicator_version`).toEqual([
      { created_by: MIGRATED, updated_by: MIGRATED },
    ]);
    expect(await sql`SELECT uploaded_by FROM upload_batch`).toEqual([{ uploaded_by: MIGRATED }]);
    expect(await sql`SELECT team_id FROM indicator`).toEqual([
      { team_id: IMPORTED_INDICATOR_TEAM_ID },
    ]);
  });
  it("puts an increment's new indicator in Fingertips and leaves a moved one in its team", async () => {
    await baseline();
    const [teamB] = await sql<{ id: string }[]>`SELECT id FROM team WHERE name = 'Team B'`;
    await sql`UPDATE indicator SET team_id = ${teamB?.id ?? null} WHERE id = ${INDICATOR_ID}`;
    const otherId = '66666666-6666-7666-8666-666666666666';
    const otherVersion = [...VERSION_ROW];
    otherVersion.splice(0, 2, SOURCE_ID, otherId);
    otherVersion.splice(4, 2, 'Other indicator', 'other-indicator');

    await apply({
      upserts: {
        indicator: {
          columns: ['short_id', 'id'],
          rows: [
            [108, INDICATOR_ID],
            [109, otherId],
          ],
        },
        indicator_version: { columns: VERSION_COLUMNS, rows: [otherVersion] },
      },
      relationships: {
        indicators: [108, 109],
        indicatorTopics: [
          { topicId, fingertipsId: 108 },
          { topicId, fingertipsId: 109 },
        ],
      },
    });

    expect(await sql`SELECT short_id, team_id FROM indicator ORDER BY short_id`).toEqual([
      { short_id: 108, team_id: teamB?.id },
      { short_id: 109, team_id: IMPORTED_INDICATOR_TEAM_ID },
    ]);
  });
  it.each(['baseline', 'increment'] as const)(
    'refuses an upload batch naming another uploader in the %s',
    async (kind) => {
      const batchId = '22222222-2222-7222-8222-222222222222';
      const other = batch(batchId);
      other.rows[0]?.splice(4, 1, 'publisher');
      if (kind === 'increment') await baseline();

      await expect(
        kind === 'baseline'
          ? baseline({
              upserts: { indicator_version: versionWithBatch(batchId, null), upload_batch: other },
            })
          : apply({ upserts: { upload_batch: other } }),
      ).rejects.toThrow(
        'Data migration upload batches must name pholio-migration as their uploader',
      );
      expect(await sql`SELECT id FROM upload_batch`).toEqual([]);
      expect(await sql`SELECT count(*)::int AS count FROM data_migration`).toEqual([
        { count: kind === 'baseline' ? 0 : 1 },
      ]);
    },
  );
  it('reports a staged table complete only once its rows are in the table', async () => {
    const batchId = '22222222-2222-7222-8222-222222222222';
    const events: DataMigrationProgress[] = [];
    const { manifest, sha256 } = await migrationFixture(sql, directory, topicId, {
      baseline: true,
      upserts: { indicator_version: versionWithBatch(batchId, null), upload_batch: batch(batchId) },
    });

    await sql.begin((tx) =>
      applyDataMigration(tx, directory, manifest, sha256, (event) => events.push(event)),
    );

    const states = events.filter(({ table }) => table === 'upload_batch').map(({ state }) => state);
    expect(states[0]).toBe('started');
    expect(states.slice(-2)).toEqual(['inserting', 'complete']);
    expect(states.filter((state) => state === 'complete')).toHaveLength(1);
  });
  it('connects mutually referencing versions and batches and switches published observations', async () => {
    const firstBatch = '22222222-2222-7222-8222-222222222222';
    const secondBatch = '33333333-3333-7333-8333-333333333333';
    const areaId = '44444444-4444-7444-8444-444444444444';
    const observationId = '55555555-5555-7555-8555-555555555555';
    const confirmedAt = '2026-01-01T00:00:00Z';
    const observation = (batchId: string, value: number) => ({
      columns: [
        'id',
        'indicator_id',
        'area_id',
        'upload_batch_id',
        'from_date',
        'to_date',
        'value',
        'dimension_key',
        'created_by',
      ],
      rows: [
        [
          observationId,
          INDICATOR_ID,
          areaId,
          batchId,
          '2025-01-01',
          '2025-12-31',
          value,
          '',
          'pholio-migration',
        ],
      ],
    });
    await baseline({
      upserts: {
        indicator_version: versionWithBatch(firstBatch, confirmedAt),
        upload_batch: batch(firstBatch),
        area_type: {
          columns: ['id', 'name', 'hierarchy_type', 'level'],
          rows: [[areaId, 'Country', 'Administrative', 1]],
        },
        area: {
          columns: ['id', 'area_type_id', 'code', 'name', 'valid_from'],
          rows: [[areaId, areaId, 'E92000001', 'England', '2010-01-01']],
        },
        observation: observation(firstBatch, 10),
      },
    });
    expect(await sql`SELECT value FROM published.observation`).toEqual([{ value: 10 }]);
    expect(
      await sql`SELECT v.upload_batch_id, b.indicator_version_id,
      v.data_table_confirmed_at IS NOT NULL AS confirmed
      FROM indicator_version v JOIN upload_batch b ON b.id = v.upload_batch_id`,
    ).toEqual([{ upload_batch_id: firstBatch, indicator_version_id: VERSION_ID, confirmed: true }]);
    await apply({
      upserts: {
        indicator_version: versionWithBatch(secondBatch, confirmedAt),
        upload_batch: batch(secondBatch),
        observation: observation(secondBatch, 20),
      },
      deletes: { upload_batch: [firstBatch] },
    });
    expect(await sql`SELECT value FROM published.observation`).toEqual([{ value: 20 }]);
    expect(await sql`SELECT upload_batch_id FROM indicator_version`).toEqual([
      { upload_batch_id: secondBatch },
    ]);
    expect(await sql`SELECT id FROM upload_batch`).toEqual([{ id: secondBatch }]);
    await apply({
      migrationId: 'increment-3',
      predecessor: 'increment-2',
      cutoffAt: '2026-09-23T10:00:00Z',
      upserts: { indicator_version: version() },
    });
    expect(
      await sql`SELECT upload_batch_id, data_table_confirmed_at IS NOT NULL AS confirmed FROM indicator_version`,
    ).toEqual([{ upload_batch_id: secondBatch, confirmed: true }]);
    await apply({
      migrationId: 'increment-4',
      predecessor: 'increment-3',
      cutoffAt: '2026-09-24T10:00:00Z',
      upserts: { indicator_version: versionWithBatch(null, null) },
      deletes: { upload_batch: [secondBatch], observation: [observationId] },
    });
    expect(
      await sql`SELECT upload_batch_id, data_table_confirmed_at FROM indicator_version`,
    ).toEqual([{ upload_batch_id: null, data_table_confirmed_at: null }]);
    expect(await sql`SELECT id FROM published.observation`).toEqual([]);
  });
  it('withdraws an indicator, its version, batch and observations in one increment', async () => {
    const batchId = '22222222-2222-7222-8222-222222222222';
    const areaId = '44444444-4444-7444-8444-444444444444';
    const observationId = '55555555-5555-7555-8555-555555555555';
    await baseline({
      upserts: {
        indicator_version: versionWithBatch(batchId, '2026-01-01T00:00:00Z'),
        upload_batch: batch(batchId),
        area_type: {
          columns: ['id', 'name', 'hierarchy_type', 'level'],
          rows: [[areaId, 'Country', 'Administrative', 1]],
        },
        area: {
          columns: ['id', 'area_type_id', 'code', 'name', 'valid_from'],
          rows: [[areaId, areaId, 'E92000001', 'England', '2010-01-01']],
        },
        observation: {
          columns: [
            'id',
            'indicator_id',
            'area_id',
            'upload_batch_id',
            'from_date',
            'to_date',
            'value',
            'dimension_key',
            'created_by',
          ],
          rows: [
            [
              observationId,
              INDICATOR_ID,
              areaId,
              batchId,
              '2025-01-01',
              '2025-12-31',
              10,
              '',
              'pholio-migration',
            ],
          ],
        },
      },
    });
    const result = await apply({
      deletes: {
        indicator: [INDICATOR_ID],
        indicator_version: [VERSION_ID],
        upload_batch: [batchId],
        observation: [observationId],
      },
      relationships: { indicators: [], indicatorTopics: [] },
    });
    expect(result.changes.indicator_version).toEqual({ upserts: 0, deletes: 1 });
    expect(result.changes.upload_batch).toEqual({ upserts: 0, deletes: 1 });
    expect(await sql`SELECT id FROM published.indicator`).toEqual([]);
    expect(await sql`SELECT id FROM published.observation`).toEqual([]);
    for (const table of [
      'indicator',
      'indicator_version',
      'upload_batch',
      'observation',
      'indicator_version_topic',
    ]) {
      expect(await sql.unsafe(`SELECT count(*)::int AS count FROM ${table}`)).toEqual([
        { count: 0 },
      ]);
    }
    expect(await sql`SELECT count(*)::int AS count FROM data_migration`).toEqual([{ count: 2 }]);
  });
  it('rolls back cleared batch pointers when a later delete is blocked', async () => {
    const batchId = '22222222-2222-7222-8222-222222222222';
    await baseline({
      upserts: {
        indicator_version: versionWithBatch(batchId, '2026-01-01T00:00:00Z'),
        upload_batch: batch(batchId),
      },
    });
    await sql`INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
      VALUES (${INDICATOR_ID}, ${VERSION_ID}, 'publisher.csv', ${PUBLISHER})`;
    await expect(
      apply({
        deletes: {
          indicator: [INDICATOR_ID],
          indicator_version: [VERSION_ID],
          upload_batch: [batchId],
        },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow('indicator_version deletion is blocked by retained references');
    expect(
      await sql`SELECT upload_batch_id, data_table_confirmed_at IS NOT NULL AS confirmed FROM indicator_version`,
    ).toEqual([{ upload_batch_id: batchId, confirmed: true }]);
    await assertRolledBack();
  });
  it('loads prepared CSV NULLs separately from quoted empty strings', async () => {
    await baseline({
      upserts: {
        indicator_version: {
          columns: [...VERSION_COLUMNS, 'definition', 'rationale'],
          rows: [[...VERSION_ROW, null, '']],
        },
      },
    });
    expect(await sql`SELECT definition, rationale FROM indicator_version`).toEqual([
      { definition: null, rationale: '' },
    ]);
    await apply({
      upserts: {
        indicator_version: {
          columns: [...VERSION_COLUMNS, 'definition', 'rationale'],
          rows: [[...VERSION_ROW, '', null]],
        },
      },
    });
    expect(await sql`SELECT definition, rationale FROM indicator_version`).toEqual([
      { definition: '', rationale: null },
    ]);
  });
  it('rolls back a version pointing at a missing batch', async () => {
    await baseline();
    await expect(
      apply({
        upserts: { indicator_version: versionWithBatch(SOURCE_ID, '2026-01-01T00:00:00Z') },
      }),
    ).rejects.toThrow('indicator_version_upload_batch_fk');
    await assertRolledBack();
    expect(
      await sql`SELECT upload_batch_id, data_table_confirmed_at FROM indicator_version`,
    ).toEqual([{ upload_batch_id: null, data_table_confirmed_at: null }]);
  });
  it.each(['upload_batch_id', 'data_table_confirmed_at'])(
    'requires the paired batch field when a version header includes %s',
    async (column) => {
      await baseline();
      await expect(
        apply({
          upserts: {
            indicator_version: {
              columns: [...VERSION_COLUMNS, column],
              rows: [[...VERSION_ROW, null]],
            },
          },
        }),
      ).rejects.toThrow(
        `missing required columns: ${column === 'upload_batch_id' ? 'data_table_confirmed_at' : 'upload_batch_id'}`,
      );
      await assertRolledBack();
    },
  );
  it('loads a baseline, enforces predecessor order and preserves idempotence', async () => {
    expect((await baseline()).applied).toBe(true);
    await expect(apply({ predecessor: 'wrong' })).rejects.toThrow(/predecessor/);
    const fixture = await migrationFixture(sql, directory, topicId);
    const first = await sql.begin((tx) =>
      applyDataMigration(tx, directory, fixture.manifest, fixture.sha256),
    );
    const second = await sql.begin((tx) =>
      applyDataMigration(tx, directory, fixture.manifest, fixture.sha256),
    );
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    // Read raw: a Drizzle handle over this client would change how it sends the package's JSON.
    const entries = await sql`
      SELECT actor_id, action, entity_type, request_id, changes FROM audit_log
      WHERE entity_id = ${fixture.manifest.migration_id}
    `;
    expect(entries).toEqual([
      {
        actor_id: SYSTEM_USER_IDS.pholioMigration,
        action: 'data_migration.applied',
        entity_type: 'data_migration',
        request_id: null,
        changes: expect.objectContaining({
          id: { before: null, after: fixture.manifest.migration_id },
          kind: { before: null, after: 'incremental' },
          packageSha256: { before: null, after: fixture.sha256 },
          tableChanges: { before: null, after: first.changes },
        }),
      },
    ]);
    await expect(
      sql.begin((tx) => applyDataMigration(tx, directory, fixture.manifest, 'f'.repeat(64))),
    ).rejects.toThrow('already applied with another package');
    const [row] = await sql<{ count: number; shortId: number }[]>`
      SELECT (SELECT count(*)::int FROM data_migration) AS count,
        nextval('indicator_short_id_seq')::int AS "shortId"
    `;
    expect(row).toEqual({ count: 2, shortId: 100000 });
  });
  it('refuses a baseline on nonempty target tables', async () => {
    await sql`INSERT INTO indicator (id, short_id) VALUES (${INDICATOR_ID}, 108)`;
    await expect(baseline()).rejects.toThrow('Baseline target table indicator is not empty');
  });
  it('checks declared baseline row counts', async () => {
    const fixture = await migrationFixture(sql, directory, topicId, { baseline: true });
    if (fixture.manifest.kind !== 'baseline') throw new Error('Expected baseline');
    const entry = fixture.manifest.tables.indicator;
    if (!entry) throw new Error('Missing indicator entry');
    entry.rows = 2;
    await expect(
      sql.begin((tx) => applyDataMigration(tx, directory, fixture.manifest, fixture.sha256)),
    ).rejects.toThrow('Baseline row count failed for indicator');
  });
  it.each([
    [
      ['id', 'name', 'hierarchy_type', 'level', 'bogus_column'],
      'columns the target table does not: bogus_column',
    ],
    [['id', 'hierarchy_type', 'level'], 'missing required columns: name'],
    [['name', 'hierarchy_type', 'level'], 'missing required columns: id'],
  ])('refuses invalid area_type headers: %j', async (columns, error) => {
    await baseline();
    await expect(
      apply({ upserts: { area_type: { columns: columns as string[] } } }),
    ).rejects.toThrow(error as string);
    await assertRolledBack();
  });
  it('requires imported numeric indicator identities', async () => {
    await baseline();
    await expect(apply({ upserts: { indicator: { columns: ['id'] } } })).rejects.toThrow(
      'missing required columns: short_id',
    );
  });
  it.each(
    [VERSION_COLUMNS.slice(0, -2), VERSION_COLUMNS.slice(0, -1)].map((columns) => ({ columns })),
  )('rejects a version header missing legacy source columns: %j', async ({ columns }) => {
    await baseline();
    await expect(
      apply({
        upserts: { indicator_version: { columns, rows: [VERSION_ROW.slice(0, columns.length)] } },
      }),
    ).rejects.toThrow('missing required columns:');
    await assertRolledBack();
  });
  it('records zero applied rows for staged reference tables', async () => {
    await baseline();
    const applied = await apply({
      upserts: {
        numerator_denominator_source: {
          columns: ['id', 'name', 'url'],
          rows: [[SOURCE_ID, 'Not applicable (N/A)', null]],
        },
      },
    });
    expect(applied.changes.numerator_denominator_source).toEqual({ upserts: 0, deletes: 0 });
    const [ledger] = await sql<
      { changes: unknown }[]
    >`SELECT table_changes->'numerator_denominator_source' AS changes FROM data_migration WHERE id = 'increment-2'`;
    expect(ledger?.changes).toEqual({ upserts: 0, deletes: 0 });
  });
  it('preserves sequence allocations consumed by rolled-back publisher writes', async () => {
    await baseline();
    await expect(
      sql.begin(async (tx) => {
        await tx`INSERT INTO indicator DEFAULT VALUES`;
        throw new Error('publisher rollback');
      }),
    ).rejects.toThrow('publisher rollback');
    await apply();
    const [created] = await sql<
      { shortId: number }[]
    >`INSERT INTO indicator DEFAULT VALUES RETURNING short_id AS "shortId"`;
    expect(created?.shortId).toBe(100001);
  });
  it('waits for concurrent publisher identities and never reissues their IDs', async () => {
    await baseline();
    const publisher = database.connect({ max: 1 });
    const observer = database.connect({ max: 1 });
    let release!: () => void;
    let ready!: () => void;
    const acquired = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = publisher.begin(async (tx) => {
      await tx`INSERT INTO indicator DEFAULT VALUES`;
      ready();
      await held;
    });
    let migrating: ReturnType<typeof apply> | undefined;
    try {
      await acquired;
      migrating = apply();
      await vi.waitFor(async () => {
        const [lock] = await observer<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_locks WHERE relation = 'indicator'::regclass
            AND mode = 'ShareRowExclusiveLock' AND NOT granted) AS waiting
        `;
        expect(lock?.waiting).toBe(true);
      });
      release();
      await pending;
      await migrating;
      const [created] = await publisher<
        { shortId: number }[]
      >`INSERT INTO indicator DEFAULT VALUES RETURNING short_id AS "shortId"`;
      expect(created?.shortId).toBe(100001);
    } finally {
      release();
      await pending;
      await migrating;
      await publisher.end();
      await observer.end();
    }
  });
  it.each(['indicator_version', 'indicator_version_topic', 'indicator_version_classification'])(
    'holds concurrent publisher writes to %s until the package commits',
    async (table) => {
      await baseline();
      const fixture = await migrationFixture(sql, directory, topicId);
      const publisher = database.connect({ max: 1 });
      const observer = database.connect({ max: 1 });
      const [otherTopic] = await sql<
        { id: string }[]
      >`SELECT id FROM topic WHERE id <> ${topicId} LIMIT 1`;
      if (!otherTopic) throw new Error('Missing second core topic');
      let release!: () => void;
      let ready!: () => void;
      const acquired = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const migrating = sql.begin(async (tx) => {
        await applyDataMigration(tx, directory, fixture.manifest, fixture.sha256);
        ready();
        await held;
      });
      let writing: Promise<unknown> | undefined;
      try {
        await acquired;
        writing = publisher.begin(async (tx) => {
          if (table === 'indicator_version') {
            await tx`INSERT INTO indicator_version (id, indicator_id, name, slug, created_by, updated_by)
              VALUES (${SOURCE_ID}, ${INDICATOR_ID}, 'Publisher draft', 'test-indicator', ${PUBLISHER}, ${PUBLISHER})`;
          } else if (table === 'indicator_version_topic') {
            await tx`INSERT INTO indicator_version_topic (indicator_version_id, topic_id)
              VALUES (${VERSION_ID}, ${otherTopic.id})`;
          } else {
            await tx`INSERT INTO indicator_version_classification (indicator_version_id, classification_id)
              VALUES (${VERSION_ID}, ${frameworkId})`;
          }
        });
        await vi.waitFor(async () => {
          const [lock] = await observer<{ waiting: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM pg_locks WHERE relation = ${table}::regclass
              AND mode = 'RowExclusiveLock' AND NOT granted) AS waiting
          `;
          expect(lock?.waiting).toBe(true);
        });
        expect(await observer`SELECT name FROM published.indicator`).toEqual([
          { name: 'Test indicator' },
        ]);
        release();
        await migrating;
        await writing;
        if (table === 'indicator_version') {
          expect(await sql`SELECT status FROM indicator_version WHERE id = ${SOURCE_ID}`).toEqual([
            { status: 'draft' },
          ]);
        } else if (table === 'indicator_version_topic') {
          expect(
            await sql`SELECT topic_id FROM indicator_version_topic
            WHERE indicator_version_id = ${VERSION_ID} AND topic_id = ${otherTopic.id}`,
          ).toEqual([{ topic_id: otherTopic.id }]);
        } else {
          expect(
            await sql`SELECT classification_id FROM indicator_version_classification
            WHERE indicator_version_id = ${VERSION_ID}`,
          ).toEqual([{ classification_id: frameworkId }]);
        }
      } finally {
        release();
        await migrating;
        await writing;
        await publisher.end();
        await observer.end();
      }
    },
  );
  it('checks publisher version changes committed while the migration waits', async () => {
    await baseline();
    const publisher = database.connect({ max: 1 });
    const observer = database.connect({ max: 1 });
    let release!: () => void;
    let ready!: () => void;
    const acquired = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writing = publisher.begin(async (tx) => {
      await tx`UPDATE indicator_version SET status = 'draft', published_at = NULL WHERE id = ${VERSION_ID}`;
      ready();
      await held;
    });
    let rejected: Promise<void> | undefined;
    try {
      await acquired;
      rejected = expect(apply({ upserts: { indicator_version: version() } })).rejects.toThrow(
        'conflicts with FPHD publisher work on indicators: 108',
      );
      await vi.waitFor(async () => {
        const [lock] = await observer<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_locks WHERE relation = 'indicator_version'::regclass
            AND mode = 'ShareRowExclusiveLock' AND NOT granted) AS waiting
        `;
        expect(lock?.waiting).toBe(true);
      });
      release();
      await writing;
      await rejected;
      expect(await sql`SELECT status FROM indicator_version WHERE id = ${VERSION_ID}`).toEqual([
        { status: 'draft' },
      ]);
      expect(await sql`SELECT count(*)::int AS count FROM data_migration`).toEqual([{ count: 1 }]);
    } finally {
      release();
      await writing;
      await rejected;
      await publisher.end();
      await observer.end();
    }
  });
  it('names unknown topic and classification IDs in relationship errors', async () => {
    await baseline();
    await expect(
      apply({ relationships: { indicatorTopics: [{ fingertipsId: 108, topicId: SOURCE_ID }] } }),
    ).rejects.toThrow(`unknown topics: ${SOURCE_ID}`);
    await expect(
      apply({
        relationships: {
          indicatorClassifications: [{ fingertipsId: 108, classificationId: SOURCE_ID }],
        },
      }),
    ).rejects.toThrow(`unknown classifications: ${SOURCE_ID}`);
    await assertRolledBack();
  });
  it.each([
    { indicators: [], error: 'published indicators absent from coverage: 108' },
    { indicators: [108, 109], error: 'declared indicators without a published version: 109' },
  ])(
    'names mismatched indicator coverage and rolls back: $error',
    async ({ indicators, error }) => {
      await baseline();
      await expect(apply({ relationships: { indicators, indicatorTopics: [] } })).rejects.toThrow(
        error,
      );
      await assertRolledBack();
    },
  );
  it('names identities whose deletion is blocked by publisher uploads', async () => {
    await baseline();
    await sql`INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by) VALUES (${INDICATOR_ID}, ${VERSION_ID}, 'publisher.csv', ${PUBLISHER})`;
    await expect(
      apply({
        deletes: { indicator: [INDICATOR_ID], indicator_version: [VERSION_ID] },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow(
      `indicator_version deletion is blocked by retained references (ids: ${VERSION_ID})`,
    );
    await assertRolledBack();
  });
  it.each([0, 2])(
    'rejects a declared delete count of %s before deleting its staged row',
    async (rows) => {
      await baseline();
      await sql`INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by) VALUES (${INDICATOR_ID}, ${VERSION_ID}, 'publisher.csv', ${PUBLISHER})`;
      await expect(
        apply({
          deletes: { indicator: [INDICATOR_ID], indicator_version: [VERSION_ID] },
          deleteRows: { indicator_version: rows },
          relationships: { indicators: [], indicatorTopics: [] },
        }),
      ).rejects.toThrow(`indicator_version staged 1 deletes; package declares ${rows}`);
      await assertRolledBack();
    },
  );
  it('refuses a mislabeled delete header and retains the target row', async () => {
    await baseline({
      upserts: { data_source: { columns: ['id', 'name'], rows: [[SOURCE_ID, 'Retained source']] } },
    });
    await expect(
      apply({ deletes: { data_source: [SOURCE_ID] }, deleteHeaders: { data_source: ['name'] } }),
    ).rejects.toThrow(
      'data_migration_delete_data_source CSV has columns the target table does not: name',
    );
    const [row] = await sql<
      { name: string }[]
    >`SELECT name FROM data_source WHERE id = ${SOURCE_ID}`;
    expect(row?.name).toBe('Retained source');
    await assertRolledBack();
  });
  it('maps source CI method names to core UUIDs', async () => {
    await baseline();
    const row = [...VERSION_ROW];
    row[8] = SOURCE_ID;
    await apply({
      upserts: {
        indicator_version: { columns: VERSION_COLUMNS, rows: [row] },
        ci_method: {
          columns: ['id', 'name', 'description'],
          rows: [[SOURCE_ID, 'Normal approximation', null]],
        },
      },
    });
    const [loaded] = await sql<{ name: string }[]>`
      SELECT c.name FROM indicator_version v JOIN ci_method c ON c.id = v.ci_method_id WHERE v.id = ${VERSION_ID}
    `;
    expect(loaded?.name).toBe('Wald normal approximation');
  });
  it.each(['baseline', 'increment'] as const)(
    '%s imports reject unmapped sources before loading observations',
    async (kind) => {
      if (kind === 'increment') await baseline();
      const { manifest, sha256 } = await migrationFixture(sql, directory, topicId, {
        baseline: kind === 'baseline',
        upserts: {
          indicator_version: version([SOURCE_ID, null]),
          numerator_denominator_source: {
            columns: ['id', 'name', 'url'],
            rows: [[SOURCE_ID, 'Unknown source', null]],
          },
        },
      });
      const progress: DataMigrationProgress[] = [];
      await expect(
        sql.begin((tx) =>
          applyDataMigration(tx, directory, manifest, sha256, (event) => progress.push(event)),
        ),
      ).rejects.toThrow('No mapping for the sources Unknown source');
      expect(progress.some(({ table }) => table === 'observation')).toBe(false);
      const [counts] = await sql<{ versions: number; migrations: number }[]>`
        SELECT count(*)::int AS versions,
          (SELECT count(*)::int FROM data_migration) AS migrations
        FROM indicator_version
      `;
      const expected = kind === 'baseline' ? 0 : 1;
      expect(counts).toEqual({ versions: expected, migrations: expected });
    },
  );
  it('leaves sources of unchanged versions intact', async () => {
    await baseline({
      upserts: {
        indicator_version: version([SOURCE_ID, null]),
        numerator_denominator_source: {
          columns: ['id', 'name', 'url'],
          rows: [[SOURCE_ID, 'Care Quality Commission (CQC), Care directory', null]],
        },
      },
    });
    await apply();
    expect(await sourceCount()).toBe(1);
  });
  it.each([null, 'Not applicable (N/A)'])(
    'removes obsolete numerator and denominator sources for %s',
    async (name) => {
      await baseline({
        upserts: {
          indicator_version: version([SOURCE_ID, SOURCE_ID]),
          numerator_denominator_source: {
            columns: ['id', 'name', 'url'],
            rows: [[SOURCE_ID, 'Care Quality Commission (CQC), Care directory', null]],
          },
        },
      });
      expect(await sourceCount()).toBe(2);
      await apply({
        upserts: {
          indicator_version: version(name === null ? [null, null] : [SOURCE_ID, SOURCE_ID]),
          numerator_denominator_source: {
            columns: ['id', 'name', 'url'],
            rows: name === null ? [] : [[SOURCE_ID, name, null]],
          },
        },
      });
      expect(await sourceCount()).toBe(0);
    },
  );
  it('shrinks source mappings and reads a reordered legacy source header by name', async () => {
    await baseline({
      upserts: {
        indicator_version: version([SOURCE_ID, null]),
        numerator_denominator_source: {
          columns: ['name', 'url', 'id'],
          rows: [
            [
              'Ministry of Housing, Communities and Local Government (MHCLG), Homelessness statistics and Department for Energy Security and Net Zero (DESNZ), Fuel poverty statistics',
              null,
              SOURCE_ID,
            ],
          ],
        },
      },
    });
    expect(await sourceCount()).toBe(2);
    await apply({
      upserts: {
        indicator_version: version([SOURCE_ID, null]),
        numerator_denominator_source: {
          columns: ['name', 'id', 'url'],
          rows: [['Care Quality Commission (CQC), Care directory', SOURCE_ID, null]],
        },
      },
    });
    expect(await sourceCount()).toBe(1);
    const [provider] = await sql<{ name: string }[]>`
      SELECT p.name FROM indicator_version_source s JOIN data_provider p ON p.id = s.provider_id WHERE s.indicator_version_id = ${VERSION_ID}
    `;
    expect(provider?.name).toBe('Care Quality Commission (CQC)');
  });
  it.each([
    { columns: ['id', 'name'], rows: [['invalid-uuid', 'Bad source']], code: '22P02' },
    { columns: ['id', 'name'], rows: [[SOURCE_ID, 'Bad source', 'extra']], code: '22P04' },
  ])(
    'rejects COPY errors after EOF and leaves the connection usable: $code',
    async ({ columns, rows, code }) => {
      await baseline();
      await expect(apply({ upserts: { data_source: { columns, rows } } })).rejects.toMatchObject({
        code,
      });
      await assertRolledBack();
      expect((await apply()).applied).toBe(true);
    },
  );
  it('preserves historical topics, classifications and answers', async () => {
    await baseline();
    const preserved = await sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by, has_framework)
      VALUES (${INDICATOR_ID}, 'published', '2025-01-01', 'History', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}, true)
      RETURNING id
    `;
    for (const { id } of preserved) {
      await sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${id}, ${topicId})`;
      await sql`INSERT INTO indicator_version_classification (indicator_version_id, classification_id) VALUES (${id}, ${frameworkId})`;
    }
    await apply({ upserts: { indicator_version: version() } });
    const rows = await sql<
      { status: string; topics: number; classifications: number; hasFramework: boolean }[]
    >`
      SELECT v.status, v.has_framework AS "hasFramework",
        (SELECT count(*)::int FROM indicator_version_topic t WHERE t.indicator_version_id = v.id) AS topics,
        (SELECT count(*)::int FROM indicator_version_classification c WHERE c.indicator_version_id = v.id) AS classifications
      FROM indicator_version v WHERE v.id IN ${sql(preserved.map(({ id }) => id))} ORDER BY status
    `;
    expect(rows).toEqual([
      { status: 'published', hasFramework: true, topics: 1, classifications: 1 },
    ]);
  });
  it.each(['draft', 'publication', 'edit'])(
    'refuses an increment conflicting with a publisher %s and keeps its assignments',
    async (kind) => {
      await baseline();
      const [otherTopic] = await sql<
        { id: string }[]
      >`SELECT id FROM topic WHERE id <> ${topicId} LIMIT 1`;
      if (!otherTopic) throw new Error('Missing second core topic');
      let versionId = VERSION_ID;
      if (kind === 'edit') {
        await sql`UPDATE indicator_version SET updated_by = ${PUBLISHER}, has_framework = true WHERE id = ${VERSION_ID}`;
        await sql`DELETE FROM indicator_version_topic WHERE indicator_version_id = ${VERSION_ID}`;
      } else {
        const [created] = await sql<{ id: string }[]>`
          INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by, has_framework)
          VALUES (${INDICATOR_ID}, ${kind === 'draft' ? 'draft' : 'published'},
            ${kind === 'draft' ? null : '2026-10-01'}, 'Publisher work', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}, true)
          RETURNING id
        `;
        if (!created) throw new Error('Missing publisher version');
        versionId = created.id;
      }
      await sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${versionId}, ${otherTopic.id})`;
      await sql`INSERT INTO indicator_version_classification (indicator_version_id, classification_id) VALUES (${versionId}, ${frameworkId})`;
      const row = [...VERSION_ROW];
      row[4] = 'Source correction';
      await expect(
        apply({ upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } } }),
      ).rejects.toThrow('conflicts with FPHD publisher work on indicators: 108');
      expect(
        await sql`SELECT topic_id FROM indicator_version_topic WHERE indicator_version_id = ${versionId}`,
      ).toEqual([{ topic_id: otherTopic.id }]);
      expect(
        await sql`SELECT has_framework FROM indicator_version WHERE id = ${versionId}`,
      ).toEqual([{ has_framework: true }]);
      expect(
        await sql`SELECT classification_id FROM indicator_version_classification WHERE indicator_version_id = ${versionId}`,
      ).toEqual([{ classification_id: frameworkId }]);
      expect(await sql`SELECT name FROM indicator_version WHERE id = ${VERSION_ID}`).toEqual([
        { name: 'Test indicator' },
      ]);
      expect(await sql`SELECT count(*)::int AS count FROM data_migration`).toEqual([{ count: 1 }]);
    },
  );
  it('retains FPHD-only publications and their assignments outside migration coverage', async () => {
    await baseline();
    const [identity] = await sql<
      { id: string }[]
    >`INSERT INTO indicator DEFAULT VALUES RETURNING id`;
    if (!identity) throw new Error('Missing publisher indicator');
    const [publication] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by, has_framework)
      VALUES (${identity.id}, 'published', '2026-10-01', 'FPHD only', 'fphd-only', ${PUBLISHER}, ${PUBLISHER}, true) RETURNING id
    `;
    if (!publication) throw new Error('Missing publisher publication');
    await sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${publication.id}, ${topicId})`;
    await sql`INSERT INTO indicator_version_classification (indicator_version_id, classification_id) VALUES (${publication.id}, ${frameworkId})`;
    await apply();
    expect(
      await sql`SELECT has_framework FROM indicator_version WHERE id = ${publication.id}`,
    ).toEqual([{ has_framework: true }]);
    expect(
      await sql`SELECT topic_id FROM indicator_version_topic WHERE indicator_version_id = ${publication.id}`,
    ).toEqual([{ topic_id: topicId }]);
    expect(
      await sql`SELECT classification_id FROM indicator_version_classification WHERE indicator_version_id = ${publication.id}`,
    ).toEqual([{ classification_id: frameworkId }]);
    expect(await sql`SELECT count(*)::int AS count FROM published.indicator`).toEqual([
      { count: 2 },
    ]);
  });
  it.each([
    ['migrated', MIGRATED],
    ['publisher', PUBLISHER],
  ])('never moves an existing %s version to another indicator', async (_kind, actor) => {
    await baseline();
    const [identity] = await sql<{ id: string }[]>`
        INSERT INTO indicator (short_id) VALUES (109) RETURNING id
      `;
    if (!identity) throw new Error('Missing other indicator');
    await sql`
        INSERT INTO indicator_version (id, indicator_id, status, published_at, name, slug, created_by, updated_by)
        VALUES (${SOURCE_ID}, ${identity.id}, 'published', '2026-01-01', 'Other indicator', 'other-indicator', ${actor}, ${actor})
      `;
    await sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${SOURCE_ID}, ${topicId})`;
    const row = [...VERSION_ROW];
    row[0] = SOURCE_ID;
    await expect(
      apply({
        upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } },
        deletes: { indicator: [identity.id] },
      }),
    ).rejects.toThrow('would move indicator versions to another indicator');
    expect(
      await sql`SELECT indicator_id, name, created_by FROM indicator_version WHERE id = ${SOURCE_ID}`,
    ).toEqual([{ indicator_id: identity.id, name: 'Other indicator', created_by: actor }]);
    expect(
      await sql`SELECT topic_id FROM indicator_version_topic WHERE indicator_version_id = ${SOURCE_ID}`,
    ).toEqual([{ topic_id: topicId }]);
    expect(await sql`SELECT id FROM indicator WHERE id = ${identity.id}`).toEqual([
      { id: identity.id },
    ]);
    await assertRolledBack();
  });
  it.each([
    ['indicator', 'upsert'],
    ['upload_batch', 'upsert'],
    ['upload_batch', 'delete'],
    ['observation', 'upsert'],
    ['observation', 'delete'],
    ['observation', 'reassign'],
    ['observation', 'historical upsert'],
    ['observation_dimension', 'upsert'],
    ['observation_dimension', 'delete'],
    ['observation_note', 'upsert'],
    ['observation_note', 'delete'],
  ] as const)('protects publisher-owned %s rows from migration %s', async (table, action) => {
    await baseline();
    const [identity] = await sql<
      { id: string }[]
    >`INSERT INTO indicator (short_id) VALUES (109) RETURNING id`;
    if (!identity) throw new Error('Missing publisher indicator');
    const publisherIndicatorId = action === 'historical upsert' ? INDICATOR_ID : identity.id;
    const [publication] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by)
      VALUES (${publisherIndicatorId}, 'published', '2025-01-01', 'FPHD only',
        ${action === 'historical upsert' ? 'test-indicator' : 'fphd-only'}, ${PUBLISHER}, ${PUBLISHER}) RETURNING id
    `;
    if (!publication) throw new Error('Missing publisher publication');
    const [upload] = await sql<{ id: string }[]>`
      INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by, status)
      VALUES (${publisherIndicatorId}, ${publication.id}, 'publisher.csv', ${PUBLISHER}, 'processed') RETURNING id
    `;
    if (!upload) throw new Error('Missing publisher upload');
    await sql`UPDATE indicator_version SET upload_batch_id = ${upload.id}, data_table_confirmed_at = '2026-01-01' WHERE id = ${publication.id}`;
    const [areaType] = await sql<
      { id: string }[]
    >`INSERT INTO area_type (name, hierarchy_type, level) VALUES ('Country', 'Administrative', 1) RETURNING id`;
    if (!areaType) throw new Error('Missing area type');
    const [area] = await sql<
      { id: string }[]
    >`INSERT INTO area (area_type_id, code, name, valid_from) VALUES (${areaType.id}, 'E92000001', 'England', '2010-01-01') RETURNING id`;
    if (!area) throw new Error('Missing area');
    const [observed] = await sql<{ id: string }[]>`
      INSERT INTO observation (indicator_id, area_id, upload_batch_id, from_date, to_date, value, dimension_key)
      VALUES (${publisherIndicatorId}, ${area.id}, ${upload.id}, '2025-01-01', '2025-12-31', 10, '') RETURNING id
    `;
    if (!observed) throw new Error('Missing observation');
    const [dimensionType] = await sql<
      { id: string }[]
    >`INSERT INTO dimension_type (name, dimension_class) VALUES ('Sex', 'core') RETURNING id`;
    if (!dimensionType) throw new Error('Missing dimension type');
    const [dimensionValue] = await sql<
      { id: string }[]
    >`INSERT INTO dimension_value (dimension_type_id, name) VALUES (${dimensionType.id}, 'Female') RETURNING id`;
    if (!dimensionValue) throw new Error('Missing dimension value');
    const [dimension] = await sql<
      { id: string }[]
    >`INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id) VALUES (${observed.id}, ${dimensionValue.id}, ${dimensionType.id}) RETURNING id`;
    const [noteType] = await sql<
      { id: string }[]
    >`INSERT INTO note_type (text, category) VALUES ('Publisher note', 'quality') RETURNING id`;
    if (!dimension || !noteType) throw new Error('Missing observation attributes');
    const [note] = await sql<
      { id: string }[]
    >`INSERT INTO observation_note (observation_id, note_type_id) VALUES (${observed.id}, ${noteType.id}) RETURNING id`;
    if (!note) throw new Error('Missing note');
    const fixtures = {
      indicator: {
        columns: ['id', 'short_id', 'data_updated_at'],
        rows: [[identity.id, 109, '2026-02-01']],
      },
      upload_batch: {
        columns: [
          'id',
          'indicator_id',
          'indicator_version_id',
          'original_filename',
          'uploaded_by',
          'status',
        ],
        rows: [
          [
            upload.id,
            publisherIndicatorId,
            publication.id,
            'replacement.csv',
            'pholio-migration',
            'processed',
          ],
        ],
      },
      observation: {
        columns: [
          'id',
          'indicator_id',
          'area_id',
          'upload_batch_id',
          'from_date',
          'to_date',
          'value',
          'dimension_key',
          'created_by',
        ],
        rows: [
          [
            observed.id,
            publisherIndicatorId,
            area.id,
            upload.id,
            '2025-01-01',
            '2025-12-31',
            999,
            '',
            'pholio-migration',
          ],
        ],
      },
      observation_dimension: {
        columns: ['id', 'observation_id', 'dimension_value_id', 'dimension_type_id'],
        rows: [[dimension.id, observed.id, dimensionValue.id, dimensionType.id]],
      },
      observation_note: {
        columns: ['id', 'observation_id', 'note_type_id'],
        rows: [[note.id, observed.id, noteType.id]],
      },
    };
    const ids = {
      indicator: identity.id,
      upload_batch: upload.id,
      observation: observed.id,
      observation_dimension: dimension.id,
      observation_note: note.id,
    };
    if (action === 'reassign') {
      const [sourceBatch] = await sql<{ id: string }[]>`
        INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by, status)
        VALUES (${INDICATOR_ID}, ${VERSION_ID}, 'source.csv', ${MIGRATED}, 'processed') RETURNING id
      `;
      if (!sourceBatch) throw new Error('Missing source batch');
      fixtures.observation.rows[0] = [
        observed.id,
        INDICATOR_ID,
        area.id,
        sourceBatch.id,
        '2025-01-01',
        '2025-12-31',
        999,
        '',
        'pholio-migration',
      ];
    }
    await expect(
      apply(
        action !== 'delete'
          ? { upserts: { [table]: fixtures[table] } }
          : { deletes: { [table]: [ids[table]] } },
      ),
    ).rejects.toThrow(
      `conflicts with FPHD publisher work on indicators: ${action === 'historical upsert' ? 108 : 109}`,
    );
    expect(await sql`SELECT value FROM observation WHERE id = ${observed.id}`).toEqual([
      { value: 10 },
    ]);
    expect(await sql`SELECT original_filename FROM upload_batch WHERE id = ${upload.id}`).toEqual([
      { original_filename: 'publisher.csv' },
    ]);
    expect(await sql`SELECT id FROM observation_dimension WHERE id = ${dimension.id}`).toEqual([
      { id: dimension.id },
    ]);
    expect(await sql`SELECT id FROM observation_note WHERE id = ${note.id}`).toEqual([
      { id: note.id },
    ]);
    expect(await sql`SELECT data_updated_at FROM indicator WHERE id = ${identity.id}`).toEqual([
      { data_updated_at: null },
    ]);
    await assertRolledBack();
  });
  it('refuses a withdrawal when its indicator has a publisher draft', async () => {
    await baseline();
    await sql`INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      VALUES (${INDICATOR_ID}, 'Publisher draft', 'test-indicator', ${PUBLISHER}, ${PUBLISHER})`;
    await expect(
      apply({
        deletes: { indicator: [INDICATOR_ID], indicator_version: [VERSION_ID] },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow('conflicts with FPHD publisher work on indicators: 108');
    await assertRolledBack();
  });
  it('requires the source audit actor before accepting a version', async () => {
    const row = [...VERSION_ROW];
    row[7] = 'publisher';
    await expect(
      baseline({ upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } } }),
    ).rejects.toThrow('must name pholio-migration as their audit actor');
    expect(await sql`SELECT count(*)::int AS count FROM indicator`).toEqual([{ count: 0 }]);
    expect(await sql`SELECT count(*)::int AS count FROM data_migration`).toEqual([{ count: 0 }]);
  });
  it('allows unrelated draft-only indicators without changing them', async () => {
    await baseline();
    const [identity] = await sql<
      { id: string }[]
    >`INSERT INTO indicator DEFAULT VALUES RETURNING id`;
    const [draft] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      VALUES (${identity?.id ?? ''}, 'Publisher draft', 'publisher-draft', ${PUBLISHER}, ${PUBLISHER}) RETURNING id
    `;
    await sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${draft?.id ?? ''}, ${topicId})`;
    await apply();
    const [row] = await sql<{ name: string; topics: number }[]>`
      SELECT name, (SELECT count(*)::int FROM indicator_version_topic WHERE indicator_version_id = v.id) AS topics
      FROM indicator_version v WHERE id = ${draft?.id ?? ''}
    `;
    expect(row).toEqual({ name: 'Publisher draft', topics: 1 });
  });
  it('refuses non-published source versions and rolls back the increment', async () => {
    await baseline();
    const row = [...VERSION_ROW];
    row[2] = 'draft';
    row[3] = null;
    await expect(
      apply({ upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } } }),
    ).rejects.toThrow('contains a non-published indicator version');
    await assertRolledBack();
  });
  it('refuses source versions that would overwrite a publisher draft', async () => {
    await baseline();
    const [draft] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      VALUES (${INDICATOR_ID}, 'Publisher draft', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}) RETURNING id
    `;
    const row = [...VERSION_ROW];
    row[0] = draft?.id ?? '';
    await expect(
      apply({ upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } } }),
    ).rejects.toThrow('conflicts with FPHD publisher work on indicators: 108');
    await assertRolledBack();
  });
  it('refuses source deletions that would remove a publisher draft', async () => {
    await baseline();
    const [draft] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      VALUES (${INDICATOR_ID}, 'Publisher draft', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}) RETURNING id
    `;
    await expect(
      apply({
        deletes: { indicator_version: [draft?.id ?? ''] },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow('would delete a non-published indicator version');
    await assertRolledBack();
    const [remaining] = await sql<
      { name: string }[]
    >`SELECT name FROM indicator_version WHERE id = ${draft?.id ?? ''}`;
    expect(remaining?.name).toBe('Publisher draft');
  });
  it('refuses source indicators with no published version or reviewed topic coverage', async () => {
    await baseline();
    await expect(
      apply({ upserts: { indicator: { columns: ['id', 'short_id'], rows: [[SOURCE_ID, 109]] } } }),
    ).rejects.toThrow('source indicators are missing from reviewed relationship coverage: 109');
    await assertRolledBack();
  });
  it('clears removed classification answers and retains answers backed by assignments', async () => {
    await baseline({
      relationships: {
        indicatorClassifications: [
          { fingertipsId: 108, classificationId: frameworkId },
          { fingertipsId: 108, classificationId: lifeStageId },
        ],
      },
    });
    await apply({
      relationships: {
        indicatorClassifications: [{ fingertipsId: 108, classificationId: lifeStageId }],
      },
    });
    const [row] = await sql<{ framework: boolean | null; lifeStage: boolean | null }[]>`
      SELECT has_framework AS framework, has_life_stage AS "lifeStage" FROM indicator_version WHERE id = ${VERSION_ID}
    `;
    expect(row).toEqual({ framework: false, lifeStage: true });
    await apply({
      predecessor: 'increment-2',
      migrationId: 'increment-3',
      cutoffAt: '2026-09-23T10:00:00Z',
    });
    const [removed] = await sql<
      { lifeStage: boolean | null }[]
    >`SELECT has_life_stage AS "lifeStage" FROM indicator_version WHERE id = ${VERSION_ID}`;
    expect(removed?.lifeStage).toBe(false);
  });
  it('retains explicit negative classification answers', async () => {
    await baseline();
    await sql`UPDATE indicator_version SET has_framework = false, has_life_stage = false WHERE id = ${VERSION_ID}`;
    await apply();
    const [row] = await sql<{ framework: boolean; lifeStage: boolean }[]>`
      SELECT has_framework AS framework, has_life_stage AS "lifeStage" FROM indicator_version WHERE id = ${VERSION_ID}
    `;
    expect(row).toEqual({ framework: false, lifeStage: false });
  });
  it('refuses missing topics and rolls back source edits, relationships and the ledger', async () => {
    await baseline();
    const [history] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by)
      VALUES (${INDICATOR_ID}, 'published', '2025-01-01', 'History', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}) RETURNING id
    `;
    await sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${history?.id ?? ''}, ${topicId})`;
    const row = [...VERSION_ROW];
    row[4] = 'Changed name';
    await expect(
      apply({
        migrationId: 'refused-increment',
        relationships: { indicatorTopics: [] },
        upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } },
      }),
    ).rejects.toThrow('Migrated indicators have no topic: 108 (Changed name)');
    await assertRolledBack();
    await expect(
      sql`SELECT 1 FROM audit_log WHERE entity_id = 'refused-increment'`,
    ).resolves.toHaveLength(0);
  });
  it.each(['link', 'age range'])(
    'protects publisher %s rows when source versions are deleted',
    async (child) => {
      await baseline();
      if (child === 'link') {
        await sql`INSERT INTO indicator_version_link (indicator_version_id, position, url, text) VALUES (${VERSION_ID}, 0, 'https://example.test', 'Publisher link')`;
      } else {
        await sql`INSERT INTO indicator_version_age_range (indicator_version_id, position, lower_limit, lower_limit_unit) VALUES (${VERSION_ID}, 0, 18, 'years')`;
      }
      const options = {
        deletes: { indicator: [INDICATOR_ID], indicator_version: [VERSION_ID] },
        relationships: { indicators: [], indicatorTopics: [] },
      };
      await expect(apply(options)).rejects.toThrow('publisher links or age ranges');
      await assertRolledBack();
      await sql`DELETE FROM indicator_version_link WHERE indicator_version_id = ${VERSION_ID}`;
      await sql`DELETE FROM indicator_version_age_range WHERE indicator_version_id = ${VERSION_ID}`;
      await apply(options);
      const [row] = await sql<{ indicators: number; topics: number }[]>`
      SELECT (SELECT count(*)::int FROM indicator) AS indicators,
        (SELECT count(*)::int FROM indicator_version_topic) AS topics
    `;
      expect(row).toEqual({ indicators: 0, topics: 0 });
    },
  );
});

describe('a publisher draft locked for review', () => {
  /** A locked draft of the baseline's indicator, holding a topic the package never names. */
  async function lockedDraft(): Promise<{ draftId: string; draftTopicId: string }> {
    const [otherTopic] = await sql<
      { id: string }[]
    >`SELECT id FROM topic WHERE id <> ${topicId} LIMIT 1`;
    const [draft] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by, is_locked)
      VALUES (${INDICATOR_ID}, 'Submitted draft', 'test-indicator', ${PUBLISHER}, ${PUBLISHER}, true)
      RETURNING id
    `;
    if (!otherTopic || !draft) throw new Error('Missing locked draft fixture');
    await sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) VALUES (${draft.id}, ${otherTopic.id})`;
    return { draftId: draft.id, draftTopicId: otherTopic.id };
  }

  async function topicsOf(versionId: string) {
    return sql`SELECT topic_id FROM indicator_version_topic WHERE indicator_version_id = ${versionId}`;
  }

  it('refuses a version upsert as publisher work, keeping the draft and its topics', async () => {
    await baseline();
    const { draftId, draftTopicId } = await lockedDraft();
    const row = [...VERSION_ROW];
    row[4] = 'Source correction';

    await expect(
      apply({
        upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow('Data migration conflicts with FPHD publisher work on indicators: 108');
    expect(await topicsOf(draftId)).toEqual([{ topic_id: draftTopicId }]);
    await assertRolledBack();
  });

  it('refuses a batch upsert under the indicator as publisher work', async () => {
    await baseline();
    await lockedDraft();

    await expect(
      apply({
        upserts: { upload_batch: batch(SOURCE_ID) },
        relationships: { indicators: [], indicatorTopics: [] },
      }),
    ).rejects.toThrow(
      'Data migration upload_batch upsert conflicts with FPHD publisher work on indicators: 108',
    );
    await assertRolledBack();
  });

  it('refuses relationships naming the indicator, keeping the draft topics', async () => {
    await baseline();
    const { draftId, draftTopicId } = await lockedDraft();

    await expect(apply()).rejects.toThrow(
      'conflicts with FPHD publisher work on indicators: 108. Resolve drafts',
    );
    expect(await topicsOf(draftId)).toEqual([{ topic_id: draftTopicId }]);
    await assertRolledBack();
  });

  it.each([
    [
      'its indicator',
      { indicator: [INDICATOR_ID], indicator_version: [VERSION_ID] },
      'Data migration indicator delete conflicts',
    ],
    [
      'its published version',
      { indicator_version: [VERSION_ID] },
      'Data migration deletion conflicts',
    ],
  ])('refuses a withdrawal of %s as publisher work', async (_, deletes, refusal) => {
    await baseline();
    await lockedDraft();

    await expect(
      apply({ deletes, relationships: { indicators: [], indicatorTopics: [] } }),
    ).rejects.toThrow(`${refusal} with FPHD publisher work on indicators: 108`);
    await assertRolledBack();
  });
});
