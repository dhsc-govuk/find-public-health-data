import { FLAGGABLE_TASK_KEYS } from '@fphd/utils/indicator-task-key';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { IMPORTED_INDICATOR_TEAM_ID, SYSTEM_USER_IDS } from './schema/index.ts';
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
    WITH i AS (INSERT INTO indicator (team_id) VALUES (${IMPORTED_INDICATOR_TEAM_ID}) RETURNING id)
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

  it.each(['changes_requested', 'approved'])(
    'refuses a submission %s without saying who ended it and when',
    async (status) => {
      await expect(insertSubmission(await newDraft(), { status })).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    },
  );

  it.each(['changes_requested', 'approved'])(
    'accepts a submission %s saying who ended it and when',
    async (status) => {
      await expect(
        insertSubmission(await newDraft(), { status, endedBy: ACTOR, endedAt: new Date() }),
      ).resolves.toBeDefined();
    },
  );

  it('refuses a status the workflow does not know', async () => {
    await expect(insertSubmission(await newDraft(), { status: 'rejected' })).rejects.toMatchObject({
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

describe('the review responses, flags and reviewer notes', () => {
  /** A submission in review with `ACTOR` assigned to review it. */
  async function reviewedSubmission(): Promise<{ draft: Draft; submissionId: string }> {
    const draft = await newDraft();
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version_submission
        (indicator_version_id, indicator_id, number, status, submitted_by)
      VALUES (${draft.versionId}, ${draft.indicatorId}, 1, 'in_review', ${ACTOR})
      RETURNING id
    `;
    if (!row) throw new Error('inserted no submission');
    await sql`
      INSERT INTO indicator_version_submission_reviewer (submission_id, reviewer_id, assigned_by)
      VALUES (${row.id}, ${ACTOR}, ${ACTOR})
    `;
    return { draft, submissionId: row.id };
  }

  type ResponseValues = {
    reviewerId?: string;
    kind?: string;
    imrgReviewedOn?: string | null;
    clarificationRequest?: string | null;
  };

  async function respond(
    submissionId: string,
    {
      reviewerId = ACTOR,
      kind = 'minor_revisions',
      imrgReviewedOn = '2026-10-01',
      clarificationRequest = null,
    }: ResponseValues = {},
  ): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version_submission_response
        (submission_id, reviewer_id, kind, imrg_reviewed_on, clarification_request)
      VALUES (${submissionId}, ${reviewerId}, ${kind}, ${imrgReviewedOn}, ${clarificationRequest})
      RETURNING id
    `;
    if (!row) throw new Error('inserted no response');
    return row.id;
  }

  function flag(
    responseId: string,
    { taskKey = 'polarity', notes = 'Check it', clearedBy = null as string | null } = {},
  ) {
    return sql`
      INSERT INTO indicator_version_submission_flag (response_id, task_key, notes, cleared_by, cleared_at)
      VALUES (${responseId}, ${taskKey}, ${notes}, ${clearedBy}, ${clearedBy === null ? null : new Date()})
    `;
  }

  function note(submissionId: string, text = 'A thought') {
    return sql`
      INSERT INTO indicator_version_review_note (submission_id, author_id, text)
      VALUES (${submissionId}, ${ACTOR}, ${text})
    `;
  }

  it('records a response by a reviewer of the submission, and when', async () => {
    const { submissionId } = await reviewedSubmission();
    const id = await respond(submissionId);
    const [row] = await sql`
      SELECT responded_at IS NOT NULL AS dated FROM indicator_version_submission_response
      WHERE id = ${id}
    `;

    expect(row).toEqual({ dated: true });
  });

  it('refuses a response by someone not assigned to the submission', async () => {
    const { submissionId } = await reviewedSubmission();

    await expect(
      respond(submissionId, { reviewerId: SYSTEM_USER_IDS.pholioMigration }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('refuses a kind the workflow does not know', async () => {
    const { submissionId } = await reviewedSubmission();

    await expect(respond(submissionId, { kind: 'rejected' })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it.each([
    ['minor revisions without their date', { kind: 'minor_revisions', imrgReviewedOn: null }],
    ['major revisions without their date', { kind: 'major_revisions', imrgReviewedOn: null }],
    ['pre-IMRG feedback with a date', { kind: 'pre_imrg_feedback', imrgReviewedOn: '2026-10-01' }],
    [
      'an approval with a clarification request',
      { kind: 'approved', clarificationRequest: 'Why?' },
    ],
    ['an empty clarification request', { clarificationRequest: '' }],
  ])('refuses %s', async (_, values) => {
    const { submissionId } = await reviewedSubmission();

    await expect(respond(submissionId, values)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it.each([
    ['with its IMRG date', '2026-10-01'],
    ['without a date, as an update is approved', null],
  ])('accepts an approval %s', async (_, imrgReviewedOn) => {
    const { submissionId } = await reviewedSubmission();

    await expect(
      respond(submissionId, { kind: 'approved', imrgReviewedOn }),
    ).resolves.toBeDefined();
  });

  it('accepts pre-IMRG feedback with a clarification request and no date', async () => {
    const { submissionId } = await reviewedSubmission();

    await expect(
      respond(submissionId, {
        kind: 'pre_imrg_feedback',
        imrgReviewedOn: null,
        clarificationRequest: 'What is counted?',
      }),
    ).resolves.toBeDefined();
  });

  it('refuses a second response to a submission', async () => {
    const { submissionId } = await reviewedSubmission();
    await respond(submissionId);

    await expect(respond(submissionId)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('keeps a reviewer who has responded on the submission', async () => {
    const { submissionId } = await reviewedSubmission();
    await respond(submissionId);

    await expect(
      sql`DELETE FROM indicator_version_submission_reviewer WHERE submission_id = ${submissionId}`,
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('accepts a flag on every task a reviewer may flag', async () => {
    const { submissionId } = await reviewedSubmission();
    const responseId = await respond(submissionId);

    for (const taskKey of FLAGGABLE_TASK_KEYS) {
      await expect(flag(responseId, { taskKey })).resolves.toBeDefined();
    }
  });

  it.each([
    ['a task that cannot be flagged', { taskKey: 'justifications' }],
    ['a task that does not exist', { taskKey: 'summary' }],
    ['empty notes', { notes: '' }],
  ])('refuses a flag on %s', async (_, values) => {
    const { submissionId } = await reviewedSubmission();
    const responseId = await respond(submissionId);

    await expect(flag(responseId, values)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses flagging one task twice in a response', async () => {
    const { submissionId } = await reviewedSubmission();
    const responseId = await respond(submissionId);
    await flag(responseId);

    await expect(flag(responseId)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('records who cleared a flag only with when', async () => {
    const { submissionId } = await reviewedSubmission();
    const responseId = await respond(submissionId);

    await expect(flag(responseId, { clearedBy: ACTOR })).resolves.toBeDefined();
    await expect(
      sql`
        INSERT INTO indicator_version_submission_flag (response_id, task_key, notes, cleared_by)
        VALUES (${responseId}, 'name', 'Rename it', ${ACTOR})
      `,
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses an empty reviewer note', async () => {
    const { submissionId } = await reviewedSubmission();

    await expect(note(submissionId, '')).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('deletes a version with its responses, flags and reviewer notes', async () => {
    const { draft, submissionId } = await reviewedSubmission();
    await flag(await respond(submissionId));
    await note(submissionId);

    await sql`DELETE FROM indicator_version WHERE id = ${draft.versionId}`;

    const [counts] = await sql`
      SELECT
        (SELECT count(*)::int FROM indicator_version_submission_response
         WHERE submission_id = ${submissionId}) AS responses,
        (SELECT count(*)::int FROM indicator_version_submission_flag f
         LEFT JOIN indicator_version_submission_response r ON r.id = f.response_id
         WHERE r.id IS NULL) AS orphan_flags,
        (SELECT count(*)::int FROM indicator_version_review_note
         WHERE submission_id = ${submissionId}) AS notes
    `;
    expect(counts).toEqual({ responses: 0, orphan_flags: 0, notes: 0 });
  });
});

describe("the core team's decision on an update", () => {
  /** A submitted submission with no reviewer assigned, as an update waiting for a decision is. */
  async function submissionId(): Promise<string> {
    const draft = await newDraft();
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version_submission
        (indicator_version_id, indicator_id, number, status, submitted_by)
      VALUES (${draft.versionId}, ${draft.indicatorId}, 1, 'submitted', ${ACTOR})
      RETURNING id
    `;
    if (!row) throw new Error('inserted no submission');
    return row.id;
  }

  type Responder = { reviewerId?: string | null; coreTeamMemberId?: string | null };

  function respond(
    id: string,
    { reviewerId = null, coreTeamMemberId = null }: Responder,
    kind = 'pre_imrg_feedback',
  ) {
    const imrgReviewedOn = kind === 'pre_imrg_feedback' ? null : '2026-10-01';
    return sql`
      INSERT INTO indicator_version_submission_response
        (submission_id, reviewer_id, core_team_member_id, kind, imrg_reviewed_on)
      VALUES (${id}, ${reviewerId}, ${coreTeamMemberId}, ${kind}, ${imrgReviewedOn})
    `;
  }

  it('accepts pre-IMRG feedback from a core team member, who is not an assigned reviewer', async () => {
    await expect(respond(await submissionId(), { coreTeamMemberId: ACTOR })).resolves.toBeDefined();
  });

  it.each([
    ['neither a reviewer nor a core team member', {}],
    ['both a reviewer and a core team member', { reviewerId: ACTOR, coreTeamMemberId: ACTOR }],
  ])('refuses a response from %s', async (_, responder) => {
    const id = await submissionId();
    // The reviewer named must be assigned, so only the responder check can refuse the row.
    await sql`
      INSERT INTO indicator_version_submission_reviewer (submission_id, reviewer_id, assigned_by)
      VALUES (${id}, ${ACTOR}, ${ACTOR})
    `;

    await expect(respond(id, responder)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it.each(['minor_revisions', 'approved'])(
    'refuses a core team response of %s, which only IMRG decides',
    async (kind) => {
      await expect(
        respond(await submissionId(), { coreTeamMemberId: ACTOR }, kind),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    },
  );

  type Decision = { decision?: string | null; decidedBy?: string | null; decidedAt?: Date | null };

  async function decide(
    id: string,
    { decision = null, decidedBy = null, decidedAt = null }: Decision,
  ) {
    return sql`
      UPDATE indicator_version_submission
      SET update_decision = ${decision}, update_decided_by = ${decidedBy},
        update_decided_at = ${decidedAt}
      WHERE id = ${id}
    `;
  }

  it('accepts a decision with who made it and when', async () => {
    await expect(
      decide(await submissionId(), {
        decision: 'imrg_review',
        decidedBy: ACTOR,
        decidedAt: new Date(),
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['a decision without who made it or when', { decision: 'imrg_review' }],
    ['a decision without when', { decision: 'imrg_review', decidedBy: ACTOR }],
    ['who decided without a decision', { decidedBy: ACTOR, decidedAt: new Date() }],
  ])('refuses %s', async (_, decision) => {
    await expect(decide(await submissionId(), decision)).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });
});
