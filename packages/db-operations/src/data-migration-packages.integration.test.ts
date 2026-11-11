import { schema } from '@fphd/db';
import { describe, expect, it, vi } from 'vitest';

import {
  INDICATOR_ID,
  migrationFixture,
  SOURCE_ID,
  VERSION_COLUMNS,
  VERSION_ID,
  VERSION_ROW,
} from './data-migration.testing.ts';
import { applyDataMigration, type DataMigrationProgress } from './data-migration.ts';
import {
  batch,
  dataMigrationTestDb,
  MIGRATED,
  PUBLISHER,
  version,
  versionWithBatch,
} from './data-migration-db.testing.ts';

const { IMPORTED_INDICATOR_TEAM_ID } = schema;

const { database, sql, directory, topicId, frameworkId, apply, baseline, assertRolledBack } =
  await dataMigrationTestDb();

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
    // The ledger records each package; the audit log is for changes made through the service.
    await expect(sql`SELECT 1 FROM audit_log`).resolves.toHaveLength(0);
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
    await sql`INSERT INTO indicator (id, short_id, team_id) VALUES (${INDICATOR_ID}, 108, ${IMPORTED_INDICATOR_TEAM_ID})`;
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
        await tx`INSERT INTO indicator (team_id) VALUES (${IMPORTED_INDICATOR_TEAM_ID})`;
        throw new Error('publisher rollback');
      }),
    ).rejects.toThrow('publisher rollback');
    await apply();
    const [created] = await sql<
      { shortId: number }[]
    >`INSERT INTO indicator (team_id) VALUES (${IMPORTED_INDICATOR_TEAM_ID}) RETURNING short_id AS "shortId"`;
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
      await tx`INSERT INTO indicator (team_id) VALUES (${IMPORTED_INDICATOR_TEAM_ID})`;
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
      >`INSERT INTO indicator (team_id) VALUES (${IMPORTED_INDICATOR_TEAM_ID}) RETURNING short_id AS "shortId"`;
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
  it('requires the source audit actor before accepting a version', async () => {
    const row = [...VERSION_ROW];
    row[7] = 'publisher';
    await expect(
      baseline({ upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } } }),
    ).rejects.toThrow('must name pholio-migration as their audit actor');
    expect(await sql`SELECT count(*)::int AS count FROM indicator`).toEqual([{ count: 0 }]);
    expect(await sql`SELECT count(*)::int AS count FROM data_migration`).toEqual([{ count: 0 }]);
  });
});
