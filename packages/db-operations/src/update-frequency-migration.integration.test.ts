import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateBefore, migrateThrough } from './testing.ts';

const { IMPORTED_INDICATOR_TEAM_ID, SYSTEM_USER_IDS } = schema;

const MIGRATION = '0098_update-frequency-years-and-other';
const DESCRIPTION = 'Academic year, published in winter.';
const REASON = 'The survey has ended.';

// Versions with and without the description or reason the old form took beside an answer.
const VERSIONS = [
  { shortId: 1, frequency: 'annually', text: null, reason: null },
  { shortId: 2, frequency: 'annually', text: DESCRIPTION, reason: null },
  { shortId: 3, frequency: null, text: DESCRIPTION, reason: null },
  { shortId: 4, frequency: 'every-2-years', text: null, reason: null },
  { shortId: 5, frequency: 'every-2-years', text: DESCRIPTION, reason: null },
  { shortId: 6, frequency: 'no-longer-updated', text: DESCRIPTION, reason: REASON },
  { shortId: 7, frequency: 'no-fixed-frequency', text: DESCRIPTION, reason: null },
  { shortId: 8, frequency: null, text: null, reason: null },
];

describe(`migration ${MIGRATION}`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    testDb = await createTestDb({ template: 'unmigrated' });
    sql = testDb.sql;
    await migrateBefore(sql, MIGRATION);

    for (const { shortId, frequency, text, reason } of VERSIONS) {
      await sql`
        WITH created AS (
          INSERT INTO indicator (short_id, team_id)
          VALUES (${shortId}, ${IMPORTED_INDICATOR_TEAM_ID})
          RETURNING id
        )
        INSERT INTO indicator_version (
          indicator_id, name, slug, update_frequency, update_frequency_text,
          update_frequency_reason, created_by, updated_by
        )
        SELECT created.id, ${`Indicator ${shortId}`}, ${`indicator-${shortId}`}, ${frequency},
               ${text}, ${reason}, ${SYSTEM_USER_IDS.pholioMigration},
               ${SYSTEM_USER_IDS.pholioMigration}
        FROM created
      `;
    }

    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('keeps each description as an other frequency, unless the version gave a reason', async () => {
    const rows = await sql`
      SELECT i.short_id, v.update_frequency, v.update_frequency_years, v.update_frequency_text,
             v.update_frequency_reason
      FROM indicator_version v JOIN indicator i ON i.id = v.indicator_id
      ORDER BY i.short_id
    `;

    expect(rows).toEqual([
      row(1, 'annually'),
      row(2, 'other', { text: DESCRIPTION }),
      row(3, 'other', { text: DESCRIPTION }),
      row(4, 'every-n-years', { years: 2 }),
      row(5, 'other', { text: DESCRIPTION }),
      row(6, 'no-longer-updated', { reason: REASON }),
      row(7, 'other', { text: DESCRIPTION }),
      row(8, null),
    ]);
  });
});

function row(
  shortId: number,
  frequency: string | null,
  { years = null, text = null, reason = null }: Record<string, unknown> = {},
) {
  return {
    short_id: shortId,
    update_frequency: frequency,
    update_frequency_years: years,
    update_frequency_text: text,
    update_frequency_reason: reason,
  };
}
