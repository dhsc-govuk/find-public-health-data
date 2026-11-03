import { isDeepStrictEqual } from 'node:util';

import { type Database, schema } from '@fphd/db';
import {
  type Actor,
  type AuditAction,
  type AuditChanges,
  changesBetween,
  listChanges,
  recordAudit,
} from '@fphd/db/audit-log';
import type { IndicatorSubmissionStatus } from '@fphd/utils/indicator-submission-status';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';

import type { CiMethodKind, IndicatorStep } from './contract.ts';
import {
  draftListsOf,
  type IndicatorDraftVersion,
  isPublished,
} from './indicator-draft-repository.ts';
import type { Transaction } from './indicator-repository-sql.ts';
import { isDraftComplete } from './indicator-task-list.ts';
import {
  allowedSteps,
  carriesReviewers,
  type IndicatorWorkflowContext,
  nextState,
} from './indicator-workflow.ts';
import { hasUnclearedFlag } from './review-flag-repository.ts';
import {
  assignedReviewerIds,
  type CarriedReviewer,
  carriedReviewersOf,
  carryReviewers,
  findEligibleReviewerIds,
} from './reviewer-repository.ts';

const {
  ciMethod,
  indicatorVersion,
  indicatorVersionSubmission,
  indicatorVersionSubmissionReviewer,
} = schema;

type Submission = typeof indicatorVersionSubmission.$inferSelect;

export type IndicatorStepResult<Reason extends string = never> =
  | { ok: true }
  | { ok: false; reason: 'no_draft' | 'not_allowed' | Reason };

/**
 * A step's own check of the draft and its latest submission, made under the draft's lock: why
 * the step is refused, or nothing.
 */
export type IndicatorStepPrecondition<Reason extends string> = (
  tx: Transaction,
  state: { draft: IndicatorDraftVersion; latest: Submission | undefined },
) => Promise<Reason | undefined>;

/** A step's write of its own rows beside the submission's, answering their changes for the audit. */
export type IndicatorStepWrite = (tx: Transaction, submission: Submission) => Promise<AuditChanges>;

/** The step to take, chosen by where the draft's latest submission stands under the lock. */
export type IndicatorStepChoice =
  | IndicatorStep
  | ((latest: Submission | undefined) => IndicatorStep);

const STEP_ACTIONS: Readonly<Record<IndicatorStep, AuditAction>> = {
  submit: 'indicator.submitted',
  withdraw: 'indicator.submission_withdrawn',
  assign_reviewers: 'indicator.reviewers_assigned',
  give_feedback: 'indicator.review_feedback_given',
  request_changes: 'indicator.changes_requested',
  approve: 'indicator.approved',
  resubmit: 'indicator.resubmitted',
};

interface SubmissionWrite {
  tx: Transaction;
  draft: IndicatorDraftVersion;
  latest: Submission | undefined;
  status: IndicatorSubmissionStatus;
  actor: Actor;
}

type SubmissionWriteResult = { before: Submission | null; after: Submission };

/** Inserts the version's next submission, as a submission or resubmission does. */
async function insertNextSubmission({
  tx,
  draft,
  latest,
  status,
  actor,
}: SubmissionWrite): Promise<SubmissionWriteResult> {
  const [after] = await tx
    .insert(indicatorVersionSubmission)
    .values({
      indicatorVersionId: draft.id,
      indicatorId: draft.indicatorId,
      number: (latest?.number ?? 0) + 1,
      status,
      submittedBy: actor.userId,
    })
    .returning();
  if (after === undefined) throw new Error('inserted no submission');
  return { before: null, after };
}

/** Ends the latest submission, as a withdrawal or a reviewer's response does. */
async function endLatestSubmission({
  tx,
  latest,
  status,
  actor,
}: SubmissionWrite): Promise<SubmissionWriteResult> {
  if (latest === undefined) throw new Error('found no submission to end');
  const [after] = await tx
    .update(indicatorVersionSubmission)
    .set({ status, endedBy: actor.userId, endedAt: sql`clock_timestamp()` })
    .where(eq(indicatorVersionSubmission.id, latest.id))
    .returning();
  if (after === undefined) throw new Error(`ended no submission ${latest.id}`);
  return { before: latest, after };
}

/** Each step's write of a submission, answering the row before (null when inserted) and after. */
const SUBMISSION_WRITES: Readonly<
  Record<IndicatorStep, (write: SubmissionWrite) => Promise<SubmissionWriteResult>>
> = {
  submit: insertNextSubmission,
  withdraw: endLatestSubmission,
  // Changing the reviewers leaves a submission already in review as it is.
  assign_reviewers: async ({ tx, latest, status }) => {
    if (latest === undefined) throw new Error('assign_reviewers found no submission');
    if (latest.status === status) return { before: latest, after: latest };
    const [after] = await tx
      .update(indicatorVersionSubmission)
      .set({ status })
      .where(eq(indicatorVersionSubmission.id, latest.id))
      .returning();
    if (after === undefined) throw new Error(`assign_reviewers updated no submission ${latest.id}`);
    return { before: latest, after };
  },
  give_feedback: endLatestSubmission,
  request_changes: endLatestSubmission,
  approve: endLatestSubmission,
  resubmit: insertNextSubmission,
};

