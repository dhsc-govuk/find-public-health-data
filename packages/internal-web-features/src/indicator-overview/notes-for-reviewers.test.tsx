// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ANSWERED_NOTES, UNANSWERED_NOTES } from './notes-for-reviewers.testing.ts';
import { NotesForReviewers } from './notes-for-reviewers.tsx';

afterEach(cleanup);

/** Each row of each summary list, as its question and its answer. */
function rows(): [string, string][] {
  return [...document.querySelectorAll('.govuk-summary-list__row')].map((row) => [
    row.querySelector('dt')?.textContent ?? '',
    row.querySelector('dd')?.textContent ?? '',
  ]);
}

describe('NotesForReviewers', () => {
  it("heads each of the publisher's sections under the tab's heading", () => {
    render(<NotesForReviewers notes={ANSWERED_NOTES} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Notes for reviewers' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Variance and quality',
      'Justifications',
      'Other comments',
    ]);
  });

  it('shows each answer against its question, with the detail a yes gives', () => {
    render(<NotesForReviewers notes={ANSWERED_NOTES} />);

    expect(rows()).toEqual([
      ['How does the indicator vary?', 'Little.\nMostly by region.'],
      ['What quality assurance has been done on the indicator?', 'Checked.'],
      ['Are there any data quality issues with the source data?', 'Yes - Late returns.'],
      ['Why was the confidence interval method chosen?', 'Standard.'],
      ['Why were the data sources chosen?', 'The best available.'],
      ['What health inequalities have been included?', 'Deprivation.'],
      ['Have there been any exclusions?', 'No'],
      ['Have internal automation tools been used to create this indicator?', 'Yes - R scripts.'],
      ['Sponsors or stakeholders', 'OHID.'],
      ['Other comments', 'Please look at 2020.'],
    ]);
  });

  it('keeps the line breaks the publisher typed', () => {
    render(<NotesForReviewers notes={ANSWERED_NOTES} />);

    expect(screen.getByText(/Mostly by region/).className).toBe('fphd-metadata-text');
  });

  it('says what is not provided', () => {
    render(<NotesForReviewers notes={UNANSWERED_NOTES} />);

    expect(new Set(rows().map(([, answer]) => answer))).toEqual(new Set(['Not provided']));
  });

  it.each([
    ['empty', ''],
    ['missing', null],
  ])('shows a yes with its detail %s as Yes', (_, detail) => {
    render(
      <NotesForReviewers
        notes={{
          ...ANSWERED_NOTES,
          justifications: {
            ...ANSWERED_NOTES.justifications,
            hasExclusions: 'yes',
            exclusionsDetail: detail,
          },
        }}
      />,
    );

    expect(rows()).toContainEqual(['Have there been any exclusions?', 'Yes']);
  });

  it('says there are no other comments when the publisher answered no', () => {
    render(
      <NotesForReviewers
        notes={{
          ...UNANSWERED_NOTES,
          otherComments: { ...UNANSWERED_NOTES.otherComments, hasReviewerComments: 'no' },
        }}
      />,
    );

    expect(rows().at(-1)).toEqual(['Other comments', 'None']);
  });
});
