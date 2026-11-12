import { isDeepStrictEqual } from 'node:util';

import { type Database, schema } from '@fphd/db';
import { type Actor, listChanges } from '@fphd/db/audit-log';
import {
  type IndicatorStepResult,
  type IndicatorStepWrite,
  type ReviewersToCarry,
  takeIndicatorStep,
} from '@fphd/internal-workflow';
import { and, eq, notInArray } from 'drizzle-orm';

import type { CiMethodKind } from './contract.ts';
import { draftListsOf, getPublishedAnswers } from './indicator-draft-repository.ts';
import type { Transaction } from './indicator-repository-sql.ts';
import { isDraftComplete } from './indicator-task-list.ts';
import { hasUnclearedFlag } from './review-flag-repository.ts';
import {
  assignedReviewerIds,
  carriedReviewersOf,
  findEligibleReviewerIds,
} from './reviewer-repository.ts';

const { ciMethod, indicatorVersionSubmission, indicatorVersionSubmissionReviewer } = schema;

type Submission = typeof indicatorVersionSubmission.$inferSelect;

/**
 * Chooses the reviewers that a resubmit step carries onto the new submission. They are the latest
 * submission's reviewers who still hold the reviewer role and who are neither the indicator's
 * creator nor the person submitting it now.
 */
export const stillEligibleReviewers: ReviewersToCarry = (tx, { indicatorId, latest, actor }) =>
  carriedReviewersOf(tx, indicatorId, latest.id, actor.userId);

async function ciMethodKindOf(tx: Transaction, id: string | null): Promise<CiMethodKind | null> {
  if (id === null) return null;
  const [method] = await tx
    .select({ kind: ciMethod.kind })
    .from(ciMethod)
    .where(eq(ciMethod.id, id));
  return method?.kind ?? null;
}

/** Why a draft sent back for changes may not be resubmitted yet: a flag left, or no reply. */
async function resubmissionProblem(
  tx: Transaction,
  latest: Submission,
): Promise<'flagged' | 'no_response' | undefined> {
  if (await hasUnclearedFlag(tx, latest.id)) return 'flagged';
  return (latest.revisionResponse ?? '').trim() === '' ? 'no_response' : undefined;
}

/**
 * Submits a complete draft for approval, or resubmits one sent back for changes once every
 * flagged task is saved and the reply is written. A draft of a live indicator is an update, which
 * must also change at least one task. A resubmission goes straight to the latest submission's
 * reviewers who may still review it. `draftUpdatedAt` is the draft's
 * `updatedAt` as the publisher was shown it: an edit since then refuses the submission as
 * `changed`, so nobody confirms a draft they have not seen.
 *
 * A repeat of a submission that went through succeeds without writing. It is a repeat when the
 * draft's latest submission is still open, was made by the same user, and the draft has not been
 * edited since the `draftUpdatedAt` they sent. A submission by someone else is still refused.
 */
export function submitIndicator(
  db: Database,
  indicatorId: string,
  draftUpdatedAt: Date,
  actor: Actor,
): Promise<IndicatorStepResult<'changed' | 'incomplete' | 'flagged' | 'no_response'>> {
  return takeIndicatorStep(
    db,
    indicatorId,
    (latest) => (latest?.status === 'changes_requested' ? 'resubmit' : 'submit'),
    actor,
    {
      precondition: async (tx, { draft, latest }) => {
        if (draft.updatedAt.getTime() !== draftUpdatedAt.getTime()) return 'changed';
        const [lists, ciMethodKind, published] = await Promise.all([
          draftListsOf(tx, draft.id),
          ciMethodKindOf(tx, draft.ciMethodId),
          getPublishedAnswers(tx, indicatorId),
        ]);
        if (!isDraftComplete({ ...draft, ...lists, ciMethodKind }, published ?? null)) {
          return 'incomplete';
        }
        return latest?.status === 'changes_requested' ? resubmissionProblem(tx, latest) : undefined;
      },
      reviewersToCarry: stillEligibleReviewers,
      alreadyTaken: ({ draft, latest }) =>
        latest !== undefined &&
        // A resubmission that carries its reviewers starts in review rather than submitted.
        (latest.status === 'submitted' || latest.status === 'in_review') &&
        latest.submittedBy === actor.userId &&
        draft.updatedAt.getTime() === draftUpdatedAt.getTime(),
    },
  );
}

