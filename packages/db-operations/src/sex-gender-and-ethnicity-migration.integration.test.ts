import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const { IMPORTED_INDICATOR_TEAM_ID, SYSTEM_USER_IDS } = schema;

const MIGRATION = '0076_ask-sex-gender-and-ethnicity';
const ACTOR = SYSTEM_USER_IDS.testSeed;

describe(`migration ${MIGRATION}`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    testDb = await createTestDb({ template: 'unmigrated' });
    sql = testDb.sql;
    await migrateBefore(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  /** A version of a new indicator, holding the sexes given. */
  function addVersion(shortId: number, status: 'draft' | 'published', sexes: string[] | null) {
    return sql`
      WITH created AS (
        INSERT INTO indicator (short_id, team_id)
        VALUES (${shortId}, ${IMPORTED_INDICATOR_TEAM_ID})
        RETURNING id
      )
      INSERT INTO indicator_version
        (indicator_id, status, published_at, name, slug, sexes, created_by, updated_by)
      SELECT created.id, ${status},
             ${status === 'published' ? '2026-02-01T00:00:00Z' : null},
             ${`Indicator ${shortId}`}, ${`indicator-${shortId}`},
             ${sexes}, ${ACTOR}, ${ACTOR}
      FROM created
    `;
  }

  it('sets a version holding sexes to have collected sex, and leaves the rest unanswered', async () => {
    await addVersion(1, 'draft', ['females', 'males']);
    await addVersion(2, 'published', ['persons']);
    await addVersion(3, 'draft', null);
    await addVersion(4, 'published', null);

    await migrateThrough(sql, MIGRATION);

    const rows = await sql`
      SELECT i.short_id AS "shortId", v.demographics, v.sexes, v.genders,
             v.ethnic_groups AS "ethnicGroups"
      FROM indicator_version v JOIN indicator i ON i.id = v.indicator_id
      ORDER BY i.short_id
    `;
    const noOthers = { genders: null, ethnicGroups: null };
    expect(rows).toEqual([
      { shortId: 1, demographics: ['sex'], sexes: ['females', 'males'], ...noOthers },
      { shortId: 2, demographics: ['sex'], sexes: ['persons'], ...noOthers },
      { shortId: 3, demographics: null, sexes: null, ...noOthers },
      { shortId: 4, demographics: null, sexes: null, ...noOthers },
    ]);
  });
});
