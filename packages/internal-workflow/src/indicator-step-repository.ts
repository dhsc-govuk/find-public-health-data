import { isDeepStrictEqual } from 'node:util';

import { type Database, schema } from '@fphd/db';
import {
  type Actor,
  type AuditAction,
  type AuditChanges,
  changesBetween,
  recordAudit,
} from '@fphd/db/audit-log';
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

/** The step to take, chosen by where the draft and its latest submission stand under the lock. */
export type IndicatorStepChoice =
  | IndicatorStep
  | ((latest: Submission | undefined, draft: IndicatorDraftVersion) => IndicatorStep);

const STEP_ACTIONS: Readonly<Record<IndicatorStep, AuditAction>> = {
  submit: 'indicator.submitted',
  withdraw: 'indicator.submission_withdrawn',
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

/** Answers the latest submission as it stands, for a step that leaves it alone. */
async function keepLatestSubmission({ latest }: SubmissionWrite): Promise<SubmissionWriteResult> {
  if (latest === undefined) throw new Error('found no submission to keep');
  return { before: latest, after: latest };
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
  schedule: keepLatestSubmission,
  change_publication_date: keepLatestSubmission,
  publish: keepLatestSubmission,
};

/**
 * The reviewers of the latest submission who may still review the indicator, to carry onto the
 * submission a step starts.
 */
export type ReviewersToCarry = (
  tx: Transaction,
  state: { indicatorId: string; latest: Submission; actor: Actor },
) => Promise<CarriedReviewer[]>;

/**
 * Extras for one kind of step. `precondition` can refuse the step with a reason, after the
 * workflow allows the step and before anything is written. `write` adds the step's own rows in the
 * same transaction. `reviewersToCarry` is required by a step that starts a new submission after an
 * earlier one, and chooses which of the earlier submission's reviewers move onto the new one.
 */
export interface IndicatorStepOptions<Reason extends string> {
  precondition?: IndicatorStepPrecondition<Reason>;
  write?: IndicatorStepWrite;
  reviewersToCarry?: ReviewersToCarry;
}

/** The reviewers `step` carries over: none unless it starts a submission after an earlier one. */
async function reviewersCarriedBy(
  tx: Transaction,
  step: IndicatorStep,
  state: { indicatorId: string; latest: Submission | undefined; actor: Actor },
  reviewersToCarry: ReviewersToCarry | undefined,
): Promise<CarriedReviewer[]> {
  if (!carriesReviewers(step)) return [];
  if (reviewersToCarry === undefined) throw new Error(`${step} was given no reviewersToCarry`);
  const { latest } = state;
  return latest === undefined ? [] : reviewersToCarry(tx, { ...state, latest });
}

/**
 * Takes a workflow step on the indicator's draft in one transaction: the version's lock, its
 * submission, the step's own rows that `write` adds and the audit entry are written together or
 * not at all. A step that changes nothing records nothing. A step is not an edit, so the version's
 * `updated_at` and `updated_by` stay as the last edit left them.
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
  { precondition, write, reviewersToCarry }: IndicatorStepOptions<Reason> = {},
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
  };

  if (!allowedSteps(context).includes(step)) return { ok: false, reason: 'not_allowed' };

  const carried = await reviewersCarriedBy(
    tx,
    step,
    { indicatorId, latest, actor },
    reviewersToCarry,
  );
  const next = nextState(context, step, { carriedReviewerCount: carried.length });

  if (!next.ok) return next;

  const refusal = await precondition?.(tx, { draft, latest });
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
