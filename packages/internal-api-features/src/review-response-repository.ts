import { type Database, schema } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import {
  type IndicatorStepResult,
  type IndicatorStepWrite,
  takeIndicatorStep,
} from '@fphd/internal-workflow';
import type { FlaggableTaskKey } from '@fphd/utils/indicator-task-key';
import type { ReviewResponseKind } from '@fphd/utils/review-response-kind';
import { and, eq, sql } from 'drizzle-orm';

import type { IndicatorStep } from './contract.ts';
import type { Transaction } from './indicator-repository-sql.ts';
import { assignedReviewerIds } from './reviewer-repository.ts';

const {
  indicatorVersionSubmission,
  indicatorVersionSubmissionFlag,
  indicatorVersionSubmissionResponse,
} = schema;

/** A reviewer's response, naming the submission they were shown. */
export interface ReviewResponse {
  submissionNumber: number;
  kind: ReviewResponseKind;
  /** The IMRG meeting's date, `YYYY-MM-DD`; null for feedback before it. */
  imrgReviewedOn: string | null;
  clarificationRequest: string | null;
  flags: readonly { task: FlaggableTaskKey; notes: string }[];
}

export type RespondToReviewResult = IndicatorStepResult<
  'changed' | 'not_a_reviewer' | 'reviewed_before_submission' | 'no_publication_date'
>;

const RESPONSE_STEPS: Readonly<Record<ReviewResponseKind, IndicatorStep>> = {
  pre_imrg_feedback: 'give_feedback',
  minor_revisions: 'request_changes',
  major_revisions: 'request_changes',
  approved: 'approve',
};

/** The UK date of the version's first submission, `YYYY-MM-DD`. */
async function firstSubmittedOn(tx: Transaction, versionId: string): Promise<string | undefined> {
  const [first] = await tx
    .select({
      on: sql<string>`to_char(${indicatorVersionSubmission.submittedAt} at time zone 'Europe/London', 'YYYY-MM-DD')`,
    })
    .from(indicatorVersionSubmission)
    .where(
      and(
        eq(indicatorVersionSubmission.indicatorVersionId, versionId),
        eq(indicatorVersionSubmission.number, 1),
      ),
    );
  return first?.on;
}

/** The write that inserts the response and its flags as the actor's, answering them for the audit. */
export function responseWrite(response: ReviewResponse, actor: Actor): IndicatorStepWrite {
  return async (tx, submission) => {
    const [row] = await tx
      .insert(indicatorVersionSubmissionResponse)
      .values({
        submissionId: submission.id,
        reviewerId: actor.userId,
        kind: response.kind,
        imrgReviewedOn: response.imrgReviewedOn,
        clarificationRequest: response.clarificationRequest,
      })
      .returning();
    if (row === undefined) throw new Error(`inserted no response to ${submission.id}`);
    const flags =
      response.flags.length === 0
        ? []
        : await tx
            .insert(indicatorVersionSubmissionFlag)
            .values(
              response.flags.map(({ task, notes }) => ({
                responseId: row.id,
                taskKey: task,
                notes,
              })),
            )
            .returning({
              taskKey: indicatorVersionSubmissionFlag.taskKey,
              notes: indicatorVersionSubmissionFlag.notes,
            });
    return { response: { before: null, after: { ...row, flags } } };
  };
}

/**
 * Records an assigned reviewer's response to the draft's latest submission, which ends it:
 * feedback and revisions send the draft back to the publisher, and an approval keeps it locked
 * for publication on its date. Refused as `changed` when the submission is not the one the
 * reviewer was shown, `not_a_reviewer` when they are not assigned to it,
 * `reviewed_before_submission` for an IMRG date before the version was first submitted, and
 * `no_publication_date` for an approval of a draft with no date.
 */
export function respondToReview(
  db: Database,
  indicatorId: string,
  response: ReviewResponse,
  actor: Actor,
): Promise<RespondToReviewResult> {
  const step = RESPONSE_STEPS[response.kind];

  return takeIndicatorStep(db, indicatorId, step, actor, {
    precondition: async (tx, { draft, latest }) => {
      if (latest?.number !== response.submissionNumber) return 'changed';
      if (!(await assignedReviewerIds(tx, latest.id)).includes(actor.userId)) {
        return 'not_a_reviewer';
      }
      if (response.imrgReviewedOn !== null) {
        const firstOn = await firstSubmittedOn(tx, draft.id);
        if (firstOn !== undefined && response.imrgReviewedOn < firstOn) {
          return 'reviewed_before_submission';
        }
      }
      return step === 'approve' && draft.scheduledPublishAt === null
        ? 'no_publication_date'
        : undefined;
    },
    write: responseWrite(response, actor),
  });
}
