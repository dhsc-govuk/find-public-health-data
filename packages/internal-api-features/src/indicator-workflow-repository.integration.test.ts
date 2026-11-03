import { FAKE_USER_IDS, TEAM_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import { auditEntriesFor } from '@fphd/db/testing';
import { asc, eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import {
  createIndicatorDraft,
  getIndicatorDraftState,
  updateIndicatorDraft,
} from './indicator-draft-repository.ts';
import { createDraftFromPublished } from './indicator-publish-repository.ts';
import {
  ACTOR,
  AS_ACTOR,
  AS_OTHER_ACTOR,
  indicatorWithTwoPublications,
  newDraft,
  OTHER_ACTOR,
  repositoryTest,
} from './indicator-repository.testing.ts';
import { indicatorTaskList } from './indicator-task-list.ts';
import { completeDraft, draftUpdatedAt, ukToday } from './indicator-workflow.testing.ts';
import {
  assignReviewers,
  submitIndicator,
  withdrawSubmission,
} from './indicator-workflow-repository.ts';
import { type ReviewResponse, respondToReview } from './review-response-repository.ts';

const { indicatorVersion, indicatorVersionSubmission, indicatorVersionSubmissionReviewer } = schema;

const STEP_ACTIONS = [
  'indicator.submitted',
  'indicator.submission_withdrawn',
  'indicator.reviewers_assigned',
  'indicator.review_feedback_given',
  'indicator.changes_requested',
  'indicator.approved',
  'indicator.resubmitted',
];

const MANAGER = FAKE_USER_IDS.imrgManager;
const AS_MANAGER: Actor = { userId: MANAGER, requestId: null };
// The two reviewers; the first also publishes for team C.
const REVIEWER = FAKE_USER_IDS.imrgReviewer;
const PUBLISHING_REVIEWER = FAKE_USER_IDS.publisherAndReviewer;

async function versionOf(db: Database, versionId: string) {
  const [row] = await db
    .select({
      status: indicatorVersion.status,
      isLocked: indicatorVersion.isLocked,
      updatedAt: indicatorVersion.updatedAt,
      updatedBy: indicatorVersion.updatedBy,
    })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  if (row === undefined) throw new Error(`no version ${versionId}`);
  return row;
}

function submissionsOf(db: Database, versionId: string) {
  return db
    .select()
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId))
    .orderBy(asc(indicatorVersionSubmission.number));
}

function reviewersOf(db: Database, submissionId: string) {
  return db
    .select()
    .from(indicatorVersionSubmissionReviewer)
    .where(eq(indicatorVersionSubmissionReviewer.submissionId, submissionId))
    .orderBy(asc(indicatorVersionSubmissionReviewer.reviewerId));
}

async function stepEntriesFor(db: Database, indicatorId: string) {
  const entries = await auditEntriesFor(db, indicatorId);
  return entries.filter(({ action }) => STEP_ACTIONS.includes(action));
}

/**
 * Versions whose lock disagrees with their latest submission: a version is locked exactly when
 * it is unpublished and its latest submission is one under review or approved.
 */
