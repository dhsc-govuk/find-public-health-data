import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const { IMPORTED_INDICATOR_TEAM_ID, SYSTEM_USER_IDS } = schema;

const MIGRATION = '0105_quality-caveats-and-interpretation';
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

  it('deletes the flags on the Data quality task and keeps the others', async () => {
    const [version] = await sql<{ id: string; indicatorId: string }[]>`
      WITH created AS (
        INSERT INTO indicator (short_id, team_id)
        VALUES (1, ${IMPORTED_INDICATOR_TEAM_ID})
        RETURNING id
      )
      INSERT INTO indicator_version
        (indicator_id, status, name, slug, created_by, updated_by)
      SELECT created.id, 'draft', 'Indicator 1', 'indicator-1', ${ACTOR}, ${ACTOR}
      FROM created
      RETURNING id, indicator_id AS "indicatorId"
    `;
    if (version === undefined) throw new Error('no version was added');
    const [submission] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version_submission
        (indicator_version_id, indicator_id, number, status, submitted_by, ended_by, ended_at)
      VALUES (${version.id}, ${version.indicatorId}, 1, 'changes_requested', ${ACTOR}, ${ACTOR},
              now())
      RETURNING id
    `;
    if (submission === undefined) throw new Error('no submission was added');
    await sql`
      INSERT INTO indicator_version_submission_reviewer (submission_id, reviewer_id, assigned_by)
      VALUES (${submission.id}, ${ACTOR}, ${ACTOR})
    `;
    const [response] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version_submission_response
        (submission_id, reviewer_id, kind, imrg_reviewed_on)
      VALUES (${submission.id}, ${ACTOR}, 'minor_revisions', '2026-11-02')
      RETURNING id
    `;
    if (response === undefined) throw new Error('no response was added');
    await sql`
      INSERT INTO indicator_version_submission_flag (response_id, task_key, notes)
      VALUES (${response.id}, 'data-quality', 'Say what the issues are.'),
             (${response.id}, 'other-notes-and-caveats', 'Explain the issues.')
    `;

    await migrateThrough(sql, MIGRATION);

    const flags = await sql`
      SELECT task_key AS "taskKey" FROM indicator_version_submission_flag ORDER BY task_key
    `;
    expect(flags).toEqual([{ taskKey: 'other-notes-and-caveats' }]);
    await expect(
      sql`
        INSERT INTO indicator_version_submission_flag (response_id, task_key, notes)
        VALUES (${response.id}, 'data-quality', 'Say what the issues are.')
      `,
    ).rejects.toMatchObject({
      constraint_name: 'indicator_version_submission_flag_task_key_check',
    });
  });
});
