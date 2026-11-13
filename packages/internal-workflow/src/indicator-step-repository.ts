import { isDeepStrictEqual } from 'node:util';

import { type Database, schema } from '@fphd/db';
import {
  type Actor,
  type AuditAction,
  type AuditChanges,
  changesBetween,
  recordAudit,
} from '@fphd/db/audit-log';
import type { IndicatorStatus } from '@fphd/utils/indicator-status';
import type { IndicatorStep } from '@fphd/utils/indicator-step';
import type { IndicatorSubmissionStatus } from '@fphd/utils/indicator-submission-status';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Transaction } from './database.ts';
import { type IndicatorDraftVersion, isPublished } from './indicator-version-repository.ts';
import {
  allowedSteps,
  carriesReviewers,
  type IndicatorWorkflowContext,
  nextState,
} from './indicator-workflow.ts';
import { type CarriedReviewer, carryReviewers } from './reviewer-repository.ts';

const { indicatorVersion, indicatorVersionSubmission, isUnpublished } = schema;

type Submission = typeof indicatorVersionSubmission.$inferSelect;

/**
 * A step taken, or refused with its reason. `repeated` marks a request that found the step
 * already taken for it, as `IndicatorStepOptions.alreadyTaken` decides, and wrote nothing.
 */
export type IndicatorStepResult<Reason extends string = never> =
  | { ok: true; repeated?: true }
  | { ok: false; reason: 'no_draft' | 'not_allowed' | Reason };

/**
 * A step's own check of the draft version and its latest submission, run while the step holds the
 * lock on the draft version's row. `indicatorStatus` says whether the draft is a new indicator's
 * or an update to a live one. It returns the reason the step is refused, or undefined to let the
 * step go ahead.
 */
export type IndicatorStepPrecondition<Reason extends string> = (
  tx: Transaction,
  state: {
    draft: IndicatorDraftVersion;
    latest: Submission | undefined;
    indicatorStatus: IndicatorStatus;
  },
) => Promise<Reason | undefined>;

/**
 * Whether the draft version and its latest submission are already where this same request would
 * have put them, because an earlier copy of the request took the step. It runs while the step
 * holds the lock on the draft version's row.
 */
export type IndicatorStepAlreadyTaken = (state: {
  draft: IndicatorDraftVersion;
  latest: Submission | undefined;
}) => boolean;

/** The draft version's status, lock and publication time after the step has updated them. */
export type SteppedVersion = Pick<IndicatorDraftVersion, 'status' | 'isLocked' | 'publishedAt'>;

/**
 * Writes a step's own rows, beyond the version and submission rows every step writes, and returns
 * their changes for the step's audit entry. `draft` is the version as it was read when the step
 * locked it, before any change. `version` is the version after the step updated it.
 */
export type IndicatorStepWrite = (
  tx: Transaction,
  submission: Submission,
  draft: IndicatorDraftVersion,
  version: SteppedVersion,
) => Promise<AuditChanges>;

/**
 * The step to take, or a function that chooses it from the draft version and its latest
 * submission as they are read under the lock. Submitting uses a function, so that a draft sent
 * back for changes is resubmitted rather than submitted.
 */
export type IndicatorStepChoice =
  | IndicatorStep
  | ((latest: Submission | undefined, draft: IndicatorDraftVersion) => IndicatorStep);

const STEP_ACTIONS: Readonly<Record<IndicatorStep, AuditAction>> = {
  submit: 'indicator.submitted',
  withdraw: 'indicator.submission_withdrawn',
  send_update_to_imrg: 'indicator.update_sent_to_imrg',
  request_update_revisions: 'indicator.update_revisions_requested',
  approve_update: 'indicator.update_approved',
  assign_reviewers: 'indicator.reviewers_assigned',
  give_feedback: 'indicator.review_feedback_given',
  request_changes: 'indicator.changes_requested',
  approve: 'indicator.approved',
  resubmit: 'indicator.resubmitted',
  schedule: 'indicator.publication_scheduled',
  change_publication_date: 'indicator.publication_date_changed',
  publish: 'indicator.published',
};

interface SubmissionWrite {
  tx: Transaction;
  draft: IndicatorDraftVersion;
  latest: Submission | undefined;
  status: IndicatorSubmissionStatus;
  actor: Actor;
}