async function lockMismatches(db: Database): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT v.id FROM indicator_version v
    LEFT JOIN LATERAL (
      SELECT status FROM indicator_version_submission s
      WHERE s.indicator_version_id = v.id ORDER BY s.number DESC LIMIT 1
    ) latest ON true
    WHERE v.is_locked IS DISTINCT FROM
      (v.status <> 'published' AND coalesce(latest.status IN ('submitted', 'in_review', 'approved'), false))
  `)) as unknown as { id: string }[];
  return rows.map(({ id }) => id);
}

/** A row as the audit log holds it, its dates as text. */
function asJson(row: unknown): unknown {
  return JSON.parse(JSON.stringify(row));
}

/** A new indicator's complete draft and the `updatedAt` its task list would show. */
async function completeNewDraft(db: Database, name: string) {
  const created = await newDraft(db, name);
  const shown = await completeDraft(db, created);
  return { ...created, shown };
}

describe('completeDraft', () => {
  repositoryTest('leaves a draft the task list lets the publisher submit', async ({ db }) => {
    const { indicatorId } = await completeNewDraft(db, 'Completed for submission');
    const state = await getIndicatorDraftState(db, indicatorId);
    if (!state?.draft) throw new Error('expected a draft');

    const { draft, draftCiMethodKind, ...indicator } = state;
    expect(
      indicatorTaskList({ indicator, draft: { ...draft, ciMethodKind: draftCiMethodKind } })
        .canSubmit,
    ).toBe(true);
  });
});

describe('submitIndicator', () => {
  repositoryTest('locks a complete draft under its first submission', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Submitted once');

    await expect(submitIndicator(db, indicatorId, shown, AS_ACTOR)).resolves.toEqual({ ok: true });

    expect((await versionOf(db, versionId)).isLocked).toBe(true);
    expect(await submissionsOf(db, versionId)).toEqual([
      expect.objectContaining({
        indicatorId,
        number: 1,
        status: 'submitted',
        submittedBy: ACTOR,
        submittedAt: expect.any(Date),
        endedBy: null,
        endedAt: null,
      }),
    ]);
  });

  repositoryTest('records the lock and the new submission in one audit entry', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Submission audited');

    await submitIndicator(db, indicatorId, shown, AS_OTHER_ACTOR);

    const [submission] = await submissionsOf(db, versionId);
    expect(await stepEntriesFor(db, indicatorId)).toEqual([
      {
        actorId: OTHER_ACTOR,
        action: 'indicator.submitted',
        entityType: 'indicator',
        requestId: null,
        changes: {
          isLocked: { before: false, after: true },
          submission: {
            before: null,
            after: asJson(submission),
          },
        },
      },
    ]);
  });

  repositoryTest('leaves the status and the last edit as they were', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Submitted unedited');
    const before = await versionOf(db, versionId);

    await submitIndicator(db, indicatorId, shown, AS_OTHER_ACTOR);

    expect(await versionOf(db, versionId)).toEqual({ ...before, isLocked: true });
  });

  repositoryTest('refuses an incomplete draft and writes nothing', async ({ db }) => {
    const { indicatorId, versionId } = await newDraft(db, 'Submitted incomplete');

    await expect(
      submitIndicator(db, indicatorId, await draftUpdatedAt(db, versionId), AS_ACTOR),
    ).resolves.toEqual({ ok: false, reason: 'incomplete' });

    expect((await versionOf(db, versionId)).isLocked).toBe(false);
    expect(await submissionsOf(db, versionId)).toEqual([]);
    expect(await stepEntriesFor(db, indicatorId)).toEqual([]);
  });

  repositoryTest('refuses a draft edited since the publisher was shown it', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Edited before submit');
    await updateIndicatorDraft(
      db,
      indicatorId,
      'definition-and-rationale',
      { definition: 'Edited since' },
      {},
      AS_ACTOR,
    );

    await expect(submitIndicator(db, indicatorId, shown, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'changed',
    });

    expect((await versionOf(db, versionId)).isLocked).toBe(false);
    expect(await submissionsOf(db, versionId)).toEqual([]);
  });

  repositoryTest(
    'numbers a resubmission after a withdrawal, which leaves the draft as shown',
    async ({ db }) => {
      const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Submitted twice');
      await submitIndicator(db, indicatorId, shown, AS_ACTOR);
      await withdrawSubmission(db, indicatorId, 1, AS_ACTOR);

      await expect(submitIndicator(db, indicatorId, shown, AS_ACTOR)).resolves.toEqual({
        ok: true,
      });

      expect(
        (await submissionsOf(db, versionId)).map(({ number, status }) => [number, status]),
      ).toEqual([
        [1, 'withdrawn'],
        [2, 'submitted'],
      ]);
    },
  );

  repositoryTest('refuses a draft already submitted', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Submitted again');
    await submitIndicator(db, indicatorId, shown, AS_ACTOR);

    await expect(submitIndicator(db, indicatorId, shown, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await submissionsOf(db, versionId)).toHaveLength(1);
  });

  repositoryTest('refuses the draft of a live indicator', async ({ db }) => {
    const { indicatorId } = await indicatorWithTwoPublications(db, 'Live when submitted');
    const drafted = await createDraftFromPublished(db, indicatorId, AS_ACTOR);
    if (!drafted.ok) throw new Error('expected a draft');

    await expect(
      submitIndicator(db, indicatorId, await draftUpdatedAt(db, drafted.versionId), AS_ACTOR),
    ).resolves.toEqual({ ok: false, reason: 'not_allowed' });
    expect(await submissionsOf(db, drafted.versionId)).toEqual([]);
  });

  repositoryTest('refuses an indicator with no draft', async ({ db }) => {
    const { indicatorId } = await indicatorWithTwoPublications(db, 'Nothing to submit');

    await expect(submitIndicator(db, indicatorId, new Date(), AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'no_draft',
    });
  });
});

describe('withdrawSubmission', () => {
  repositoryTest('unlocks the draft and ends its submission', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Withdrawn');
    await submitIndicator(db, indicatorId, shown, AS_ACTOR);
    const before = await versionOf(db, versionId);

    await expect(withdrawSubmission(db, indicatorId, 1, AS_OTHER_ACTOR)).resolves.toEqual({
      ok: true,
    });

    expect(await versionOf(db, versionId)).toEqual({ ...before, isLocked: false });
    expect(await submissionsOf(db, versionId)).toEqual([
      expect.objectContaining({
        number: 1,
        status: 'withdrawn',
        submittedBy: ACTOR,
        endedBy: OTHER_ACTOR,
        endedAt: expect.any(Date),
      }),
    ]);
  });

  repositoryTest(
    'records the unlock and the ended submission in one audit entry',
    async ({ db }) => {
      const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Withdrawal audited');
      await submitIndicator(db, indicatorId, shown, AS_ACTOR);
      const [submitted] = await submissionsOf(db, versionId);

      await withdrawSubmission(db, indicatorId, 1, AS_OTHER_ACTOR);

      const [withdrawn] = await submissionsOf(db, versionId);
      const [, entry] = await stepEntriesFor(db, indicatorId);
      expect(entry).toEqual({
        actorId: OTHER_ACTOR,
        action: 'indicator.submission_withdrawn',
        entityType: 'indicator',
        requestId: null,
        changes: {
          isLocked: { before: true, after: false },
          submission: { before: asJson(submitted), after: asJson(withdrawn) },
        },
      });
    },
  );

  repositoryTest('refuses a draft never submitted', async ({ db }) => {
    const { indicatorId } = await newDraft(db, 'Withdrawn unsubmitted');

    await expect(withdrawSubmission(db, indicatorId, 1, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  repositoryTest('refuses a submission already withdrawn', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Withdrawn twice');
    await submitIndicator(db, indicatorId, shown, AS_ACTOR);
    await withdrawSubmission(db, indicatorId, 1, AS_ACTOR);

    await expect(withdrawSubmission(db, indicatorId, 1, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await stepEntriesFor(db, indicatorId)).toHaveLength(2);
    expect((await submissionsOf(db, versionId))[0]?.status).toBe('withdrawn');
  });

  repositoryTest('withdraws a resubmission by its own number', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Resubmission withdrawn');
    await submitIndicator(db, indicatorId, shown, AS_ACTOR);
    await withdrawSubmission(db, indicatorId, 1, AS_ACTOR);
    await submitIndicator(db, indicatorId, shown, AS_ACTOR);

    await expect(withdrawSubmission(db, indicatorId, 2, AS_ACTOR)).resolves.toEqual({ ok: true });
    expect((await submissionsOf(db, versionId)).map(({ status }) => status)).toEqual([
      'withdrawn',
      'withdrawn',
    ]);
  });

  repositoryTest(
    'refuses an earlier submission withdrawn and resubmitted since, writing nothing',
    async ({ db }) => {
      const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Withdrawn too late');
      await submitIndicator(db, indicatorId, shown, AS_ACTOR);
      await withdrawSubmission(db, indicatorId, 1, AS_ACTOR);
      await submitIndicator(db, indicatorId, shown, AS_ACTOR);

      await expect(withdrawSubmission(db, indicatorId, 1, AS_OTHER_ACTOR)).resolves.toEqual({
        ok: false,
        reason: 'changed',
      });
      expect((await versionOf(db, versionId)).isLocked).toBe(true);
      expect((await submissionsOf(db, versionId)).map(({ status }) => status)).toEqual([
        'withdrawn',
        'submitted',
      ]);
      expect(await stepEntriesFor(db, indicatorId)).toHaveLength(3);
    },
  );
});

/** A new indicator's complete draft, submitted once by the repository tests' actor. */
async function submittedDraft(db: Database, name: string) {
  const draft = await completeNewDraft(db, name);
  await submitIndicator(db, draft.indicatorId, draft.shown, AS_ACTOR);
  const [submission] = await submissionsOf(db, draft.versionId);
  if (submission === undefined) throw new Error('expected a submission');
  return { ...draft, submission };
}

function assign(
  db: Database,
  indicatorId: string,
  reviewerIds: string[],
  previousReviewerIds: string[] = [],
  submissionNumber = 1,
) {
  return assignReviewers(
    db,
    indicatorId,
    { submissionNumber, previousReviewerIds, reviewerIds },
    AS_MANAGER,
  );
}

describe('assignReviewers', () => {
  repositoryTest('puts the submission in review with the reviewers assigned', async ({ db }) => {
    const { indicatorId, versionId, submission } = await submittedDraft(db, 'Assigned');
    const before = await versionOf(db, versionId);

    await expect(assign(db, indicatorId, [REVIEWER, PUBLISHING_REVIEWER])).resolves.toEqual({
      ok: true,
    });

    expect(await versionOf(db, versionId)).toEqual(before);
    expect((await submissionsOf(db, versionId)).map(({ status }) => status)).toEqual(['in_review']);
    expect(await reviewersOf(db, submission.id)).toEqual(
      [REVIEWER, PUBLISHING_REVIEWER].sort().map((reviewerId) => ({
        submissionId: submission.id,
        reviewerId,
        assignedBy: MANAGER,
        assignedAt: expect.any(Date),
      })),
    );
  });

  repositoryTest('records the review and the reviewers in one audit entry', async ({ db }) => {
    const { indicatorId, versionId, submission } = await submittedDraft(db, 'Assignment audited');

    await assign(db, indicatorId, [REVIEWER]);

    const [inReview] = await submissionsOf(db, versionId);
    const [, entry] = await stepEntriesFor(db, indicatorId);
    expect(entry).toEqual({
      actorId: MANAGER,
      action: 'indicator.reviewers_assigned',
      entityType: 'indicator',
      requestId: null,
      changes: {
        submission: { before: asJson(submission), after: asJson(inReview) },
        reviewerIds: { before: [], after: [REVIEWER] },
      },
    });
  });

  repositoryTest(
    'changes the reviewers, keeping the assignment of one who stays',
    async ({ db }) => {
      const { indicatorId, submission } = await submittedDraft(db, 'Reviewers changed');
      await assign(db, indicatorId, [REVIEWER]);
      const [kept] = await reviewersOf(db, submission.id);

      await expect(
        assignReviewers(
          db,
          indicatorId,
          {
            submissionNumber: 1,
            previousReviewerIds: [REVIEWER],
            reviewerIds: [PUBLISHING_REVIEWER, REVIEWER],
          },
          AS_OTHER_ACTOR,
        ),
      ).resolves.toEqual({ ok: true });

      const reviewers = await reviewersOf(db, submission.id);
      expect(reviewers).toHaveLength(2);
      expect(reviewers).toContainEqual(kept);
      expect(reviewers).toContainEqual({
        submissionId: submission.id,
        reviewerId: PUBLISHING_REVIEWER,
        assignedBy: OTHER_ACTOR,
        assignedAt: expect.any(Date),
      });
      const [, , entry] = await stepEntriesFor(db, indicatorId);
      expect(entry?.changes).toEqual({
        reviewerIds: { before: [REVIEWER], after: [PUBLISHING_REVIEWER, REVIEWER] },
      });
    },
  );

  repositoryTest('records nothing when the reviewers are saved unchanged', async ({ db }) => {
    const { indicatorId, submission } = await submittedDraft(db, 'Reviewers saved unchanged');
    await assign(db, indicatorId, [REVIEWER, PUBLISHING_REVIEWER]);
    const [assigned] = await reviewersOf(db, submission.id);

    await expect(
      assign(db, indicatorId, [PUBLISHING_REVIEWER, REVIEWER], [REVIEWER, PUBLISHING_REVIEWER]),
    ).resolves.toEqual({ ok: true });

    expect(await stepEntriesFor(db, indicatorId)).toHaveLength(2);
    expect(await reviewersOf(db, submission.id)).toContainEqual(assigned);
  });

  repositoryTest('removes a reviewer taken off the submission', async ({ db }) => {
    const { indicatorId, versionId, submission } = await submittedDraft(db, 'Reviewer removed');
    await assign(db, indicatorId, [REVIEWER, PUBLISHING_REVIEWER]);

    await expect(
      assign(db, indicatorId, [PUBLISHING_REVIEWER], [PUBLISHING_REVIEWER, REVIEWER]),
    ).resolves.toEqual({ ok: true });

    expect((await reviewersOf(db, submission.id)).map(({ reviewerId }) => reviewerId)).toEqual([
      PUBLISHING_REVIEWER,
    ]);
    expect((await submissionsOf(db, versionId))[0]?.status).toBe('in_review');
  });

  repositoryTest('refuses a submission resubmitted since, writing nothing', async ({ db }) => {
    const { indicatorId, versionId, shown } = await submittedDraft(db, 'Resubmitted unseen');
    await withdrawSubmission(db, indicatorId, 1, AS_ACTOR);
    await submitIndicator(db, indicatorId, shown, AS_ACTOR);

    await expect(assign(db, indicatorId, [REVIEWER])).resolves.toEqual({
      ok: false,
      reason: 'changed',
    });
    expect((await submissionsOf(db, versionId)).map(({ status }) => status)).toEqual([
      'withdrawn',
      'submitted',
    ]);
    expect(await stepEntriesFor(db, indicatorId)).toHaveLength(3);
  });

  repositoryTest.for([
    { when: 'none were shown', shownReviewers: [] as string[] },
    { when: 'others were shown', shownReviewers: [PUBLISHING_REVIEWER] },
  ])(
    'refuses reviewers changed since the manager was shown them, when $when',
    async ({ when, shownReviewers }, { db }) => {
      const { indicatorId, submission } = await submittedDraft(db, `Changed when ${when}`);
      await assign(db, indicatorId, [REVIEWER]);

      await expect(assign(db, indicatorId, [PUBLISHING_REVIEWER], shownReviewers)).resolves.toEqual(
        { ok: false, reason: 'changed' },
      );
      expect((await reviewersOf(db, submission.id)).map(({ reviewerId }) => reviewerId)).toEqual([
        REVIEWER,
      ]);
    },
  );

  repositoryTest('refuses someone without the reviewer role', async ({ db }) => {
    const { indicatorId, versionId, submission } = await submittedDraft(db, 'Not a reviewer');

    await expect(assign(db, indicatorId, [REVIEWER, MANAGER])).resolves.toEqual({
      ok: false,
      reason: 'not_a_reviewer',
    });
    expect((await submissionsOf(db, versionId))[0]?.status).toBe('submitted');
    expect(await reviewersOf(db, submission.id)).toEqual([]);
  });

  repositoryTest("refuses the indicator's creator", async ({ db }) => {
    const created = await createIndicatorDraft(
      db,
      { name: 'Created by a reviewer' },
      { userId: PUBLISHING_REVIEWER, requestId: null },
      TEAM_IDS.teamC,
    );
    if (!created.ok) throw new Error('expected a draft');
    const shown = await completeDraft(db, created);
    await submitIndicator(db, created.indicatorId, shown, AS_ACTOR);

    await expect(assign(db, created.indicatorId, [PUBLISHING_REVIEWER])).resolves.toEqual({
      ok: false,
      reason: 'not_a_reviewer',
    });
  });

  repositoryTest('refuses whoever submitted the submission', async ({ db }) => {
    const { indicatorId, shown } = await completeNewDraft(db, 'Submitted by a reviewer');
    await submitIndicator(db, indicatorId, shown, {
      userId: PUBLISHING_REVIEWER,
      requestId: null,
    });

    await expect(assign(db, indicatorId, [PUBLISHING_REVIEWER])).resolves.toEqual({
      ok: false,
      reason: 'not_a_reviewer',
    });
  });

  repositoryTest(
    "accepts a reviewer in the indicator's team who neither created nor submitted it",
    async ({ db }) => {
      const created = await createIndicatorDraft(
        db,
        { name: 'Reviewed by a teammate' },
        AS_ACTOR,
        TEAM_IDS.teamC,
      );
      if (!created.ok) throw new Error('expected a draft');
      const shown = await completeDraft(db, created);
      await submitIndicator(db, created.indicatorId, shown, AS_ACTOR);

      await expect(assign(db, created.indicatorId, [PUBLISHING_REVIEWER])).resolves.toEqual({
        ok: true,
      });
    },
  );

  repositoryTest('refuses a withdrawn submission', async ({ db }) => {
    const { indicatorId } = await submittedDraft(db, 'Assigned after withdrawal');
    await withdrawSubmission(db, indicatorId, 1, AS_ACTOR);

    await expect(assign(db, indicatorId, [REVIEWER])).resolves.toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  repositoryTest('refuses a draft never submitted', async ({ db }) => {
    const { indicatorId } = await newDraft(db, 'Assigned unsubmitted');

    await expect(assign(db, indicatorId, [REVIEWER])).resolves.toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  repositoryTest(
    'lets the publisher withdraw the submission, keeping its reviewers',
    async ({ db }) => {
      const { indicatorId, versionId } = await submittedDraft(db, 'Withdrawn after assignment');
      await assign(db, indicatorId, [REVIEWER]);

      await expect(withdrawSubmission(db, indicatorId, 1, AS_ACTOR)).resolves.toEqual({ ok: true });
      const [submission] = await submissionsOf(db, versionId);
      expect(submission?.status).toBe('withdrawn');
      expect(
        (await reviewersOf(db, submission?.id ?? '')).map(({ reviewerId }) => reviewerId),
      ).toEqual([REVIEWER]);
      expect((await versionOf(db, versionId)).isLocked).toBe(false);
    },
  );
});

describe('the lock', () => {
  repositoryTest('matches the latest submission after every step', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Locked in step');
    const asReviewer = { userId: PUBLISHING_REVIEWER, requestId: null };
    const respond = (submissionNumber: number, kind: ReviewResponse['kind']) =>
      respondToReview(
        db,
        indicatorId,
        {
          submissionNumber,
          kind,
          imrgReviewedOn: kind === 'pre_imrg_feedback' ? null : ukToday(),
          clarificationRequest: kind === 'approved' ? null : 'What is counted?',
          flags: [],
        },
        asReviewer,
      );
    const replied = async () => {
      await db
        .update(indicatorVersionSubmission)
        .set({ revisionResponse: 'Answered' })
        .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId));
      return { ok: true };
    };
    const steps = [
      () => submitIndicator(db, indicatorId, shown, AS_ACTOR),
      () => withdrawSubmission(db, indicatorId, 1, AS_ACTOR),
      () => submitIndicator(db, indicatorId, shown, AS_ACTOR),
      () => assign(db, indicatorId, [REVIEWER], [], 2),
      () => assign(db, indicatorId, [PUBLISHING_REVIEWER], [REVIEWER], 2),
      () => withdrawSubmission(db, indicatorId, 2, AS_ACTOR),
      () => submitIndicator(db, indicatorId, shown, AS_ACTOR),
      () => respond(3, 'pre_imrg_feedback'),
      replied,
      () => submitIndicator(db, indicatorId, shown, AS_ACTOR),
      () => respond(4, 'major_revisions'),
      replied,
      () => submitIndicator(db, indicatorId, shown, AS_ACTOR),
      () => respond(5, 'approved'),
    ];

    for (const step of steps) {
      expect(await step()).toEqual({ ok: true });
      expect(await lockMismatches(db)).toEqual([]);
    }
  });
});
