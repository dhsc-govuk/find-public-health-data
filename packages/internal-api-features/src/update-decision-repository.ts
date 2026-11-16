import { type Database, schema } from '@fphd/db';
import { type Actor, changesBetween } from '@fphd/db/audit-log';
import {
  type IndicatorStepResult,
  type IndicatorStepWrite,
  takeIndicatorStep,
} from '@fphd/internal-workflow';
import type { UpdateDecision } from '@fphd/utils/update-decision';
import { eq, sql } from 'drizzle-orm';

import type { IndicatorStep, UpdateDecisionBody } from './contract.ts';
import { insertResponse } from './review-response-repository.ts';

const { indicatorVersionSubmission } = schema;

export type DecideUpdateResult = IndicatorStepResult<'changed'>;

/** The workflow step each decision takes. Both publish decisions approve the update. */
const DECISION_STEPS: Readonly<Record<UpdateDecision, IndicatorStep>> = {
  imrg_review: 'send_update_to_imrg',
  request_revisions: 'request_update_revisions',
  publish_with_history: 'approve_update',
  publish_without_history: 'approve_update',
};

/**
 * The write that records the decision on the submission, with who made it and when. Revisions
 * also insert the core team's response, with its flags, which sends the update back as a
 * reviewer's feedback before IMRG review does.
 */
function decisionWrite(request: UpdateDecisionBody, actor: Actor): IndicatorStepWrite {
  return async (tx, submission) => {
    const [decided] = await tx
      .update(indicatorVersionSubmission)
      .set({
        updateDecision: request.decision,
        updateDecidedBy: actor.userId,
        updateDecidedAt: sql`clock_timestamp()`,
      })
      .where(eq(indicatorVersionSubmission.id, submission.id))
      .returning({
        updateDecision: indicatorVersionSubmission.updateDecision,
        updateDecidedBy: indicatorVersionSubmission.updateDecidedBy,
        updateDecidedAt: indicatorVersionSubmission.updateDecidedAt,
      });
    if (decided === undefined) throw new Error(`recorded no decision on ${submission.id}`);

    const response =
      request.decision === 'request_revisions'
        ? await insertResponse(
            tx,
            submission.id,
            {
              kind: 'pre_imrg_feedback',
              imrgReviewedOn: null,
              clarificationRequest: request.clarificationRequest,
              flags: request.flags,
            },
            { coreTeamMemberId: actor.userId },
          )
        : {};

    return {
      ...changesBetween(
        { updateDecision: null, updateDecidedBy: null, updateDecidedAt: null },
        decided,
      ),
      ...response,
    };
  };
}

/**
 * Records the core team's decision on the update's latest submission, which the workflow allows
 * once, while the submission waits for it. IMRG review leaves the submission waiting for
 * reviewers, revisions send the update back to the publisher, and either publish decision
 * approves it, ready for its publication date to be confirmed. Refused as `changed` when the
 * submission is not the one the core team member was shown.
 */
export function decideUpdate(
  db: Database,
  indicatorId: string,
  request: UpdateDecisionBody,
  actor: Actor,
): Promise<DecideUpdateResult> {
  return takeIndicatorStep(db, indicatorId, DECISION_STEPS[request.decision], actor, {
    precondition: async (_tx, { latest }) =>
      latest?.number === request.submissionNumber ? undefined : 'changed',
    write: decisionWrite(request, actor),
  });
}