type SubmissionWriteResult = { before: Submission | null; after: Submission };

/**
 * Inserts the draft version's next submission, numbered one after the latest, for the submit and
 * resubmit steps. There is no row before, so it returns null as the row before.
 */
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

/**
 * Ends the latest submission with the step's status, recording who ended it and when. Withdrawal
 * and a reviewer's response end a submission this way.
 */
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

/**
 * Returns the latest submission unchanged, for a step that does not write to it, such as
 * scheduling or publication.
 */
async function keepLatestSubmission({ latest }: SubmissionWrite): Promise<SubmissionWriteResult> {
  if (latest === undefined) throw new Error('found no submission to keep');
  return { before: latest, after: latest };
}

/**
 * How each step writes its submission. Each returns the submission row before and after the
 * write, with null as the row before when the step inserts a new submission.
 */
const SUBMISSION_WRITES: Readonly<
  Record<IndicatorStep, (write: SubmissionWrite) => Promise<SubmissionWriteResult>>
> = {
  submit: insertNextSubmission,
  withdraw: endLatestSubmission,
  // The decision itself is the step's own write, which knows which decision was made.
  send_update_to_imrg: keepLatestSubmission,
  request_update_revisions: endLatestSubmission,
  approve_update: endLatestSubmission,
  // The first assignment moves the submission from 'submitted' to 'in_review'. Changing the
  // reviewers of a submission already in review leaves its row as it is.
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
  schedule: keepLatestSubmission,
  change_publication_date: keepLatestSubmission,
  publish: keepLatestSubmission,
};

/**
 * Chooses which reviewers of the latest submission move onto the new submission that a resubmit
 * step starts. It returns only the reviewers who may still review the indicator. The caller
 * supplies it because the rules for who may review live outside this package.
 */
export type ReviewersToCarry = (
  tx: Transaction,
  state: { indicatorId: string; latest: Submission; actor: Actor },
) => Promise<CarriedReviewer[]>;

/**
 * Extras for one kind of step. `precondition` can refuse the step with a reason, after the
 * workflow allows the step and before anything is written. `write` adds the step's own rows in the
 * same transaction. `reviewersToCarry` must be given for a step that carries reviewers, such as
 * resubmit, and chooses which of the latest submission's reviewers move onto the new one.
 * `alreadyTaken` is asked only when the workflow does not allow the step. When it answers true,
 * the step succeeds as `repeated` and writes nothing, so a double click or a retry gets the answer
 * the first request got rather than `not_allowed`.
 */
export interface IndicatorStepOptions<Reason extends string> {
  precondition?: IndicatorStepPrecondition<Reason>;
  alreadyTaken?: IndicatorStepAlreadyTaken;
  write?: IndicatorStepWrite;
  reviewersToCarry?: ReviewersToCarry;
}

/**
 * The reviewers that `step` carries onto the submission it starts. There are none when the step
 * does not carry reviewers or when the draft has no earlier submission. Throws when a step that
 * carries reviewers was given no `reviewersToCarry`.
 */
async function reviewersCarriedBy(
  tx: Transaction,
  step: IndicatorStep,
  context: IndicatorWorkflowContext,
  state: { indicatorId: string; latest: Submission | undefined; actor: Actor },
  reviewersToCarry: ReviewersToCarry | undefined,
): Promise<CarriedReviewer[]> {
  if (!carriesReviewers(step, context.indicatorStatus)) return [];
  if (reviewersToCarry === undefined) throw new Error(`${step} was given no reviewersToCarry`);
  const { latest } = state;
  return latest === undefined ? [] : reviewersToCarry(tx, { ...state, latest });
}

/**
 * Takes a workflow step on the indicator's draft version in one transaction. The version's status
 * and `is_locked` flag, its submission, any rows that `write` adds and the audit entry are all
 * written together or not at all. A step that changes nothing records no audit entry.
 * A step is not an edit, so the version's `updated_at` and `updated_by` keep the values the last
 * edit gave them.
 */
export function takeIndicatorStep<Reason extends string = never>(
  db: Database,
  indicatorId: string,
  choice: IndicatorStepChoice,
  actor: Actor,
  options: IndicatorStepOptions<Reason> = {},
): Promise<IndicatorStepResult<Reason>> {
  return db.transaction((tx) => takeIndicatorStepIn(tx, indicatorId, choice, actor, options));
}

