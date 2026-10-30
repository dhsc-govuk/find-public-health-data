import { readFileSync } from 'node:fs';

import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { READ_MODEL_TABLES, rebuildReadModels } from './read-models.ts';

const { IMPORTED_INDICATOR_TEAM_ID, SYSTEM_USER_IDS } = schema;

const ACTOR = SYSTEM_USER_IDS.pholioMigration;

const MISSING_UUID = '00000000-0000-0000-0000-000000000000';

let testDb: TestDb;
let sql: postgres.Sql;

beforeAll(async () => {
  testDb = await createTestDb({ template: 'seeded' });
  sql = testDb.sql;
});

afterAll(async () => {
  await testDb.drop();
});

describe('bridge/registry schema', () => {
  it('holds the seeded indicators', async () => {
    const rows = await sql`SELECT count(*)::int AS count FROM indicator`;
    expect(rows[0]?.count).toBe(12);
  });

  it('puts every seeded indicator in the Fingertips team', async () => {
    const rows = await sql<{ teamId: string | null }[]>`
      SELECT DISTINCT team_id AS "teamId" FROM indicator
    `;
    expect(rows).toEqual([{ teamId: IMPORTED_INDICATOR_TEAM_ID }]);
  });

  it("credits every seeded version and batch to an import's system user", async () => {
    const rows = await sql<{ actor: string }[]>`
      SELECT created_by AS actor FROM indicator_version
      UNION SELECT updated_by FROM indicator_version
      UNION SELECT uploaded_by FROM upload_batch
      ORDER BY actor
    `;
    expect(rows.map(({ actor }) => actor)).toEqual(
      [SYSTEM_USER_IDS.pholioMigration, SYSTEM_USER_IDS.testSeed].sort(),
    );
  });

  it('holds observations for every seeded indicator', async () => {
    const orphaned = await sql`
      SELECT i.id FROM indicator i
      WHERE NOT EXISTS (SELECT 1 FROM observation o WHERE o.indicator_id = i.id)
    `;
    expect(orphaned).toHaveLength(0);
  });

  it('generates time-ordered uuidv7 ids by default', async () => {
    const rows = await sql`
      INSERT INTO value_type (name, position) VALUES ('integration-test-value-type', 0)
      RETURNING id
    `;
    const id = rows[0]?.id as string;
    await sql`DELETE FROM value_type WHERE id = ${id}`;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('rejects an observation referencing an unknown indicator', async () => {
    await expect(sql`
      INSERT INTO observation
        (indicator_id, area_id, from_date, to_date, upload_batch_id, dimension_key)
      SELECT ${MISSING_UUID}, a.id, '2024-01-01', '2024-12-31', ub.id, ''
      FROM area a, upload_batch ub LIMIT 1
    `).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects a dimension type outside the permitted classes', async () => {
    await expect(sql`
      INSERT INTO dimension_type (name, dimension_class)
      VALUES ('integration-test-bogus', 'bogus')
    `).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects a second value of the same dimension type on one observation', async () => {
    const failed = sql.begin(async (tx) => {
      const rows = await tx`
        SELECT od.observation_id, od.dimension_type_id, dv.id AS other_value
        FROM observation_dimension od
        JOIN dimension_value dv
          ON dv.dimension_type_id = od.dimension_type_id AND dv.id <> od.dimension_value_id
        LIMIT 1
      `;
      const target = rows[0];
      await tx`
        INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id)
        VALUES (${target?.observation_id}, ${target?.other_value}, ${target?.dimension_type_id})
      `;
    });
    await expect(failed).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects an observation whose batch belongs to another indicator', async () => {
    const failed = sql.begin(async (tx) => {
      const rows = await tx`
        SELECT o.indicator_id, o.area_id, ub.id AS other_batch
        FROM observation o
        JOIN upload_batch ub ON ub.indicator_id <> o.indicator_id
        LIMIT 1
      `;
      const target = rows[0];
      await tx`
        INSERT INTO observation
          (indicator_id, area_id, from_date, to_date, upload_batch_id, dimension_key)
        VALUES
          (${target?.indicator_id}, ${target?.area_id}, '2024-01-01', '2024-12-31',
           ${target?.other_batch}, '')
      `;
    });
    await expect(failed).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects an observation period ending before it starts', async () => {
    const failed = sql.begin(async (tx) => {
      const rows = await tx`
        SELECT ub.indicator_id, ub.id AS batch, (SELECT id FROM area LIMIT 1) AS area_id
        FROM upload_batch ub
        LIMIT 1
      `;
      const target = rows[0];
      await tx`
        INSERT INTO observation
          (indicator_id, area_id, from_date, to_date, upload_batch_id, dimension_key)
        VALUES
          (${target?.indicator_id}, ${target?.area_id}, '2024-12-31', '2024-01-01',
           ${target?.batch}, '')
      `;
    });
    await expect(failed).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects overlapping validity ranges for one area code', async () => {
    const failed = sql.begin(async (tx) => {
      const areaTypes = await tx`SELECT id FROM area_type LIMIT 1`;
      const areaTypeId = areaTypes[0]?.id;
      await tx`
        INSERT INTO area (code, name, area_type_id, valid_from, valid_to)
        VALUES ('ITEST1', 'overlap a', ${areaTypeId}, '2020-01-01', NULL)
      `;
      await tx`
        INSERT INTO area (code, name, area_type_id, valid_from, valid_to)
        VALUES ('ITEST1', 'overlap b', ${areaTypeId}, '2022-01-01', NULL)
      `;
    });
    await expect(failed).rejects.toMatchObject({ code: '23P01' });
  });

  it('rebuilds populated read models', async () => {
    await rebuildReadModels(sql);
    for (const table of READ_MODEL_TABLES) {
      const rows = await sql.unsafe(`SELECT count(*)::int AS count FROM "${table}"`);
      expect(Number(rows[0]?.count), table).toBeGreaterThan(0);
    }
  });

  it('produces the same observation ranges as the migration query', async () => {
    await rebuildReadModels(sql);
    const journal = JSON.parse(
      readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
    ) as { entries: { tag: string }[] };
    const insert = journal.entries
      .slice()
      .reverse()
      .flatMap(({ tag }) =>
        readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8').split(
          '--> statement-breakpoint',
        ),
      )
      .find((statement) => /INSERT INTO ["']?observation_range["']?\s/i.test(statement));
    if (!insert) throw new Error('No observation-range migration insert found');

    await sql.begin(async (tx) => {
      await tx`CREATE TEMP TABLE migration_observation_range (LIKE observation_range INCLUDING ALL) ON COMMIT DROP`;
      await tx.unsafe(
        insert.replace(
          /INSERT INTO ["']?observation_range["']?/i,
          'INSERT INTO migration_observation_range',
        ),
      );
      const differences = await tx`
        (SELECT * FROM observation_range EXCEPT ALL SELECT * FROM migration_observation_range)
        UNION ALL
        (SELECT * FROM migration_observation_range EXCEPT ALL SELECT * FROM observation_range)
      `;
      expect(differences).toHaveLength(0);
    });
  });
});

describe('the read-model rebuild', () => {
  // Its own database, since the draft's rows would reach the migration query's parity check.
  let draftDb: TestDb;
  let draftSql: postgres.Sql;

  beforeAll(async () => {
    draftDb = await createTestDb({ template: 'seeded' });
    draftSql = draftDb.sql;
  });

  afterAll(async () => {
    await draftDb.drop();
  });

  it("leaves a draft's rows out of every read model", async () => {
    const [published] = await draftSql<{ id: string; indicatorId: string }[]>`
      SELECT cpv.id, cpv.indicator_id AS "indicatorId"
      FROM current_published_version cpv
      JOIN latest_headline lh ON lh.indicator_id = cpv.indicator_id
      LIMIT 1
    `;
    if (!published) throw new Error('The seed holds no indicator with headline rows');
    const [draft] = await draftSql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, name, slug, created_by, updated_by)
      SELECT indicator_id, 'draft', name, slug, ${ACTOR}::uuid, ${ACTOR}::uuid
      FROM indicator_version WHERE id = ${published.id}
      RETURNING id
    `;
    const [batch] = await draftSql<{ id: string }[]>`
      INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
      VALUES (${published.indicatorId}, ${draft?.id ?? ''}, 'draft.csv', ${ACTOR})
      RETURNING id
    `;
    await draftSql`UPDATE indicator_version SET upload_batch_id = ${batch?.id ?? ''} WHERE id = ${draft?.id ?? ''}`;
    // A headline for every area type, in a year no published row reaches.
    await draftSql`
      INSERT INTO observation
        (indicator_id, area_id, from_date, to_date, value, upload_batch_id, dimension_key)
      SELECT DISTINCT ON (a.area_type_id)
             ${published.indicatorId}::uuid, a.id, '2099-01-01'::date, '2099-12-31'::date,
             -1, ${batch?.id ?? ''}::uuid, ''
      FROM area a
      ORDER BY a.area_type_id, a.id
    `;
    // And a dimension value none of the indicator's published rows has.
    const [unused] = await draftSql<{ id: string }[]>`
      WITH dv AS (
        SELECT dv.id, dv.dimension_type_id FROM dimension_value dv
        WHERE NOT EXISTS (
          SELECT 1 FROM indicator_dimension_values idv
          WHERE idv.indicator_id = ${published.indicatorId} AND idv.dimension_value_id = dv.id
        )
        ORDER BY dv.id LIMIT 1
      ),
      o AS (
        INSERT INTO observation
          (indicator_id, area_id, from_date, to_date, value, upload_batch_id, dimension_key)
        SELECT ${published.indicatorId}, a.id, '2099-01-01', '2099-12-31', -1, ${batch?.id ?? ''},
               dv.id::text
        FROM (SELECT id FROM area ORDER BY id LIMIT 1) a, dv
        RETURNING id
      )
      INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id)
      SELECT o.id, dv.id, dv.dimension_type_id FROM o, dv
      RETURNING dimension_value_id AS id
    `;
    if (!unused) throw new Error('Every dimension value is in the published rows');

    await rebuildReadModels(draftSql);

    const leaked = await draftSql`
      SELECT 'latest_headline' AS model FROM latest_headline
        WHERE indicator_id = ${published.indicatorId} AND from_date = '2099-01-01'
      UNION ALL SELECT 'observation_range' FROM observation_range
        WHERE indicator_id = ${published.indicatorId} AND from_date = '2099-01-01'
      UNION ALL SELECT 'available_data' FROM available_data ad
        WHERE ad.indicator_id = ${published.indicatorId}
          AND NOT EXISTS (
            SELECT 1 FROM published.observation o JOIN area a ON a.id = o.area_id
            WHERE o.indicator_id = ad.indicator_id AND a.area_type_id = ad.area_type_id
          )
      UNION ALL SELECT 'indicator_dimension_values' FROM indicator_dimension_values
        WHERE indicator_id = ${published.indicatorId} AND dimension_value_id = ${unused.id}
    `;
    expect(leaked).toEqual([]);
  });
});
