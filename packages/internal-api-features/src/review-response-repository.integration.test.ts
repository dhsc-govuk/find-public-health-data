import { FAKE_USER_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import { auditEntriesFor } from '@fphd/db/testing';
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { AS_ACTOR, newDraft, repositoryTest } from './indicator-repository.testing.ts';
import { completeDraft, ukToday } from './indicator-workflow.testing.ts';
import {
  assignReviewers,
  submitIndicator,
  withdrawSubmission,
} from './indicator-workflow-repository.ts';
import { type ReviewResponse, respondToReview } from './review-response-repository.ts';

const {
  indicatorVersion,
  indicatorVersionSubmission,
  indicatorVersionSubmissionFlag,
  indicatorVersionSubmissionResponse,
} = schema;

const REVIEWER = FAKE_USER_IDS.imrgReviewer;
const AS_REVIEWER: Actor = { userId: REVIEWER, requestId: null };
const AS_SECOND_REVIEWER: Actor = { userId: FAKE_USER_IDS.secondImrgReviewer, requestId: null };
const AS_MANAGER: Actor = { userId: FAKE_USER_IDS.imrgManager, requestId: null };

const RESPONSE_ACTIONS = [
  'indicator.review_feedback_given',
  'indicator.changes_requested',
  'indicator.approved',
];

interface Reviewed {
  indicatorId: string;
  versionId: string;
}

/** A complete new draft, submitted and in review with `REVIEWER` assigned. */
async function inReview(db: Database, name: string): Promise<Reviewed> {
  const draft = await newDraft(db, name);
  await submitIndicator(db, draft.indicatorId, await completeDraft(db, draft), AS_ACTOR);
  await assignReviewers(
    db,
    draft.indicatorId,
    { submissionNumber: 1, previousReviewerIds: [], reviewerIds: [REVIEWER] },
    AS_MANAGER,
  );
  return { indicatorId: draft.indicatorId, versionId: draft.versionId };
}

function response(overrides: Partial<ReviewResponse> = {}): ReviewResponse {
  return {
    submissionNumber: 1,
    kind: 'minor_revisions',
    imrgReviewedOn: ukToday(),
    clarificationRequest: null,
    flags: [{ task: 'polarity', notes: 'Higher is better here' }],
    ...overrides,
  };
}

async function versionOf(db: Database, versionId: string) {
  const [row] = await db
    .select({
      status: indicatorVersion.status,
      isLocked: indicatorVersion.isLocked,
      updatedAt: indicatorVersion.updatedAt,
    })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  if (row === undefined) throw new Error(`no version ${versionId}`);
  return row;
}

async function submissionOf(db: Database, versionId: string) {
  const [row] = await db
    .select()
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId))
    .orderBy(asc(indicatorVersionSubmission.number));
  if (row === undefined) throw new Error(`no submission of ${versionId}`);
  return row;
}

async function responsesTo(db: Database, submissionId: string) {
  return db
    .select()
    .from(indicatorVersionSubmissionResponse)
    .where(eq(indicatorVersionSubmissionResponse.submissionId, submissionId));
}

async function flagsOf(db: Database, responseId: string) {
  return db
    .select({
      taskKey: indicatorVersionSubmissionFlag.taskKey,
      notes: indicatorVersionSubmissionFlag.notes,
      clearedAt: indicatorVersionSubmissionFlag.clearedAt,
    })
    .from(indicatorVersionSubmissionFlag)
    .where(eq(indicatorVersionSubmissionFlag.responseId, responseId))
    .orderBy(asc(indicatorVersionSubmissionFlag.taskKey));
}

