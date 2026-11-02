import { FAKE_USER_IDS, TEAM_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createIndicatorDraft } from './indicator-draft-repository.ts';
import { ACTOR, AS_ACTOR, newDraft, repositoryTest } from './indicator-repository.testing.ts';
import { completeDraft } from './indicator-workflow.testing.ts';
import { assignReviewers, submitIndicator } from './indicator-workflow-repository.ts';
import { listReviewerOptions } from './reviewer-repository.ts';

const { indicatorVersionSubmission } = schema;

const AS_MANAGER = { userId: FAKE_USER_IDS.imrgManager, requestId: null };
const REVIEWER = FAKE_USER_IDS.imrgReviewer;
const PUBLISHING_REVIEWER = FAKE_USER_IDS.publisherAndReviewer;
const SECOND_REVIEWER = FAKE_USER_IDS.secondImrgReviewer;

/** A new indicator's draft, completed and submitted by the repository tests' actor. */
async function submitted(db: Database, name: string): Promise<string> {
  const draft = await newDraft(db, name);
  await submitIndicator(db, draft.indicatorId, await completeDraft(db, draft), AS_ACTOR);
  return draft.indicatorId;
}

async function countsOf(db: Database, indicatorId: string): Promise<Record<string, number>> {
  const options = await listReviewerOptions(db, indicatorId);
  return Object.fromEntries(
    options.map(({ id, assignedIndicatorCount }) => [id, assignedIndicatorCount]),
  );
}

describe('listReviewerOptions', () => {
  repositoryTest('lists everyone with the reviewer role by name', async ({ db }) => {
    const { indicatorId } = await newDraft(db, 'Reviewers listed');

    expect(await listReviewerOptions(db, indicatorId)).toEqual([
      { id: REVIEWER, name: 'Jamie Evans', assignedIndicatorCount: expect.any(Number) },
      {
        id: PUBLISHING_REVIEWER,
        name: 'Morgan Hughes',
        assignedIndicatorCount: expect.any(Number),
      },
      { id: SECOND_REVIEWER, name: 'Robin Shaw', assignedIndicatorCount: expect.any(Number) },
    ]);
  });

  repositoryTest("leaves out the indicator's creator", async ({ db }) => {
    const created = await createIndicatorDraft(
      db,
      { name: 'Created by a reviewer' },
      { userId: PUBLISHING_REVIEWER, requestId: null },
      TEAM_IDS.teamC,
    );
    if (!created.ok) throw new Error('expected a draft');

    expect((await listReviewerOptions(db, created.indicatorId)).map(({ id }) => id)).toEqual([
      REVIEWER,
      SECOND_REVIEWER,
    ]);
  });

  repositoryTest("leaves out whoever submitted the draft's latest submission", async ({ db }) => {
    const draft = await newDraft(db, 'Submitted by a reviewer');
    await submitIndicator(db, draft.indicatorId, await completeDraft(db, draft), {
      userId: PUBLISHING_REVIEWER,
      requestId: null,
    });

    expect((await listReviewerOptions(db, draft.indicatorId)).map(({ id }) => id)).toEqual([
      REVIEWER,
      SECOND_REVIEWER,
    ]);
  });

  repositoryTest("counts each reviewer's submissions in review", async ({ db }) => {
    const first = await submitted(db, 'First reviewed');
    const second = await submitted(db, 'Second reviewed');
    const before = await countsOf(db, first);

    await assignReviewers(
      db,
      first,
      { submissionNumber: 1, previousReviewerIds: [], reviewerIds: [REVIEWER] },
      AS_MANAGER,
    );
    await assignReviewers(
      db,
      second,
      {
        submissionNumber: 1,
        previousReviewerIds: [],
        reviewerIds: [REVIEWER, PUBLISHING_REVIEWER],
      },
      AS_MANAGER,
    );

    expect(await countsOf(db, first)).toEqual({
      [REVIEWER]: (before[REVIEWER] ?? 0) + 2,
      [PUBLISHING_REVIEWER]: (before[PUBLISHING_REVIEWER] ?? 0) + 1,
      [SECOND_REVIEWER]: before[SECOND_REVIEWER] ?? 0,
    });
  });

  repositoryTest('stops counting a submission once it leaves review', async ({ db }) => {
    const reviewed = await submitted(db, 'Review ended');
    await assignReviewers(
      db,
      reviewed,
      { submissionNumber: 1, previousReviewerIds: [], reviewerIds: [REVIEWER] },
      AS_MANAGER,
    );
    const during = await countsOf(db, reviewed);

    // No step ends a review yet, so the test ends it as a later step would.
    await db
      .update(indicatorVersionSubmission)
      .set({ status: 'withdrawn', endedBy: ACTOR, endedAt: sql`now()` })
      .where(eq(indicatorVersionSubmission.indicatorId, reviewed));

    expect((await countsOf(db, reviewed))[REVIEWER]).toBe((during[REVIEWER] ?? 0) - 1);
  });
});
