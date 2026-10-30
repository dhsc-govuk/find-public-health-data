// @vitest-environment jsdom
import { TEAM_IDS } from '@fphd/auth';
import type {
  IndicatorAdminListItem,
  IndicatorsUnderReview,
} from '@fphd/internal-api-features/contract';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { DashboardPage, type IndicatorList } from './page.tsx';

afterEach(cleanup);

const indicator: IndicatorAdminListItem = {
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b',
  name: 'Life expectancy at birth',
  teamId: TEAM_IDS.teamA,
  teamName: 'Team A',
  createdBy: 'Alex Morgan',
  updatedAt: '2026-08-04T23:30:00.000Z',
  lastEditedBy: 'Sam Taylor',
  indicatorStatus: 'live',
  draftStatus: null,
  draftLocked: false,
  draftSubmissionStatus: null,
  draftReviewers: [],
};

// The pagination links read router state, so the page renders inside a router at its own address.
function renderPage(
  list: Partial<IndicatorList> = {},
  url = '/dashboard',
  underReview: IndicatorsUnderReview | null = null,
  toReview: IndicatorAdminListItem[] | null = null,
) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DashboardPage
        underReview={underReview}
        toReview={toReview}
        list={{ canCreate: true, indicators: [indicator], page: 1, totalPages: 1, ...list }}
      />
    </MemoryRouter>,
  );
}

function renderManagerPage(underReview: IndicatorsUnderReview) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DashboardPage underReview={underReview} toReview={null} list={null} />
    </MemoryRouter>,
  );
}

function renderReviewerPage(toReview: IndicatorAdminListItem[]) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DashboardPage underReview={null} toReview={toReview} list={null} />
    </MemoryRouter>,
  );
}

const submitted: IndicatorAdminListItem = {
  ...indicator,
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5c',
  name: 'Smoking prevalence',
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: true,
  draftSubmissionStatus: 'submitted',
};

