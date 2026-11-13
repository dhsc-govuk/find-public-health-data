import { z } from '@fphd/config/zod';
import type { IndicatorStep } from '@fphd/utils/indicator-step';
import { UPDATE_DECISIONS } from '@fphd/utils/update-decision';

import {
  flaggableTaskKeySchema,
  type ReviewResponseBody,
  reviewResponseFieldErrorsSchema,
} from './review-response-contract.ts';

/** The steps the core team's decision on a submitted update takes, one of which it offers. */
export const UPDATE_DECISION_STEPS: readonly IndicatorStep[] = [
  'send_update_to_imrg',
  'request_update_revisions',
  'approve_update',
];

/** "What should happen to this update?": one of the four decisions. */
export const updateDecisionChoiceSchema = z.object({
  updateDecision: z.enum(UPDATE_DECISIONS, { error: 'Select what should happen to this update' }),
});

const submissionNumberSchema = z.number().int().positive();

/**
 * The decision as the pages send it, naming the submission the core team member was shown. A
 * request for revisions carries the flags and clarification request of the revisions page, and
 * flags no task twice. The pages never send otherwise, so the API refuses one that does as
 * malformed rather than naming a field.
 */
export const updateDecisionBodySchema = z.discriminatedUnion('decision', [
  z.object({
    submissionNumber: submissionNumberSchema,
    decision: z.enum(['imrg_review', 'publish_with_history', 'publish_without_history']),
  }),
  z.object({
    submissionNumber: submissionNumberSchema,
    decision: z.literal('request_revisions'),
    clarificationRequest: z.string().nullable(),
    flags: z
      .array(z.object({ task: flaggableTaskKeySchema, notes: z.string() }))
      .refine(
        (flags) => new Set(flags.map(({ task }) => task)).size === flags.length,
        'A task is flagged once',
      ),
  }),
]);

export type UpdateDecisionBody = z.infer<typeof updateDecisionBodySchema>;

/**
 * A request for revisions as a reviewer's feedback before IMRG review, whose field rules it
 * shares: what the revisions page asks for is the same whoever sends it.
 */
export function revisionsAsFeedback(
  body: Extract<UpdateDecisionBody, { decision: 'request_revisions' }>,
): ReviewResponseBody {
  return {
    submissionNumber: body.submissionNumber,
    kind: 'pre_imrg_feedback',
    imrgReviewedOn: null,
    clarificationRequest: body.clarificationRequest,
    flags: body.flags,
  };
}

/**
 * The 400 and 409 answers. `validation_failed` names the revisions page's fields at fault.
 * `not_allowed` means the update no longer waits for a decision, and `changed` that its latest
 * submission is not the one the core team member was shown. A missing indicator or draft is a
 * 404, which the client throws.
 */
export const updateDecisionErrorSchema = z.discriminatedUnion('error', [
  z.object({ error: z.enum(['invalid_id', 'invalid_request', 'not_allowed', 'changed']) }),
  z.object({
    error: z.literal('validation_failed'),
    fieldErrors: reviewResponseFieldErrorsSchema,
  }),
]);

export type UpdateDecisionChoice = z.infer<typeof updateDecisionChoiceSchema>;
export type UpdateDecisionError = z.infer<typeof updateDecisionErrorSchema>;