/**
 * Takes a workflow step on the indicator's draft in one transaction: the version's lock, its
 * submission, the step's own rows that `write` adds and the audit entry are written together or
 * not at all. A step that changes nothing records nothing. A step is not an edit, so the version's
 * `updated_at` and `updated_by` stay as the last edit left them.
 */
export async function takeIndicatorStep<Reason extends string = never>(
  db: Database,
  indicatorId: string,
  choice: IndicatorStepChoice,
  actor: Actor,
  {
    precondition,
    write,
  }: { precondition?: IndicatorStepPrecondition<Reason>; write?: IndicatorStepWrite } = {},
): Promise<IndicatorStepResult<Reason>> {
  return db.transaction(async (tx): Promise<IndicatorStepResult<Reason>> => {
    // No key update, so an upload's foreign key share on the version does not hold the step up.
    // A refused load's FOR SHARE does until it commits, but it never writes the row: no deadlock.
    const [draft] = await tx
      .select()
      .from(indicatorVersion)
      .where(
        and(eq(indicatorVersion.indicatorId, indicatorId), eq(indicatorVersion.status, 'draft')),
      )
      .for('no key update');

    if (draft === undefined) return { ok: false, reason: 'no_draft' };

    const [latest] = await tx
      .select()
      .from(indicatorVersionSubmission)
      .where(eq(indicatorVersionSubmission.indicatorVersionId, draft.id))
      .orderBy(desc(indicatorVersionSubmission.number))
      .limit(1);
    const step = typeof choice === 'function' ? choice(latest) : choice;
    const context: IndicatorWorkflowContext = {
      indicatorStatus: (await isPublished(tx, indicatorId)) ? 'live' : 'new',
      versionStatus: draft.status,
      isLocked: draft.isLocked,
      latestSubmissionStatus: latest?.status ?? null,
    };

    if (!allowedSteps(context).includes(step)) return { ok: false, reason: 'not_allowed' };

    const carried: CarriedReviewer[] =
      carriesReviewers(step) && latest !== undefined
        ? await carriedReviewersOf(tx, indicatorId, latest.id, actor.userId)
        : [];
    const next = nextState(context, step, { carriedReviewerCount: carried.length });

    if (!next.ok) return next;

    const refusal = await precondition?.(tx, { draft, latest });
    if (refusal !== undefined) return { ok: false, reason: refusal };

    const [version] = await tx
      .update(indicatorVersion)
      .set({ status: next.state.versionStatus, isLocked: next.state.isLocked })
      .where(eq(indicatorVersion.id, draft.id))
      .returning({ status: indicatorVersion.status, isLocked: indicatorVersion.isLocked });
    if (version === undefined)
      throw new Error(`${step} locked draft ${draft.id} but updated no row`);

    const submission = await SUBMISSION_WRITES[step]({
      tx,
      draft,
      latest,
      status: next.state.submissionStatus,
      actor,
    });
    const reviewersCarried = await carryReviewers(tx, submission.after.id, carried);
    const written = (await write?.(tx, submission.after)) ?? {};
    const changes = {
      ...changesBetween({ status: draft.status, isLocked: draft.isLocked }, version),
      ...(isDeepStrictEqual(submission.before, submission.after) ? {} : { submission }),
      ...reviewersCarried,
      ...written,
    };

    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, actor, [
        { action: STEP_ACTIONS[step], entityId: indicatorId, changes },
      ]);
    }

    return { ok: true };
  });
}

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
 * Submits a new indicator's complete draft for approval, or resubmits one sent back for changes
 * once every flagged task is saved and the reply is written. Either goes straight to the latest
 * submission's reviewers who may still review it. `draftUpdatedAt` is the draft's `updatedAt` as
 * the publisher was shown it: an edit since then refuses the submission as `changed`, so nobody
 * confirms a draft they have not seen.
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
        const [lists, ciMethodKind] = await Promise.all([
          draftListsOf(tx, draft.id),
          ciMethodKindOf(tx, draft.ciMethodId),
        ]);
        if (!isDraftComplete({ ...draft, ...lists, ciMethodKind })) return 'incomplete';
        return latest?.status === 'changes_requested' ? resubmissionProblem(tx, latest) : undefined;
      },
    },
  );
}

/**
 * Withdraws the draft's submission before any response, unlocking the draft and keeping its
 * reviewers for the next submission. `submissionNumber` is the submission the publisher was shown:
 * one withdrawn and resubmitted since is refused as `changed`, so an old confirmation page never
 * withdraws a newer submission.
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
