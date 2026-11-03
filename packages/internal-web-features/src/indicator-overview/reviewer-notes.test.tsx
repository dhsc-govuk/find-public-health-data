// @vitest-environment jsdom
import { TEAM_IDS } from '@fphd/auth';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import type { IndicatorAdminDetail, ReviewerNote } from './loader.ts';
import { IndicatorOverviewPage } from './page.tsx';

afterEach(cleanup);

const indicator: IndicatorAdminDetail = {
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b',
  shortId: 90366,
  name: 'Life expectancy at birth',
  teamId: TEAM_IDS.teamA,
  publishedSlug: null,
  updatedAt: '2026-08-04T23:30:00.000Z',
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: false,
  draftSubmissionStatus: 'changes_requested',
  draftResponseKind: 'minor_revisions',
  draftReviewers: [],
  draftSubmissionNumber: 1,
  draftScheduledPublishAt: null,
  draftFirstSubmittedAt: '2026-11-02T09:00:00.000Z',
  nameVersion: SHOWN_VERSION,
  actions: [],
};

const notes: ReviewerNote[] = [
  {
    id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4ae2',
    text: 'Ask about 2019\nand the dip after',
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:15:00.000Z',
    version: SHOWN_VERSION,
  },
  {
    id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4ae1',
    text: 'Numerator looks right',
    createdAt: '2026-11-02T14:00:00.000Z',
    updatedAt: '2026-11-02T14:00:00.000Z',
    version: SHOWN_VERSION,
  },
];

function renderPage(props: { isReviewer?: boolean; reviewerNotes?: ReviewerNote[] | null }) {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/indicators/${indicator.id}`]}>
      <IndicatorOverviewPage canEdit={false} indicator={indicator} {...props} />
    </MemoryRouter>,
  );
}

function reviewSection(): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: 'Review' });
  if (heading.parentElement === null) throw new Error('the Review heading has no section');
  return heading.parentElement;
}

describe("the reviewer's notes", () => {
  it('lists them newest first under Your notes in the Review section, dated in UK time', () => {
    renderPage({ isReviewer: true, reviewerNotes: notes });

    const review = within(reviewSection());
    expect(review.getByRole('heading', { level: 3, name: 'Your notes' })).toBeTruthy();
    const rows = review
      .getAllByRole('row')
      .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['Date', 'Notes'],
      ['3 November 2026 at 10:15am', 'Ask about 2019\nand the dip after'],
      ['2 November 2026 at 2:00pm', 'Numerator looks right'],
    ]);
    const table = review.getByRole('table');
    expect(table.querySelector('.fphd-metadata-text')?.textContent).toBe(
      'Ask about 2019\nand the dip after',
    );
    expect(table.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-03T10:15:00.000Z');
  });

  it('shows the heading with no table while the reviewer has none', () => {
    renderPage({ isReviewer: true, reviewerNotes: [] });

    const review = within(reviewSection());
    expect(review.getByRole('heading', { level: 3, name: 'Your notes' })).toBeTruthy();
    expect(review.queryByRole('table')).toBeNull();
  });

  it('takes the place of the no-actions text once the reviewer has responded', () => {
    renderPage({ isReviewer: true, reviewerNotes: [] });

    expect(screen.queryByText('There are no actions available for this indicator yet.')).toBeNull();
  });

  it('shows nothing to someone who is not a reviewer', () => {
    renderPage({ reviewerNotes: null });

    expect(screen.queryByRole('heading', { name: 'Your notes' })).toBeNull();
  });
});
