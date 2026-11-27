import { schema } from '@fphd/db';
import { apiLogin, createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { asOwnerGroup, migrateToLatest } from './migrations.ts';
import { createPreviewViews } from './preview-views.ts';
import { migrateBefore } from './testing.ts';

let testDb: TestDb;
let sql: postgres.Sql;
let fixture: { indicator_id: string; area_id: string; batch_id: string };

beforeAll(async () => {
  testDb = await createTestDb({ template: 'unmigrated' });
  sql = testDb.sql;
  await migrateBefore(sql, '0108_cumulative-quarter-series');
  await asOwnerGroup(sql, () => createPreviewViews(sql));
  await migrateToLatest(sql);

  const [created] = await sql<(typeof fixture)[]>`
    WITH i AS (
      INSERT INTO indicator (team_id) VALUES (${schema.IMPORTED_INDICATOR_TEAM_ID}) RETURNING id
    ), v AS (
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      SELECT id, 'Cumulative fixture', 'cumulative-fixture',
        ${schema.SYSTEM_USER_IDS.pholioMigration}, ${schema.SYSTEM_USER_IDS.pholioMigration}
      FROM i RETURNING id, indicator_id
    ), b AS (
      INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
      SELECT indicator_id, id, 'cumulative.csv', ${schema.SYSTEM_USER_IDS.pholioMigration}
      FROM v RETURNING id, indicator_id
    ), at AS (
      INSERT INTO area_type (name, hierarchy_type) VALUES ('Test', 'Administrative') RETURNING id
    ), a AS (
      INSERT INTO area (code, name, area_type_id) SELECT 'E92000001', 'England', id FROM at RETURNING id
    )
    SELECT b.indicator_id, b.id AS batch_id, a.id AS area_id FROM b CROSS JOIN a
  `;
  if (!created) throw new Error('Missing cumulative migration fixture');
  fixture = created;
});

afterAll(async () => {
  await testDb?.drop();
});

it('upgrades an existing database and preserves published and preview read access', async () => {
  for (const role of ['public_api', 'internal_api'] as const) {
    const client = testDb.connect({ login: apiLogin(role), max: 1 });
    await expect(client`SELECT period_type FROM published.observation LIMIT 0`).resolves.toEqual(
      [],
    );
    await expect(client`SELECT * FROM published.observation_dimension LIMIT 0`).resolves.toEqual(
      [],
    );
    await expect(client`SELECT * FROM published.observation_note LIMIT 0`).resolves.toEqual([]);
    await expect(client`SELECT * FROM published.observation_range LIMIT 0`).resolves.toEqual([]);
    if (role === 'internal_api') {
      await expect(client`SELECT period_type FROM preview.observation LIMIT 0`).resolves.toEqual(
        [],
      );
    }
  }
});

it.each(['ISO, MDY', 'German, DMY', 'SQL, DMY', 'Postgres, MDY'])(
  'accepts a cumulative baseline and rejects a mismatched baseline under DateStyle %s',
  async (dateStyle) => {
    const insert = (periodType: string) =>
      sql.begin(async (tx) => {
        await tx`SELECT set_config('DateStyle', ${dateStyle}, true)`;
        return tx`
          INSERT INTO observation (
            indicator_id, area_id, upload_batch_id, from_date, to_date, dimension_key, period_type
          ) VALUES (
            ${fixture.indicator_id}, ${fixture.area_id}, ${fixture.batch_id},
            '2022-04-01', '2023-03-31', ${dateStyle}, ${periodType}
          ) RETURNING period_type
        `;
      });
    await expect(insert('cumulative-quarter-2023-04-01')).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'observation_period_type_check',
    });
    await expect(insert('cumulative-quarter-2022-04-01')).resolves.toEqual([
      { period_type: 'cumulative-quarter-2022-04-01' },
    ]);
  },
);