describe('respondToReview', () => {
  repositoryTest.for<[string, ReviewResponse, string, boolean]>([
    [
      'pre-IMRG feedback',
      response({
        kind: 'pre_imrg_feedback',
        imrgReviewedOn: null,
        clarificationRequest: 'What is counted?',
      }),
      'changes_requested',
      false,
    ],
    ['minor revisions', response(), 'changes_requested', false],
    [
      'major revisions',
      response({
        kind: 'major_revisions',
        flags: [
          { task: 'data-table', notes: 'Add 2024' },
          { task: 'name', notes: 'Shorter, please' },
        ],
      }),
      'changes_requested',
      false,
    ],
    [
      'an approval',
      response({ kind: 'approved', flags: [], clarificationRequest: null }),
      'approved',
      true,
    ],
  ])(
    'ends the submission on %s, recording the response',
    async ([, sent, status, locked], { db }) => {
      const { indicatorId, versionId } = await inReview(db, `Answered with ${sent.kind}`);
      const before = await versionOf(db, versionId);

      await expect(respondToReview(db, indicatorId, sent, AS_REVIEWER)).resolves.toEqual({
        ok: true,
      });

      expect(await versionOf(db, versionId)).toEqual({
        status: 'draft',
        isLocked: locked,
        updatedAt: before.updatedAt,
      });
      const submission = await submissionOf(db, versionId);
      expect(submission).toMatchObject({ status, endedBy: REVIEWER, endedAt: expect.any(Date) });
      const [recorded, ...others] = await responsesTo(db, submission.id);
      expect(others).toEqual([]);
      expect(recorded).toMatchObject({
        reviewerId: REVIEWER,
        kind: sent.kind,
        imrgReviewedOn: sent.imrgReviewedOn,
        clarificationRequest: sent.clarificationRequest,
      });
      expect(await flagsOf(db, recorded?.id ?? '')).toEqual(
        sent.flags.map(({ task, notes }) => ({ taskKey: task, notes, clearedAt: null })),
      );
      const entries = (await auditEntriesFor(db, indicatorId)).filter(({ action }) =>
        RESPONSE_ACTIONS.includes(action),
      );
      expect(entries).toEqual([
        expect.objectContaining({
          actorId: REVIEWER,
          changes: expect.objectContaining({
            submission: expect.objectContaining({ after: expect.objectContaining({ status }) }),
            response: {
              before: null,
              after: expect.objectContaining({
                kind: sent.kind,
                flags: sent.flags.map(({ task, notes }) => ({ taskKey: task, notes })),
              }),
            },
          }),
        }),
      ]);
    },
  );

  repositoryTest('refuses as changed a response to another submission', async ({ db }) => {
    const { indicatorId } = await inReview(db, 'Answered for the wrong round');

    await expect(
      respondToReview(db, indicatorId, response({ submissionNumber: 2 }), AS_REVIEWER),
    ).resolves.toEqual({ ok: false, reason: 'changed' });
  });

  repositoryTest('refuses a reviewer not assigned to the submission', async ({ db }) => {
    const { indicatorId, versionId } = await inReview(db, 'Answered by someone else');

    await expect(respondToReview(db, indicatorId, response(), AS_SECOND_REVIEWER)).resolves.toEqual(
      { ok: false, reason: 'not_a_reviewer' },
    );
    expect((await submissionOf(db, versionId)).status).toBe('in_review');
  });

  repositoryTest('refuses an IMRG date before the version was first submitted', async ({ db }) => {
    const { indicatorId } = await inReview(db, 'Reviewed before submission');

    await expect(
      respondToReview(db, indicatorId, response({ imrgReviewedOn: '2020-01-01' }), AS_REVIEWER),
    ).resolves.toEqual({ ok: false, reason: 'reviewed_before_submission' });
  });

  repositoryTest(
    'accepts an IMRG date on the day the version was first submitted',
    async ({ db }) => {
      const { indicatorId } = await inReview(db, 'Reviewed the day it was submitted');

      await expect(
        respondToReview(db, indicatorId, response({ imrgReviewedOn: ukToday() }), AS_REVIEWER),
      ).resolves.toEqual({ ok: true });
    },
  );

  repositoryTest('refuses a second response to the submission', async ({ db }) => {
    const { indicatorId } = await inReview(db, 'Answered twice');
    await respondToReview(db, indicatorId, response(), AS_REVIEWER);

    await expect(respondToReview(db, indicatorId, response(), AS_REVIEWER)).resolves.toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  repositoryTest('refuses a response to a submission waiting for reviewers', async ({ db }) => {
    const draft = await newDraft(db, 'Answered before assignment');
    await submitIndicator(db, draft.indicatorId, await completeDraft(db, draft), AS_ACTOR);

    await expect(respondToReview(db, draft.indicatorId, response(), AS_REVIEWER)).resolves.toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  repositoryTest('refuses a response to a withdrawn submission', async ({ db }) => {
    const { indicatorId } = await inReview(db, 'Answered after withdrawal');
    await withdrawSubmission(db, indicatorId, 1, AS_ACTOR);

    await expect(respondToReview(db, indicatorId, response(), AS_REVIEWER)).resolves.toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  repositoryTest('refuses an approval of a draft whose date was cleared', async ({ db }) => {
    const { indicatorId, versionId } = await inReview(db, 'Approved without a date');
    await db
      .update(indicatorVersion)
      .set({ scheduledPublishAt: null })
      .where(eq(indicatorVersion.id, versionId));

    await expect(
      respondToReview(db, indicatorId, response({ kind: 'approved', flags: [] }), AS_REVIEWER),
    ).resolves.toEqual({ ok: false, reason: 'no_publication_date' });
  });

  repositoryTest('approves a draft whose publication date has passed', async ({ db }) => {
    const { indicatorId, versionId } = await inReview(db, 'Approved late');
    await db
      .update(indicatorVersion)
      .set({ scheduledPublishAt: new Date('2026-01-01T09:30:00Z') })
      .where(eq(indicatorVersion.id, versionId));

    await expect(
      respondToReview(db, indicatorId, response({ kind: 'approved', flags: [] }), AS_REVIEWER),
    ).resolves.toEqual({ ok: true });
    expect(await versionOf(db, versionId)).toMatchObject({ status: 'draft', isLocked: true });
  });
});
