import { describe, expect, it } from 'vitest';

import { updateSummarySection as section } from './indicator-update-summary-contract.ts';
import { sectionFieldErrors } from './testing.ts';

describe('updateSummarySection', () => {
  it('takes both answers without their surrounding spaces', () => {
    expect(
      section.schema.parse({
        updateSummary: '  Added the 2024 data.\n',
        updateSummaryForReviewers: '\tThe 2023 values are unchanged.  ',
      }),
    ).toEqual({
      updateSummary: 'Added the 2024 data.',
      updateSummaryForReviewers: 'The 2023 values are unchanged.',
    });
  });

  it('takes a summary without information for the reviewers', () => {
    expect(
      section.schema.parse({
        updateSummary: 'Added the 2024 data.',
        updateSummaryForReviewers: '',
      }),
    ).toEqual({ updateSummary: 'Added the 2024 data.', updateSummaryForReviewers: '' });
  });

  it.each([
    { updateSummary: '', updateSummaryForReviewers: '' },
    { updateSummary: ' \n\t', updateSummaryForReviewers: 'More for the reviewers.' },
  ])('refuses %o, which has no summary', (body) => {
    expect(sectionFieldErrors(section, body)).toEqual({
      updateSummary: 'Enter a summary of this update',
    });
  });

  it.each([{}, { updateSummary: 'A summary' }, { updateSummary: 1, updateSummaryForReviewers: 2 }])(
    'refuses %o, which the form never sends',
    (body) => {
      expect(sectionFieldErrors(section, body)).toBeDefined();
    },
  );
});
