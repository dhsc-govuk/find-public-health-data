import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listAreasByType } from './area-repository.ts';
import { createRepositories } from './repositories.ts';
import { publishedViews } from './schema/published.ts';
import { createTestDb, type TestDb } from './testing.ts';

let testDb: TestDb;
let sql: postgres.Sql;

beforeAll(async () => {
  testDb = await createTestDb();
  sql = testDb.sql;
});

afterAll(async () => {
  await testDb?.drop();
});

describe('areas', () => {
  beforeAll(async () => {
    const [type] = await sql<{ id: string }[]>`
      INSERT INTO area_type (name, hierarchy_type) VALUES ('Status test', 'Administrative')
      RETURNING id
    `;
    if (!type) throw new Error('Missing area type');
    await sql`
      INSERT INTO area (code, name, area_type_id, valid_from, valid_to, is_current) VALUES
        ('current', 'Current', ${type.id}, '2010-01-01', NULL, true),
        ('retired', 'Retired', ${type.id}, '2010-01-01', '2020-01-01', false),
        ('nSTP_1', 'Retired without dates', ${type.id}, NULL, NULL, false)
    `;
  });

  it('stores an unknown validity range without treating a retired area as current', async () => {
    expect(
      await sql`SELECT valid_from, valid_to, is_current FROM area WHERE code = 'nSTP_1'`,
    ).toEqual([{ valid_from: null, valid_to: null, is_current: false }]);
    expect(await listAreasByType(testDb.db, publishedViews, 'Status test')).toEqual([
      { code: 'current', name: 'Current' },
    ]);
  });

  it('stores unknown relationship dates', async () => {
    await sql`
      INSERT INTO area_relationship (parent_area_id, child_area_id, valid_from, valid_to)
      SELECT p.id, c.id, NULL, NULL FROM area p, area c
      WHERE p.code = 'current' AND c.code = 'retired'
    `;
    expect(await sql`SELECT valid_from, valid_to FROM area_relationship`).toEqual([
      { valid_from: null, valid_to: null },
    ]);
    const { areas } = createRepositories(testDb.db);
    expect(await areas.listParents(['retired'], 'Status test')).toEqual([]);
  });

  it('does not infer a current parent from an unknown retirement date', async () => {
    await sql`
      INSERT INTO area_relationship (parent_area_id, child_area_id, valid_from, valid_to)
      SELECT p.id, c.id, NULL, NULL FROM area p, area c
      WHERE p.code = 'nSTP_1' AND c.code = 'current'
    `;
    const { areas } = createRepositories(testDb.db);
    expect(await areas.listParents(['current'], 'Status test')).toEqual([]);
  });
});

describe('note types', () => {
  it('refuses a second note type with the same text', async () => {
    const note = `INSERT INTO note_type (text, category) VALUES ('Value for Dorset and Poole combined', 'contextual')`;
    await sql.unsafe(note);

    await expect(sql.unsafe(note)).rejects.toMatchObject({ code: '23505' });
  });
});
