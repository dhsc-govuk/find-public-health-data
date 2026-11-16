import { FAKE_USER_IDS, TEAM_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import { auditEntriesFor } from '@fphd/db/testing';
import { takeIndicatorStep } from '@fphd/internal-workflow';
import { asc, eq } from 'drizzle-orm';
import { v7 as randomUuidV7 } from 'uuid';
import { describe, expect } from 'vitest';

import { type CreatedIndicatorDraft, createIndicatorDraft } from './indicator-draft-repository.ts';
import { AS_ACTOR, newDraft, repositoryTest } from './indicator-repository.testing.ts';
import { answerUpdate, completeDraft, updateInReview } from './indicator-workflow.testing.ts';
import { assignReviewers, submitIndicator } from './indicator-workflow-repository.ts';
import { respondToReview } from './review-response-repository.ts';

const {
  indicatorVersion,
  indicatorVersionSubmission,
  indicatorVersionSubmissionFlag,
  indicatorVersionSubmissionResponse,
  indicatorVersionSubmissionReviewer,
} = schema;

const AS_MANAGER: Actor = { userId: FAKE_USER_IDS.imrgManager, requestId: null };
const REVIEWER = FAKE_USER_IDS.imrgReviewer;
const AS_REVIEWER: Actor = { userId: REVIEWER, requestId: null };
const SECOND_REVIEWER = FAKE_USER_IDS.secondImrgReviewer;
const PUBLISHING_REVIEWER = FAKE_USER_IDS.publisherAndReviewer;
const AS_PUBLISHING_REVIEWER: Actor = { userId: PUBLISHING_REVIEWER, requestId: null };
const AS_TEAM_C_PUBLISHER: Actor = { userId: FAKE_USER_IDS.publisherTeamC, requestId: null };

interface Round {
  indicatorId: string;
  versionId: string;
  shown: Date;
}

/** A complete draft, submitted by `submitter` and put in review with `reviewerIds`. */
async function inReview(
  db: Database,
  draft: CreatedIndicatorDraft,
  reviewerIds: string[],
  submitter: Actor = AS_ACTOR,
): Promise<Round> {
  const shown = await completeDraft(db, draft);
  expect(await submitIndicator(db, draft.indicatorId, shown, submitter)).toEqual({ ok: true });
  expect(
    await assignReviewers(
      db,
      draft.indicatorId,
      { submissionNumber: 1, previousReviewerIds: [], reviewerIds },
      AS_MANAGER,
    ),
  ).toEqual({ ok: true });
  return { indicatorId: draft.indicatorId, versionId: draft.versionId, shown };
}

/** Ends the round as changes requested, with a reply written so it may be resubmitted. */
async function sentBack(db: Database, { indicatorId, versionId }: Round): Promise<void> {
  expect(await takeIndicatorStep(db, indicatorId, 'request_changes', AS_REVIEWER)).toEqual({
    ok: true,
  });
  await db
    .update(indicatorVersionSubmission)
    .set({ revisionResponse: 'Done as asked' })
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId));
}

async function submissionsOf(db: Database, versionId: string) {
  return db
    .select()
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId))
    .orderBy(asc(indicatorVersionSubmission.number));
}

async function latestOf(db: Database, versionId: string) {
  const latest = (await submissionsOf(db, versionId)).at(-1);
  if (latest === undefined) throw new Error(`no submission of ${versionId}`);
  return latest;
}

async function reviewersOf(db: Database, submissionId: string) {
  return db
    .select({
      reviewerId: indicatorVersionSubmissionReviewer.reviewerId,
      assignedBy: indicatorVersionSubmissionReviewer.assignedBy,
    })
    .from(indicatorVersionSubmissionReviewer)
    .where(eq(indicatorVersionSubmissionReviewer.submissionId, submissionId))
    .orderBy(asc(indicatorVersionSubmissionReviewer.reviewerId));
}

async function isLocked(db: Database, versionId: string): Promise<boolean> {
  const [row] = await db
    .select({ isLocked: indicatorVersion.isLocked })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  return row?.isLocked ?? false;
}

/** A Team C draft, created by its second publisher so the publishing reviewer may review it. */
async function teamCDraft(db: Database, name: string): Promise<CreatedIndicatorDraft> {
  const created = await createIndicatorDraft(
    db,
    randomUuidV7(),
    { name },
    AS_TEAM_C_PUBLISHER,
    TEAM_IDS.teamC,
  );
  if (!created.ok) throw new Error(`createIndicatorDraft refused the name: ${created.reason}`);
  return created;
}

