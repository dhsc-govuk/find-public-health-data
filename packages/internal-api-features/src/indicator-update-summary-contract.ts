import { z } from '@fphd/config/zod';

import { type IndicatorSection, textSection } from './indicator-section-contract.ts';
import { longText } from './text-contract.ts';

const fields = z.enum(['updateSummary', 'updateSummaryForReviewers']);

export type UpdateSummaryField = z.infer<typeof fields>;

// Both are plain text: the summary is not read as Markdown.
const schema = z.object({
  updateSummary: longText('Update summary').min(1, 'Enter a summary of this update'),
  // Optional: the summary for the public may say all the reviewers need.
  updateSummaryForReviewers: longText('Additional summary information'),
});

export type UpdateSummary = z.infer<typeof schema>;

/** What an update to a live indicator changed, for the public history and for its reviewers. */
export const updateSummarySection: IndicatorSection<UpdateSummaryField, UpdateSummary> =
  textSection({ key: 'update-summary', fields, schema });
