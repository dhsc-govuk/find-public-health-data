import { z } from '@fphd/config/zod';
import { INDICATOR_TASK_KEYS } from '@fphd/utils/indicator-task-key';

import { flaggableTaskKeySchema, reviewResponseKindSchema } from './review-response-contract.ts';

const doneBy = { at: z.iso.datetime(), by: z.string() };

const flagSchema = z.object({ task: flaggableTaskKeySchema, notes: z.string() });

/**
 * One answer an update changed in a task, named by its field on the task's page, or the data
 * table it replaced.
 */
export const updateChangePartSchema = z.discriminatedUnion('kind', [
  // Free text, before and after, which the History tab shows as the words added and removed.
  z.object({ kind: z.literal('text'), field: z.string(), before: z.string(), after: z.string() }),
  // Any other answer, as its new value in words, or null where the update leaves none.
  z.object({ kind: z.literal('value'), field: z.string(), value: z.string().nullable() }),
  // A data table of the update's own, whose data values replace every one the live indicator has.
  z.object({ kind: z.literal('data_values_replaced'), count: z.number().int().min(0) }),
]);

/** What an update changed in one task, as it was when the update was submitted. */
export const updateChangeSchema = z.object({
  task: z.enum(INDICATOR_TASK_KEYS),
  parts: z.array(updateChangePartSchema),
});

/** One thing that happened to an indicator, as its History tab lists it. */
export const historyEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('created'), ...doneBy }),
  // A version is published by scheduled publication or by an import, never by a person, so this
  // entry names no one.
  z.object({ kind: z.literal('published'), at: z.iso.datetime(), by: z.null() }),
  z.object({ kind: z.literal('submitted'), ...doneBy }),
  z.object({ kind: z.literal('withdrawn'), ...doneBy }),
  // `isUpdate` is true for an entry about an update to the live indicator, which is worded as one.
  z.object({
    kind: z.literal('reviewers_assigned'),
    ...doneBy,
    reviewers: z.array(z.string()),
    isUpdate: z.boolean(),
  }),
  // The day of the IMRG meeting, which has no time.
  z.object({ kind: z.literal('imrg_reviewed'), on: z.iso.date(), by: z.string() }),
  z.object({
    kind: z.literal('responded'),
    ...doneBy,
    response: reviewResponseKindSchema,
    flags: z.array(flagSchema),
    clarificationRequest: z.string().nullable(),
    isUpdate: z.boolean(),
  }),
  z.object({
    kind: z.literal('resubmitted'),
    ...doneBy,
    flags: z.array(z.object({ task: flaggableTaskKeySchema, revised: z.boolean() })),
    reply: z.string().nullable(),
    isUpdate: z.boolean(),
  }),
  z.object({ kind: z.literal('publication_scheduled'), ...doneBy }),
  z.object({ kind: z.literal('publication_date_changed'), ...doneBy }),
  z.object({ kind: z.literal('update_started'), ...doneBy }),
  z.object({
    kind: z.literal('update_submitted'),
    ...doneBy,
    changes: z.array(updateChangeSchema),
  }),
  // The core team's decision to send an update to IMRG or to publish it without IMRG review.
  z.object({
    kind: z.literal('update_decided'),
    ...doneBy,
    decision: z.enum(['imrg_review', 'publish_with_history', 'publish_without_history']),
  }),
  // The core team's decision to send an update back, with what it asked to revise or clarify.
  z.object({
    kind: z.literal('update_revisions_requested'),
    ...doneBy,
    flags: z.array(flagSchema),
    clarificationRequest: z.string().nullable(),
  }),
]);

/** What has happened to an indicator, newest first. */
export const indicatorHistorySchema = z.object({ entries: z.array(historyEntrySchema) });

export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type UpdateChange = z.infer<typeof updateChangeSchema>;
export type UpdateChangePart = z.infer<typeof updateChangePartSchema>;
export type IndicatorHistory = z.infer<typeof indicatorHistorySchema>;