const inReview: IndicatorAdminListItem = {
  ...submitted,
  draftSubmissionStatus: 'in_review',
  draftReviewers: [{ id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4aa1', name: 'Jamie Evans' }],
};

describe('DashboardPage', () => {
  it('names the table for assistive technology, as there is no visible caption', () => {
    renderPage();

    expect(
      screen.getByRole('table', { name: 'Indicators, most recently edited first' }),
    ).toBeTruthy();
  });

  it('tags each indicator with its two statuses', () => {
    renderPage({ indicators: [{ ...indicator, draftStatus: 'draft' }] });

    const row = screen.getByRole('rowheader', { name: 'Life expectancy at birth' }).closest('tr');
    const tags = [...(row?.querySelectorAll('.govuk-tag') ?? [])].map((tag) => tag.textContent);

    expect(tags).toEqual(['Live', 'Update incomplete']);
  });

  it('tags a new indicator submitted for approval as pending approval', () => {
    renderPage({
      indicators: [
        {
          ...indicator,
          indicatorStatus: 'new',
          draftStatus: 'draft',
          draftLocked: true,
          draftSubmissionStatus: 'submitted',
        },
      ],
    });

    const row = screen.getByRole('rowheader', { name: 'Life expectancy at birth' }).closest('tr');
    const tags = [...(row?.querySelectorAll('.govuk-tag') ?? [])].map((tag) => tag.textContent);

    expect(tags).toEqual(['New', 'Pending approval']);
  });

  it('names the columns that have data behind them', () => {
    renderPage();

    for (const heading of [
      'Indicator name',
      'Team',
      'Created by',
      'Last edited',
      'Last edited by',
      'Indicator status',
      'Publishing status',
    ]) {
      expect(screen.getByRole('columnheader', { name: heading })).toBeTruthy();
    }
  });

  it('names the team, who created the indicator and who edited it last, in the design order', () => {
    renderPage();

    const row = screen.getByRole('rowheader', { name: 'Life expectancy at birth' }).closest('tr');
    const cells = [...(row?.querySelectorAll('td') ?? [])].map((cell) => cell.textContent);

    expect(cells.slice(0, 4)).toEqual(['Team A', 'Alex Morgan', '5 Aug 2026', 'Sam Taylor']);
  });

  it('links each indicator to its overview page', () => {
    renderPage();

    const link = screen.getByRole('link', { name: 'Life expectancy at birth' });

    expect(link.getAttribute('href')).toBe(`/dashboard/indicators/${indicator.id}`);
    expect(screen.getByRole('rowheader', { name: 'Life expectancy at birth' })).toBeTruthy();
  });

  it('shows when each indicator was last edited, in the display time zone', () => {
    renderPage();

    // 23:30 UTC on the 4th is 00:30 on the 5th in London.
    expect(screen.getByText('5 Aug 2026').getAttribute('datetime')).toBe(indicator.updatedAt);
  });

  it('starts the create-indicator journey', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Create new indicator' }).getAttribute('href')).toBe(
      '/publish/indicators/new',
    );
  });

  it('offers no create action to someone who may not create an indicator', () => {
    renderPage({ canCreate: false });

    expect(screen.queryByRole('button', { name: 'Create new indicator' })).toBeNull();
  });

  it('says so when there are no indicators', () => {
    renderPage({ indicators: [] });

    expect(screen.getByText('There are no indicators for you to see yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('paginates only when there is more than one page', () => {
    renderPage();

    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
  });

  it('links to every page, marking the current one', () => {
    renderPage({ page: 2, totalPages: 3 }, '/dashboard?page=2');

    const navigation = screen.getByRole('navigation', { name: 'Pagination' });

    expect(navigation).toBeTruthy();
    expect(screen.getByRole('link', { name: '1' }).getAttribute('href')).toBe('/dashboard');
    expect(screen.getByRole('link', { name: '3' }).getAttribute('href')).toBe('/dashboard?page=3');
    expect(screen.getByRole('link', { name: '2' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '1' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: /Previous/ }).getAttribute('href')).toBe('/dashboard');
    expect(screen.getByRole('link', { name: /Next/ }).getAttribute('href')).toBe(
      '/dashboard?page=3',
    );
  });

  it('heads the page for an IMRG manager with the indicators under review, offering no tabs', () => {
    renderManagerPage({ unassigned: [submitted], assigned: [] });

    expect(screen.getByRole('heading', { level: 1, name: 'Indicators under review' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Unassigned indicators' })).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create new indicator' })).toBeNull();
  });

  describe('for an IMRG manager who also publishes', () => {
    it('offers an Assign tab, counting the unassigned indicators, then Create and edit', () => {
      renderPage({}, '/dashboard', { unassigned: [submitted], assigned: [] });

      expect(screen.getByRole('heading', { level: 1, name: 'Indicators' })).toBeTruthy();
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Assign (1)',
        'Create and edit',
      ]);
      expect(screen.getByRole('tabpanel', { name: 'Assign (1)' }).textContent).toContain(
        'Smoking prevalence',
      );
    });

    it('leaves the count off the Assign tab when nothing waits for reviewers', () => {
      renderPage({}, '/dashboard', { unassigned: [], assigned: [submitted] });

      expect(screen.getByRole('tab', { name: 'Assign' })).toBeTruthy();
    });

    it('puts the create action and their indicators under Create and edit', () => {
      renderPage({}, '/dashboard', { unassigned: [], assigned: [] });

      const panel = screen.getByRole('tabpanel', { name: 'Create and edit' });

      expect(within(panel).getByRole('button', { name: 'Create new indicator' })).toBeTruthy();
      expect(within(panel).getByRole('link', { name: 'Life expectancy at birth' })).toBeTruthy();
    });

    it('keeps Create and edit open in the page links', () => {
      renderPage({ page: 2, totalPages: 3 }, '/dashboard?page=2&tab=create-and-edit', {
        unassigned: [],
        assigned: [],
      });

      expect(
        screen.getByRole('tab', { name: 'Create and edit' }).getAttribute('aria-selected'),
      ).toBe('true');
      expect(screen.getByRole('link', { name: '1' }).getAttribute('href')).toBe(
        '/dashboard?tab=create-and-edit',
      );
      expect(screen.getByRole('link', { name: '3' }).getAttribute('href')).toBe(
        '/dashboard?page=3&tab=create-and-edit',
      );
    });
  });

  it('heads the page for an IMRG reviewer with the indicators under review, offering no tabs', () => {
    renderReviewerPage([inReview]);

    expect(screen.getByRole('heading', { level: 1, name: 'Indicators under review' })).toBeTruthy();
    expect(
      screen.getByRole('table', { name: 'Indicators to review, oldest submission first' }),
    ).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create new indicator' })).toBeNull();
  });

  describe('for an IMRG reviewer who also publishes', () => {
    it('offers a Review tab, counting the indicators to review, then Create and edit', () => {
      renderPage({}, '/dashboard', null, [inReview]);

      expect(screen.getByRole('heading', { level: 1, name: 'Indicators' })).toBeTruthy();
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Review (1)',
        'Create and edit',
      ]);
      expect(screen.getByRole('tabpanel', { name: 'Review (1)' }).textContent).toContain(
        'Smoking prevalence',
      );
    });

    it('leaves the count off the Review tab when nothing is assigned', () => {
      renderPage({}, '/dashboard', null, []);

      expect(screen.getByRole('tab', { name: 'Review' })).toBeTruthy();
      expect(screen.getByRole('tabpanel', { name: 'Review' }).textContent).toContain(
        'No assigned indicators under review',
      );
    });

    it('puts the create action and their indicators under Create and edit', () => {
      renderPage({}, '/dashboard', null, []);

      const panel = screen.getByRole('tabpanel', { name: 'Create and edit' });

      expect(within(panel).getByRole('button', { name: 'Create new indicator' })).toBeTruthy();
      expect(within(panel).getByRole('link', { name: 'Life expectancy at birth' })).toBeTruthy();
    });
  });
});