/**
 * Takes a workflow step as `takeIndicatorStep` does, but inside a transaction the caller has
 * already opened. Use it when the caller has picked the indicator and locked its version earlier
 * in that transaction, as scheduled publication does. The step then commits or rolls back with the
 * caller's other writes. When the step is refused, it returns the reason and writes nothing.
 */
export async function takeIndicatorStepIn<Reason extends string = never>(
  tx: Transaction,
  indicatorId: string,
  choice: IndicatorStepChoice,
  actor: Actor,
  { precondition, write, reviewersToCarry, alreadyTaken }: IndicatorStepOptions<Reason> = {},
): Promise<IndicatorStepResult<Reason>> {
  // Locks the draft version's row FOR NO KEY UPDATE. An upload being loaded inserts an
  // upload_batch row that references this row, and that foreign key takes FOR KEY SHARE on it.
  // The two locks don't conflict, so the step does not wait for the upload.
  // When an upload's file fails validation, the upload locks this row FOR SHARE until it commits,
  // and the step waits for it. That upload never updates this row, so the wait cannot deadlock.
  const [draft] = await tx
    .select()
    .from(indicatorVersion)
    .where(
      and(eq(indicatorVersion.indicatorId, indicatorId), isUnpublished(indicatorVersion.status)),
    )
    .for('no key update');

  if (draft === undefined) return { ok: false, reason: 'no_draft' };

  const [latest] = await tx
    .select()
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, draft.id))
    .orderBy(desc(indicatorVersionSubmission.number))
    .limit(1);
  const step = typeof choice === 'function' ? choice(latest, draft) : choice;
  const context: IndicatorWorkflowContext = {
    indicatorStatus: (await isPublished(tx, indicatorId)) ? 'live' : 'new',
    versionStatus: draft.status,
    isLocked: draft.isLocked,
    latestSubmissionStatus: latest?.status ?? null,
    latestUpdateDecision: latest?.updateDecision ?? null,
  };

  if (!allowedSteps(context).includes(step)) {
    return alreadyTaken?.({ draft, latest })
      ? { ok: true, repeated: true }
      : { ok: false, reason: 'not_allowed' };
  }

  const carried = await reviewersCarriedBy(
    tx,
    step,
    context,
    { indicatorId, latest, actor },
    reviewersToCarry,
  );
  const next = nextState(context, step, { carriedReviewerCount: carried.length });

  if (!next.ok) return next;

  const refusal = await precondition?.(tx, {
    draft,
    latest,
    indicatorStatus: context.indicatorStatus,
  });
  if (refusal !== undefined) return { ok: false, reason: refusal };

  // `indicator_version_published_at_check` requires `published_at` to be set exactly when the
  // status is 'published'. Postgres checks it on every UPDATE, so the status and the publication
  // time must change in this one statement.
  const [version] = await tx
    .update(indicatorVersion)
    .set({
      status: next.state.versionStatus,
      isLocked: next.state.isLocked,
      ...(next.state.versionStatus === 'published' && { publishedAt: sql`clock_timestamp()` }),
    })
    .where(eq(indicatorVersion.id, draft.id))
    .returning({
      status: indicatorVersion.status,
      isLocked: indicatorVersion.isLocked,
      publishedAt: indicatorVersion.publishedAt,
    });
  if (version === undefined) throw new Error(`${step} locked draft ${draft.id} but updated no row`);

  const submission = await SUBMISSION_WRITES[step]({
    tx,
    draft,
    latest,
    status: next.state.submissionStatus,
    actor,
  });
  const reviewersCarried = await carryReviewers(tx, submission.after.id, carried);
  const written = (await write?.(tx, submission.after, draft, version)) ?? {};
  const changes = {
    ...changesBetween(
      { status: draft.status, isLocked: draft.isLocked, publishedAt: draft.publishedAt },
      version,
    ),
    ...(isDeepStrictEqual(submission.before, submission.after) ? {} : { submission }),
    ...reviewersCarried,
    ...written,
  };

  if (Object.keys(changes).length > 0) {
    await recordAudit(tx, actor, [{ action: STEP_ACTIONS[step], entityId: indicatorId, changes }]);
  }

  return { ok: true };
}
