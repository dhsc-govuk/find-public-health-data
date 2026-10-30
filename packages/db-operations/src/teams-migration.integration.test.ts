import { TEAM_IDS, TEAMS } from '@fphd/auth';
import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateThrough } from './testing.ts';

const { IMPORTED_INDICATOR_TEAM_ID } = schema;

const MIGRATION = '0046_teams';

describe(`migration ${MIGRATION}`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    testDb = await createTestDb({ template: 'unmigrated' });
    sql = testDb.sql;
    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('inserts the teams @fphd/auth names, with their ids', async () => {
    const rows = await sql<{ id: string; name: string }[]>`SELECT id, name FROM team ORDER BY id`;
    const named = TEAMS.map(({ id, name }) => ({ id, name }));

    expect(rows).toEqual(named.toSorted((a, b) => a.id.localeCompare(b.id)));
  });

  it('inserts the team imported indicators join, which is Fingertips', async () => {
    const [row] = await sql<{ name: string }[]>`
      SELECT name FROM team WHERE id = ${IMPORTED_INDICATOR_TEAM_ID}
    `;

    expect(IMPORTED_INDICATOR_TEAM_ID).toBe(TEAM_IDS.fingertips);
    expect(row?.name).toBe('Fingertips');
  });
});