/**
 * Withdraws the draft's submission before reviewers are assigned, unlocking the draft.
 * `submissionNumber` is the submission the publisher was shown: one withdrawn and resubmitted since
 * is refused as `changed`, so an old confirmation page never withdraws a newer submission. A
 * repeat of a withdrawal that went through, when that submission is still the latest and the same
 * user withdrew it, succeeds without writing.
 */
export function withdrawSubmission(
  db: Database,
  indicatorId: string,
  submissionNumber: number,
  actor: Actor,
): Promise<IndicatorStepResult<'changed'>> {
  return takeIndicatorStep(db, indicatorId, 'withdraw', actor, {
    precondition: async (_tx, { latest }) =>
      latest?.number === submissionNumber ? undefined : 'changed',
    alreadyTaken: ({ latest }) =>
      latest?.number === submissionNumber &&
      latest.status === 'withdrawn' &&
      latest.endedBy === actor.userId,
  });
}

/** The reviewers an IMRG manager assigns, and the submission and reviewers they were shown. */
export interface ReviewerAssignment {
  submissionNumber: number;
  previousReviewerIds: readonly string[];
  reviewerIds: readonly string[];
}

/**
 * Replaces the submission's reviewers with `reviewerIds`, keeping the rows of those who stay, and
 * answers the change. The rows deleted and inserted give the reviewers before.
 */
export function replaceReviewers(reviewerIds: readonly string[], actor: Actor): IndicatorStepWrite {
  return async (tx, submission) => {
    const removed = await tx
      .delete(indicatorVersionSubmissionReviewer)
      .where(
        and(
          eq(indicatorVersionSubmissionReviewer.submissionId, submission.id),
          notInArray(indicatorVersionSubmissionReviewer.reviewerId, [...reviewerIds]),
        ),
      )
      .returning({ reviewerId: indicatorVersionSubmissionReviewer.reviewerId });
    const added =
      reviewerIds.length === 0
        ? []
        : await tx
            .insert(indicatorVersionSubmissionReviewer)
            .values(
              reviewerIds.map((reviewerId) => ({
                submissionId: submission.id,
                reviewerId,
                assignedBy: actor.userId,
              })),
            )
            .onConflictDoNothing()
            .returning({ reviewerId: indicatorVersionSubmissionReviewer.reviewerId });
    const addedIds = added.map(({ reviewerId }) => reviewerId);
    const before = [
      ...reviewerIds.filter((id) => !addedIds.includes(id)),
      ...removed.map(({ reviewerId }) => reviewerId),
    ];
    return listChanges({ reviewerIds: before }, { reviewerIds: [...reviewerIds] }, ['reviewerIds']);
  };
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return isDeepStrictEqual([...a].sort(), [...b].sort());
}

/**
 * Assigns the reviewers of the draft's latest submission, or changes them, and puts it in review.
 * A change to the submission or its reviewers since the manager was shown them refuses the
 * assignment as `changed`, so nobody overwrites reviewers they have not seen.
 */
export function assignReviewers(
  db: Database,
  indicatorId: string,
  { submissionNumber, previousReviewerIds, reviewerIds }: ReviewerAssignment,
  actor: Actor,
): Promise<IndicatorStepResult<'changed' | 'not_a_reviewer'>> {
  return takeIndicatorStep(db, indicatorId, 'assign_reviewers', actor, {
    precondition: async (tx, { latest }) => {
      if (latest?.number !== submissionNumber) return 'changed';
      if (!sameMembers(await assignedReviewerIds(tx, latest.id), previousReviewerIds)) {
        return 'changed';
      }
      const eligible = await findEligibleReviewerIds(tx, indicatorId, latest.submittedBy);
      return reviewerIds.every((id) => eligible.includes(id)) ? undefined : 'not_a_reviewer';
    },
    write: replaceReviewers(reviewerIds, actor),
  });
}
