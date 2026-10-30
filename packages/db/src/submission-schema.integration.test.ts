import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SYSTEM_USER_IDS } from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

const ACTOR = SYSTEM_USER_IDS.testSeed;
const NOBODY = '01a13c69-0000-7000-8000-000000000000';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

let testDb: TestDb;
let sql: postgres.Sql;

beforeAll(async () => {
  testDb = await createTestDb();
  sql = testDb.sql;
});

afterAll(async () => {
  await testDb.drop();
});

interface Draft {
  indicatorId: string;
  versionId: string;
}

async function newDraft(): Promise<Draft> {
  const [row] = await sql<Draft[]>`
    WITH i AS (INSERT INTO indicator DEFAULT VALUES RETURNING id)
    INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
    SELECT i.id, 'Submission schema test', 'submission-schema-' || i.id, ${ACTOR}, ${ACTOR} FROM i
    RETURNING indicator_id AS "indicatorId", id AS "versionId"
  `;
  if (!row) throw new Error('inserted no draft');
  return row;
}

type SubmissionValues = {
  number?: number;
  status?: string;
  endedBy?: string | null;
  endedAt?: Date | null;
};

function insertSubmission(
  { indicatorId, versionId }: Draft,
  { number = 1, status = 'submitted', endedBy = null, endedAt = null }: SubmissionValues = {},
) {
  return sql`
    INSERT INTO indicator_version_submission
      (indicator_version_id, indicator_id, number, status, submitted_by, ended_by, ended_at)
    VALUES (${versionId}, ${indicatorId}, ${number}, ${status}, ${ACTOR}, ${endedBy}, ${endedAt})
  `;
}

describe('indicator_version_submission', () => {
  it('starts every version unlocked', async () => {
    const draft = await newDraft();
    const [row] = await sql`SELECT is_locked FROM indicator_version WHERE id = ${draft.versionId}`;

    expect(row).toEqual({ is_locked: false });
  });

  it('records when a submission was made', async () => {
    const draft = await newDraft();
    await insertSubmission(draft);
    const [row] = await sql`
      SELECT submitted_at IS NOT NULL AS dated FROM indicator_version_submission
      WHERE indicator_version_id = ${draft.versionId}
    `;

    expect(row).toEqual({ dated: true });
  });

  it.each([
    ['who ended it', { endedBy: ACTOR }],
    ['when it ended', { endedAt: new Date() }],
    ['both', { endedBy: ACTOR, endedAt: new Date() }],
  ])('refuses %s on a submission still submitted', async (_, ended) => {
    await expect(insertSubmission(await newDraft(), ended)).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it.each([
    ['nobody', {}],
    ['who ended it alone', { endedBy: ACTOR }],
    ['when it ended alone', { endedAt: new Date() }],
  ])('refuses a withdrawn submission naming %s', async (_, ended) => {
    await expect(
      insertSubmission(await newDraft(), { status: 'withdrawn', ...ended }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('accepts a withdrawn submission saying who ended it and when', async () => {
    await expect(
      insertSubmission(await newDraft(), {
        status: 'withdrawn',
        endedBy: ACTOR,
        endedAt: new Date(),
      }),
    ).resolves.toBeDefined();
  });

  it('refuses a status the workflow does not know', async () => {
    await expect(insertSubmission(await newDraft(), { status: 'approved' })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('numbers submissions from 1', async () => {
    await expect(insertSubmission(await newDraft(), { number: 0 })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('refuses two submissions of one version with the same number', async () => {
    const draft = await newDraft();
    await insertSubmission(draft, { status: 'withdrawn', endedBy: ACTOR, endedAt: new Date() });

    await expect(insertSubmission(draft)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("refuses a submission naming another indicator's version", async () => {
    const draft = await newDraft();
    const other = await newDraft();

    await expect(
      insertSubmission({ indicatorId: other.indicatorId, versionId: draft.versionId }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('is deleted with its version', async () => {
    const draft = await newDraft();
    await insertSubmission(draft);
    await sql`DELETE FROM indicator_version WHERE id = ${draft.versionId}`;
    const rows = await sql`
      SELECT id FROM indicator_version_submission WHERE indicator_version_id = ${draft.versionId}
    `;

    expect(rows).toEqual([]);
  });
});

describe('indicator_version_submission_reviewer', () => {
  async function newSubmission(): Promise<{ draft: Draft; submissionId: string }> {
    const draft = await newDraft();
    await insertSubmission(draft, { status: 'in_review' });
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM indicator_version_submission WHERE indicator_version_id = ${draft.versionId}
    `;
    if (!row) throw new Error('inserted no submission');
    return { draft, submissionId: row.id };
  }

  function assign(submissionId: string, reviewerId: string = ACTOR) {
    return sql`
      INSERT INTO indicator_version_submission_reviewer
        (submission_id, reviewer_id, assigned_by)
      VALUES (${submissionId}, ${reviewerId}, ${ACTOR})
    `;
  }

  it('records when a reviewer was assigned', async () => {
    const { submissionId } = await newSubmission();
    await assign(submissionId);
    const [row] = await sql`
      SELECT assigned_at IS NOT NULL AS dated FROM indicator_version_submission_reviewer
      WHERE submission_id = ${submissionId}
    `;

    expect(row).toEqual({ dated: true });
  });

  it('refuses assigning one reviewer twice to a submission', async () => {
    const { submissionId } = await newSubmission();
    await assign(submissionId);

    await expect(assign(submissionId)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('refuses a reviewer who is not a user', async () => {
    const { submissionId } = await newSubmission();

    await expect(assign(submissionId, NOBODY)).rejects.toMatchObject({
      code: FOREIGN_KEY_VIOLATION,
    });
  });

  it('is deleted with its version', async () => {
    const { draft, submissionId } = await newSubmission();
    await assign(submissionId);
    await sql`DELETE FROM indicator_version WHERE id = ${draft.versionId}`;
    const rows = await sql`
      SELECT reviewer_id FROM indicator_version_submission_reviewer
      WHERE submission_id = ${submissionId}
    `;

    expect(rows).toEqual([]);
  });
});
