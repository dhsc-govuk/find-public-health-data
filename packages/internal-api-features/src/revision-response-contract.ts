import { z } from '@fphd/config/zod';

import { editVersionSchema } from './edit-version-contract.ts';
import { reviewResponseKindSchema } from './review-response-contract.ts';
import { longText } from './text-contract.ts';

/** The kinds of response that send a draft back to the publisher for changes. */
export const revisionKindSchema = reviewResponseKindSchema.exclude(['approved']);

/**
 * The publisher's reply to the round of review that sent the draft back, with what the round
 * asked for and the version of the reply a save sends back.
 */
export const revisionResponseSchema = z.object({
  kind: revisionKindSchema,
  clarificationRequest: z.string().nullable(),
  /** How many tasks the round flagged, cleared or not, which the reply's wording follows. */
  flaggedTaskCount: z.number().int().min(0),
  revisionResponse: z.string().nullable(),
  version: editVersionSchema,
});

export type RevisionResponse = z.infer<typeof revisionResponseSchema>;

/** What a round asked for, which decides how an empty reply is refused. */
export type RevisionRequest = Pick<
  RevisionResponse,
  'kind' | 'clarificationRequest' | 'flaggedTaskCount'
>;

/** Why an empty reply is refused, naming what the round asked for, as the prototype words it. */
export function revisionResponseRequired({
  kind,
  clarificationRequest,
  flaggedTaskCount,
}: RevisionRequest): string {
  const revisions = kind === 'pre_imrg_feedback' ? 'advised revisions' : 'requested revisions';

  if (clarificationRequest === null) return `Enter your response to the ${revisions}`;
  if (flaggedTaskCount === 0) return 'Enter your response to the clarification request';
  return `Enter your response to the ${revisions} and clarification request`;
}

/** The reply as the page and the API check it, with its errors keyed `revisionResponse`. */
export function revisionResponseFormSchemaFor(request: RevisionRequest) {
  return z.object({
    revisionResponse: longText('Your response').min(1, revisionResponseRequired(request)),
  });
}

/** The body that saves a reply, before its text is checked: the text and the version shown. */
export const revisionResponseSaveBodySchema = z.object({
  revisionResponse: z.string(),
  version: editVersionSchema,
});

export const revisionResponseFieldSchema = z.enum(['revisionResponse']);

/**
 * The 400 and 409 answers. `locked` means the draft is in review; `not_allowed` that no round
 * has sent it back; `changed` that someone wrote the reply since the page was shown, with its
 * current version. A missing indicator or draft is a 404, which the client throws.
 */
export const revisionResponseErrorSchema = z.discriminatedUnion('error', [
  z.object({ error: z.enum(['invalid_id', 'invalid_request', 'locked', 'not_allowed']) }),
  z.object({
    error: z.literal('validation_failed'),
    fieldErrors: z.object({ revisionResponse: z.string().optional() }),
  }),
  z.object({ error: z.literal('changed'), version: editVersionSchema }),
]);

export type RevisionResponseSave = z.infer<typeof revisionResponseSaveBodySchema>;
export type RevisionResponseError = z.infer<typeof revisionResponseErrorSchema>;
