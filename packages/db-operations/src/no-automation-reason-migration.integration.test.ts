import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const { IMPORTED_INDICATOR_TEAM_ID, SYSTEM_USER_IDS } = schema;

const MIGRATION = '0073_ask-why-no-automation-tools';
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

  /** A version of a new indicator, answering the automation tools question as given. */
  function addVersion(
    shortId: number,
    status: 'draft' | 'published',
    hasAutomation: boolean | null,
    automationDetail: string | null = null,
  ) {
    return sql`
      WITH created AS (
        INSERT INTO indicator (short_id, team_id)
        VALUES (${shortId}, ${IMPORTED_INDICATOR_TEAM_ID})
        RETURNING id
      )
      INSERT INTO indicator_version
        (indicator_id, status, published_at, name, slug, has_automation, automation_detail,
         created_by, updated_by)
      SELECT created.id, ${status},
             ${status === 'published' ? '2026-02-01T00:00:00Z' : null},
             ${`Indicator ${shortId}`}, ${`indicator-${shortId}`},
             ${hasAutomation}, ${automationDetail}, ${ACTOR}, ${ACTOR}
      FROM created
    `;
  }

  it('leaves a no to automation tools unanswered, and keeps every other answer', async () => {
    await addVersion(1, 'draft', false);
    await addVersion(2, 'published', false);
    await addVersion(3, 'draft', true, 'The shared pipeline.');
    await addVersion(4, 'draft', null);

    await migrateThrough(sql, MIGRATION);

    const rows = await sql`
      SELECT i.short_id AS "shortId", v.has_automation AS "hasAutomation",
             v.automation_detail AS "automationDetail",
             v.no_automation_reason AS "noAutomationReason"
      FROM indicator_version v JOIN indicator i ON i.id = v.indicator_id
      ORDER BY i.short_id
    `;
    const unanswered = { hasAutomation: null, automationDetail: null, noAutomationReason: null };
    expect(rows).toEqual([
      { shortId: 1, ...unanswered },
      { shortId: 2, ...unanswered },
      {
        shortId: 3,
        hasAutomation: true,
        automationDetail: 'The shared pipeline.',
        noAutomationReason: null,
      },
      { shortId: 4, ...unanswered },
    ]);
  });
});
