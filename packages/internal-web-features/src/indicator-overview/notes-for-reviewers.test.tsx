// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ANSWERED_NOTES, UNANSWERED_NOTES } from './notes-for-reviewers.testing.ts';
import { NotesForReviewers, unansweredText } from './notes-for-reviewers.tsx';

afterEach(cleanup);

const NEVER_SUBMITTED = { draftStatus: 'draft', draftSubmissionStatus: null } as const;
const IN_REVIEW = { draftStatus: 'draft', draftSubmissionStatus: 'in_review' } as const;

describe('unansweredText', () => {
  it('reads "[Not entered yet]" on a draft never submitted', () => {
    expect(unansweredText(NEVER_SUBMITTED)).toBe('[Not entered yet]');
  });

  it.each([
    ['waiting for reviewers', 'draft', 'submitted'],
    ['in review', 'draft', 'in_review'],
    ['withdrawn', 'draft', 'withdrawn'],
  ] as const)(
    'reads "Not provided" once submitted, %s',
    (_, draftStatus, draftSubmissionStatus) => {
      expect(unansweredText({ draftStatus, draftSubmissionStatus })).toBe('Not provided');
    },
  );

  it('reads "Not provided" on the published answers of an indicator with no draft', () => {
    expect(unansweredText({ draftStatus: null, draftSubmissionStatus: null })).toBe('Not provided');
  });
});

/** Each row of each summary list, as its question and its answer. */
function rows(): [string, string][] {
  return [...document.querySelectorAll('.govuk-summary-list__row')].map((row) => [
    row.querySelector('dt')?.textContent ?? '',
    row.querySelector('dd')?.textContent ?? '',
  ]);
}

describe('NotesForReviewers', () => {
  it("heads each of the publisher's sections under the tab's heading", () => {
    render(<NotesForReviewers notes={ANSWERED_NOTES} indicator={IN_REVIEW} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Notes for reviewers' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Variance and quality',
      'Justifications',
      'Other comments',
    ]);
  });

  it('shows each answer against its question, with the detail a yes gives', () => {
    render(<NotesForReviewers notes={ANSWERED_NOTES} indicator={IN_REVIEW} />);

    expect(rows()).toEqual([
      ['How does the indicator vary?', 'Little.\nMostly by region.'],
      ['What quality assurance has been done on the indicator?', 'Checked.'],
      [
        'If there are any data quality issues, what is being done to improve the quality?',
        'Chasing late returns.',
      ],
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
    render(<NotesForReviewers notes={ANSWERED_NOTES} indicator={IN_REVIEW} />);

    expect(screen.getByText(/Mostly by region/).className).toBe('fphd-metadata-text');
  });

  it.each([
    ['a draft never submitted', NEVER_SUBMITTED, '[Not entered yet]'],
    ['a submitted draft', IN_REVIEW, 'Not provided'],
  ] as const)('marks each unanswered question on %s', (_, indicator, text) => {
    render(<NotesForReviewers notes={UNANSWERED_NOTES} indicator={indicator} />);

    expect(new Set(rows().map(([, answer]) => answer))).toEqual(new Set([text]));
  });

  it.each([
    ['empty', ''],
    ['missing', null],
  ])('leaves out the data quality improvement notes when they are %s', (_, notes) => {
    render(
      <NotesForReviewers
        notes={{
          ...ANSWERED_NOTES,
          varianceAndQuality: {
            ...ANSWERED_NOTES.varianceAndQuality,
            sourceDataIssuesDetail: notes,
          },
        }}
        indicator={NEVER_SUBMITTED}
      />,
    );

    expect(rows().slice(0, 3)).toEqual([
      ['How does the indicator vary?', 'Little.\nMostly by region.'],
      ['What quality assurance has been done on the indicator?', 'Checked.'],
      ['Why was the confidence interval method chosen?', 'Standard.'],
    ]);
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
        indicator={IN_REVIEW}
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
        indicator={IN_REVIEW}
      />,
    );

    expect(rows().at(-1)).toEqual(['Other comments', 'None']);
  });
});
