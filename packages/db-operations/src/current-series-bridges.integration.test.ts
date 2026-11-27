import { apiLogin, createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';

let database: TestDb;
let publicApi: postgres.Sql;
let currentId: string;
let retainedId: string;

beforeAll(async () => {
  database = await createTestDb({ template: 'seeded' });
  publicApi = database.connect({ login: apiLogin('public_api'), max: 1 });
  const sql = database.sql;
  const [indicator] = await sql<{ id: string; batch: string }[]>`
    SELECT i.id, v.upload_batch_id AS batch FROM indicator i
    JOIN current_published_version c ON c.indicator_id = i.id
    JOIN indicator_version v ON v.id = c.id WHERE i.short_id = 108
  `;
  if (!indicator) throw new Error('Expected indicator 108');
  const insert = (periodType: string | null, isCurrentSeries: boolean) => sql<{ id: string }[]>`
    INSERT INTO observation
      (indicator_id, upload_batch_id, area_id, from_date, to_date, value, dimension_key,
       period_type, is_current_series)
    SELECT ${indicator.id}, ${indicator.batch}, a.id, '2090-04-01', '2091-03-31', 1, dv.id::text,
      ${periodType}, ${isCurrentSeries}
    FROM area a
    CROSS JOIN dimension_value dv JOIN dimension_type dt ON dt.id = dv.dimension_type_id
    WHERE a.code = 'E92000001' AND dt.name = 'Sex' AND dv.name = 'Male'
    RETURNING id
  `;
  const [current] = await insert(null, true);
  const [retained] = await insert('cumulative-quarter-2090-04-01', false);
  if (!current || !retained) throw new Error('Expected both observations');
  currentId = current.id;
  retainedId = retained.id;
  for (const id of [currentId, retainedId]) {
    await sql`
      INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id)
      SELECT ${id}, dv.id, dv.dimension_type_id FROM dimension_value dv
      WHERE dv.id = (SELECT dimension_key::uuid FROM observation WHERE id = ${id})
    `;
    await sql`
      INSERT INTO observation_note (observation_id, note_type_id)
      SELECT ${id}, id FROM note_type LIMIT 1
    `;
  }
});

afterAll(async () => {
  await database?.drop();
});

it('leaves the dimension and note rows of an observation outside the current series out of the published views', async () => {
  const ids = [currentId, retainedId];
  expect(
    await publicApi`SELECT id FROM published.observation WHERE id IN ${publicApi(ids)}`,
  ).toEqual([{ id: currentId }]);
  expect(
    await publicApi`
      SELECT observation_id FROM published.observation_dimension
      WHERE observation_id IN ${publicApi(ids)}
    `,
  ).toEqual([{ observation_id: currentId }]);
  expect(
    await publicApi`
      SELECT observation_id FROM published.observation_note
      WHERE observation_id IN ${publicApi(ids)}
    `,
  ).toEqual([{ observation_id: currentId }]);
});
