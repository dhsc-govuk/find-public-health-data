import { z } from '@fphd/config/zod';
import { justificationsSection } from './indicator-justifications-contract.ts';
import { otherCommentsSection } from './indicator-other-comments-contract.ts';
import { indicatorSectionAnswersSchema } from './indicator-section-contract.ts';
import { varianceAndQualitySection } from './indicator-variance-and-quality-contract.ts';

/**
 * The answers to the sections written for an indicator's reviewers, from its draft or, with no
 * draft, its published version, as a section GET gives them.
 */
export const notesForReviewersSchema = z.object({
  varianceAndQuality: indicatorSectionAnswersSchema(varianceAndQualitySection.fields),
  justifications: indicatorSectionAnswersSchema(justificationsSection.fields),
  otherComments: indicatorSectionAnswersSchema(otherCommentsSection.fields),
});

export type NotesForReviewers = z.infer<typeof notesForReviewersSchema>;
