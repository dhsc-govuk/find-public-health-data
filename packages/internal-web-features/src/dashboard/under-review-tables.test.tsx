// @vitest-environment jsdom
import { TEAM_IDS } from '@fphd/auth';
import type { IndicatorAdminListItem } from '@fphd/internal-api-features/contract';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { ReviewTable, UnderReviewTables } from './under-review-tables.tsx';

afterEach(cleanup);

const submitted: IndicatorAdminListItem = {
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b',
  name: 'Life expectancy at birth',
  teamId: TEAM_IDS.teamA,
  teamName: 'Team A',
  createdBy: 'Sam Taylor',
  updatedAt: '2026-08-04T23:30:00.000Z',
  lastEditedBy: 'Casey Patel',
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: true,
  draftSubmissionStatus: 'submitted',
  draftReviewers: [],
};

const inReview: IndicatorAdminListItem = {
  ...submitted,
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5c',
  name: 'Smoking prevalence',
  draftSubmissionStatus: 'in_review',
  draftReviewers: [
    { id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4aa1', name: 'Jamie Evans' },
    { id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4aa2', name: 'Morgan Hughes' },
  ],
};

// The indicator links read router state.
function renderTables(unassigned = [submitted], assigned = [inReview]) {
  return render(
    <MemoryRouter>
      <UnderReviewTables unassigned={unassigned} assigned={assigned} />
    </MemoryRouter>,
  );
}

function headingsOf(name: string) {
  const headings = screen.getByRole('table', { name }).querySelectorAll('th[scope="col"]');
  return [...headings].map((heading) => heading.textContent);
}

function cellsOf(indicatorName: string) {
  const row = screen.getByRole('rowheader', { name: indicatorName }).closest('tr');
  return [...(row?.querySelectorAll('td') ?? [])];
}

describe('UnderReviewTables', () => {
  it('lists the unassigned indicators with the dashboard columns', () => {
    renderTables();

    expect(screen.getByRole('heading', { level: 2, name: 'Unassigned indicators' })).toBeTruthy();
    expect(headingsOf('Unassigned indicators, oldest submission first')).toEqual([
      'Indicator name',
      'Team',
      'Created by',
      'Last edited',
      'Last edited by',
      'Indicator status',
      'Publishing status',
    ]);
    expect(cellsOf('Life expectancy at birth').map((cell) => cell.textContent)).toEqual([
      'Team A',
      'Sam Taylor',
      '5 Aug 2026',
      'Casey Patel',
      'New',
      'Pending approval',
    ]);
  });

  it('lists the assigned indicators with their reviewers after the name', () => {
    renderTables();

    expect(screen.getByRole('heading', { level: 2, name: 'Assigned indicators' })).toBeTruthy();
    expect(headingsOf('Assigned indicators, oldest submission first')).toEqual([
      'Indicator name',
      'Assigned reviewers',
      'Team',
      'Created by',
      'Last edited',
      'Last edited by',
      'Indicator status',
      'Publishing status',
    ]);

    const [reviewers, ...rest] = cellsOf('Smoking prevalence');

    expect(
      [...(reviewers?.querySelectorAll('li') ?? [])].map((reviewer) => reviewer.textContent),
    ).toEqual(['Jamie Evans', 'Morgan Hughes']);
    expect(rest.at(-1)?.textContent).toBe('Pending approval');
  });

  it('links each indicator to its overview, where its reviewers are assigned', () => {
    renderTables();

    expect(
      screen.getByRole('link', { name: 'Life expectancy at birth' }).getAttribute('href'),
    ).toBe(`/dashboard/indicators/${submitted.id}`);
    expect(screen.getByRole('link', { name: 'Smoking prevalence' }).getAttribute('href')).toBe(
      `/dashboard/indicators/${inReview.id}`,
    );
  });

  it('says so when no indicator waits for reviewers or is in review', () => {
    renderTables([], []);

    expect(screen.getByText('No unassigned indicators')).toBeTruthy();
    expect(screen.getByText('No assigned indicators')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('ReviewTable', () => {
  function renderReviewTable(indicators: IndicatorAdminListItem[]) {
    return render(
      <MemoryRouter>
        <ReviewTable indicators={indicators} />
      </MemoryRouter>,
    );
  }

  it("lists the reviewer's indicators with the Assigned indicators table's columns", () => {
    renderReviewTable([inReview]);

    expect(headingsOf('Indicators to review, oldest submission first')).toEqual([
      'Indicator name',
      'Assigned reviewers',
      'Team',
      'Created by',
      'Last edited',
      'Last edited by',
      'Indicator status',
      'Publishing status',
    ]);

    const [reviewers, ...rest] = cellsOf('Smoking prevalence');

    expect(
      [...(reviewers?.querySelectorAll('li') ?? [])].map((reviewer) => reviewer.textContent),
    ).toEqual(['Jamie Evans', 'Morgan Hughes']);
    expect(rest.map((cell) => cell.textContent)).toEqual([
      'Team A',
      'Sam Taylor',
      '5 Aug 2026',
      'Casey Patel',
      'New',
      'Pending approval',
    ]);
    expect(screen.getByRole('link', { name: 'Smoking prevalence' }).getAttribute('href')).toBe(
      `/dashboard/indicators/${inReview.id}`,
    );
  });

  it('says so when no indicator is assigned', () => {
    renderReviewTable([]);

    expect(screen.getByText('No assigned indicators under review')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
