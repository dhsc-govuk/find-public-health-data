import { z } from '@fphd/config/zod';

import { flaggableTaskKeySchema, reviewResponseKindSchema } from './review-response-contract.ts';

const doneBy = { at: z.iso.datetime(), by: z.string() };

/** One thing that happened to an indicator, as its History tab lists it. */
export const historyEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('created'), ...doneBy }),
  // Nothing records who published a version.
  z.object({ kind: z.literal('published'), at: z.iso.datetime(), by: z.null() }),
  z.object({ kind: z.literal('submitted'), ...doneBy }),
  z.object({ kind: z.literal('withdrawn'), ...doneBy }),
  z.object({
    kind: z.literal('reviewers_assigned'),
    ...doneBy,
    reviewers: z.array(z.string()),
  }),
  // The day of the IMRG meeting, which has no time.
  z.object({ kind: z.literal('imrg_reviewed'), on: z.iso.date(), by: z.string() }),
  z.object({
    kind: z.literal('responded'),
    ...doneBy,
    response: reviewResponseKindSchema,
    flags: z.array(z.object({ task: flaggableTaskKeySchema, notes: z.string() })),
    clarificationRequest: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('resubmitted'),
    ...doneBy,
    flags: z.array(z.object({ task: flaggableTaskKeySchema, revised: z.boolean() })),
    reply: z.string().nullable(),
  }),
]);

/** What has happened to an indicator, newest first. */
export const indicatorHistorySchema = z.object({ entries: z.array(historyEntrySchema) });

export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type IndicatorHistory = z.infer<typeof indicatorHistorySchema>;
