import { z } from '@fphd/config/zod';

import { editVersionSchema } from './edit-version-contract.ts';
import { longText } from './text-contract.ts';

export const reviewerNoteIdSchema = z.uuid();

/** The text of a reviewer's note, which may not be empty. */
export const reviewerNoteTextSchema = longText('Notes').min(1, 'Enter your notes');

/** A note's text as the form and the API check it, with its errors keyed `text`. */
export const reviewerNoteTextFormSchema = z.object({ text: reviewerNoteTextSchema });

/** One of the user's own notes, with the version an edit form sends back. */
export const reviewerNoteSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  version: editVersionSchema,
});

/** The user's own notes on an indicator, newest first. */
export const reviewerNotesSchema = z.object({ notes: z.array(reviewerNoteSchema) });

/** The body that adds a note, before its text is checked. */
export const reviewerNoteAddBodySchema = z.object({ text: z.string() });

/** The body that edits a note, before its text is checked: the text and the version shown. */
export const reviewerNoteUpdateBodySchema = z.object({
  text: z.string(),
  version: editVersionSchema,
});

/** The fields a note's field errors name. */
export const reviewerNoteFieldSchema = z.enum(['text']);

export const reviewerNoteErrorSchema = z.discriminatedUnion('error', [
  z.object({ error: z.enum(['invalid_id', 'invalid_request', 'not_a_reviewer']) }),
  z.object({
    error: z.literal('validation_failed'),
    fieldErrors: z.object({ text: z.string().optional() }),
  }),
  z.object({ error: z.literal('changed'), version: editVersionSchema }),
]);

export type ReviewerNote = z.infer<typeof reviewerNoteSchema>;
export type ReviewerNotes = z.infer<typeof reviewerNotesSchema>;
export type ReviewerNoteError = z.infer<typeof reviewerNoteErrorSchema>;