describe('a resubmission', () => {
  repositoryTest(
    "of an update starts a submission with no reviewers and no decision, keeping the update's changes",
    async ({ db }) => {
      const update = await updateInReview(db, 'Update resubmitted');
      await respondToReview(
        db,
        update.indicatorId,
        {
          submissionNumber: 1,
          kind: 'pre_imrg_feedback',
          imrgReviewedOn: null,
          clarificationRequest: null,
          flags: [{ task: 'update-summary', notes: 'Say why' }],
        },
        AS_REVIEWER,
      );
      const shown = await answerUpdate(db, update, { polarity: 'no-polarity' });
      await db
        .update(indicatorVersionSubmission)
        .set({ revisionResponse: 'Said why' })
        .where(eq(indicatorVersionSubmission.indicatorVersionId, update.versionId));

      expect(await submitIndicator(db, update.indicatorId, shown, AS_ACTOR)).toEqual({ ok: true });

      const latest = await latestOf(db, update.versionId);
      expect(latest).toMatchObject({
        number: 2,
        status: 'submitted',
        updateDecision: null,
        updateChanges: expect.arrayContaining([expect.objectContaining({ task: 'polarity' })]),
      });
      expect(await reviewersOf(db, latest.id)).toEqual([]);
      expect(await isLocked(db, update.versionId)).toBe(true);
    },
  );

  repositoryTest('goes straight back to the same reviewers, in review', async ({ db }) => {
    const round = await inReview(db, await newDraft(db, 'Resubmitted to its reviewers'), [
      REVIEWER,
      SECOND_REVIEWER,
    ]);
    await sentBack(db, round);

    expect(await submitIndicator(db, round.indicatorId, round.shown, AS_ACTOR)).toEqual({
      ok: true,
    });

    const latest = await latestOf(db, round.versionId);
    expect(latest).toMatchObject({ number: 2, status: 'in_review' });
    expect(await reviewersOf(db, latest.id)).toEqual(
      [REVIEWER, SECOND_REVIEWER]
        .sort()
        .map((reviewerId) => ({ reviewerId, assignedBy: FAKE_USER_IDS.imrgManager })),
    );
    expect(await isLocked(db, round.versionId)).toBe(true);
  });

  repositoryTest('answers a repeat as the first, writing nothing', async ({ db }) => {
    const round = await inReview(db, await newDraft(db, 'Resubmitted twice'), [REVIEWER]);
    await sentBack(db, round);
    await submitIndicator(db, round.indicatorId, round.shown, AS_ACTOR);

    expect(await submitIndicator(db, round.indicatorId, round.shown, AS_ACTOR)).toEqual({
      ok: true,
      repeated: true,
    });
    expect((await submissionsOf(db, round.versionId)).map(({ status }) => status)).toEqual([
      'changes_requested',
      'in_review',
    ]);
  });

  repositoryTest('records the reviewers carried in its audit entry', async ({ db }) => {
    const round = await inReview(db, await newDraft(db, 'Resubmission audited'), [REVIEWER]);
    await sentBack(db, round);

    await submitIndicator(db, round.indicatorId, round.shown, AS_ACTOR);

    const entries = await auditEntriesFor(db, round.indicatorId);
    const resubmitted = entries.filter(({ action }) => action === 'indicator.resubmitted');
    expect(resubmitted).toEqual([
      expect.objectContaining({
        changes: expect.objectContaining({
          isLocked: { before: false, after: true },
          reviewerIds: { before: [], after: [REVIEWER] },
        }),
      }),
    ]);
  });

  repositoryTest('leaves out a reviewer who is now its submitter', async ({ db }) => {
    const round = await inReview(
      db,
      await teamCDraft(db, 'Resubmitted by a reviewer'),
      [REVIEWER, PUBLISHING_REVIEWER],
      AS_TEAM_C_PUBLISHER,
    );
    await sentBack(db, round);

    await submitIndicator(db, round.indicatorId, round.shown, AS_PUBLISHING_REVIEWER);

    const latest = await latestOf(db, round.versionId);
    expect(latest.status).toBe('in_review');
    expect((await reviewersOf(db, latest.id)).map(({ reviewerId }) => reviewerId)).toEqual([
      REVIEWER,
    ]);
  });

  repositoryTest('waits for reviewers when none is still eligible', async ({ db }) => {
    const round = await inReview(
      db,
      await teamCDraft(db, 'Resubmitted by its only reviewer'),
      [PUBLISHING_REVIEWER],
      AS_TEAM_C_PUBLISHER,
    );
    await sentBack(db, round);

    await submitIndicator(db, round.indicatorId, round.shown, AS_PUBLISHING_REVIEWER);

    const latest = await latestOf(db, round.versionId);
    expect(latest.status).toBe('submitted');
    expect(await reviewersOf(db, latest.id)).toEqual([]);
    expect(await isLocked(db, round.versionId)).toBe(true);
  });

  repositoryTest('is refused while a flagged task is unsaved', async ({ db }) => {
    const round = await inReview(db, await newDraft(db, 'Resubmitted with a flag'), [REVIEWER]);
    await sentBack(db, round);
    const [response] = await db
      .insert(indicatorVersionSubmissionResponse)
      .values({
        submissionId: (await latestOf(db, round.versionId)).id,
        reviewerId: REVIEWER,
        kind: 'minor_revisions',
        imrgReviewedOn: '2026-10-01',
      })
      .returning();
    await db
      .insert(indicatorVersionSubmissionFlag)
      .values({ responseId: response?.id ?? '', taskKey: 'polarity', notes: 'Check it' });

    await expect(submitIndicator(db, round.indicatorId, round.shown, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'flagged',
    });

    await db
      .update(indicatorVersionSubmissionFlag)
      .set({ clearedBy: FAKE_USER_IDS.publisherTeamA, clearedAt: new Date() });

    await expect(submitIndicator(db, round.indicatorId, round.shown, AS_ACTOR)).resolves.toEqual({
      ok: true,
    });
  });

  repositoryTest.for<[string, string | null]>([
    ['no reply', null],
    ['a blank reply', '  \n'],
  ])('is refused with %s', async ([which, reply], { db }) => {
    const round = await inReview(db, await newDraft(db, `Resubmitted with ${which}`), [REVIEWER]);
    await sentBack(db, round);
    await db
      .update(indicatorVersionSubmission)
      .set({ revisionResponse: reply })
      .where(eq(indicatorVersionSubmission.indicatorVersionId, round.versionId));

    await expect(submitIndicator(db, round.indicatorId, round.shown, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'no_response',
    });
    expect(await isLocked(db, round.versionId)).toBe(false);
  });
});
