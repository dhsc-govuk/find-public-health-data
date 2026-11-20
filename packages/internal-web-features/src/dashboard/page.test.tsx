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
  draftResponseKind: null,
  draftUpdateDecision: null,
  draftReviewers: [],
};

const otherIndicator: IndicatorAdminListItem = {
  ...indicator,
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a6b',
  name: 'Hospital admissions for asthma',
  teamId: TEAM_IDS.teamB,
  teamName: 'Team B',
};

/** A publisher's page of other teams' indicators. */
const otherTeams: IndicatorList = {
  canCreate: false,
  indicators: [otherIndicator],
  page: 1,
  totalPages: 1,
};

// The pagination links read router state, so the page renders inside a router at its own address.
function renderPage(
  list: Partial<IndicatorList> = {},
  url = '/dashboard',
  underReview: IndicatorsUnderReview | null = null,
  toReview: IndicatorAdminListItem[] | null = null,
  otherList: IndicatorList | null = null,
) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DashboardPage
        underReview={underReview}
        toReview={toReview}
        scheduled={null}
        awaitingDecision={null}
        list={{ canCreate: true, indicators: [indicator], page: 1, totalPages: 1, ...list }}
        otherList={otherList}
      />
    </MemoryRouter>,
  );
}

function renderManagerPage(underReview: IndicatorsUnderReview) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DashboardPage
        underReview={underReview}
        toReview={null}
        scheduled={null}
        awaitingDecision={null}
        list={null}
      />
    </MemoryRouter>,
  );
}

function renderReviewerPage(toReview: IndicatorAdminListItem[]) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DashboardPage
        underReview={null}
        toReview={toReview}
        scheduled={null}
        awaitingDecision={null}
        list={null}
      />
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

  it('tags a new indicator submitted for approval as pending review', () => {
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

    expect(tags).toEqual(['New', 'Pending review']);
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

  describe('for an IMRG manager', () => {
    it('heads the page with the indicators under review, a tab for each table', () => {
      renderManagerPage({ unassigned: [submitted], assigned: [inReview] });

      expect(
        screen.getByRole('heading', { level: 1, name: 'Indicators under review' }),
      ).toBeTruthy();
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Unassigned indicators',
        'Assigned indicators',
      ]);
      expect(
        within(screen.getByRole('tabpanel', { name: 'Unassigned indicators' })).getByRole('table', {
          name: 'Unassigned indicators, oldest submission first',
        }),
      ).toBeTruthy();
      expect(
        within(screen.getByRole('tabpanel', { name: 'Assigned indicators' })).getByRole('table', {
          name: 'Assigned indicators, oldest submission first',
        }),
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Create new indicator' })).toBeNull();
    });

    it('opens the Assigned indicators tab named in the address', () => {
      render(
        <MemoryRouter initialEntries={['/dashboard?tab=assigned']}>
          <DashboardPage
            underReview={{ unassigned: [submitted], assigned: [inReview] }}
            toReview={null}
            scheduled={null}
            awaitingDecision={null}
            list={null}
          />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole('tab', { name: 'Assigned indicators' }).getAttribute('aria-selected'),
      ).toBe('true');
    });
  });

  describe('for a publisher', () => {
    it("offers Your teams' indicators, then All other indicators", () => {
      renderPage({}, '/dashboard', null, null, otherTeams);

      expect(screen.getByRole('heading', { level: 1, name: 'Indicators' })).toBeTruthy();
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        "Your teams' indicators",
        'All other indicators',
      ]);
      expect(
        screen.getByRole('tab', { name: "Your teams' indicators" }).getAttribute('aria-selected'),
      ).toBe('true');
    });

    it("puts the create action and their teams' indicators under Your teams' indicators", () => {
      renderPage({}, '/dashboard', null, null, otherTeams);

      const panel = screen.getByRole('tabpanel', { name: "Your teams' indicators" });

      expect(within(panel).getByRole('button', { name: 'Create new indicator' })).toBeTruthy();
      expect(within(panel).getByRole('link', { name: 'Life expectancy at birth' })).toBeTruthy();
      expect(within(panel).queryByText('Hospital admissions for asthma')).toBeNull();
    });

    it("lists other teams' indicators in the same columns, each linked to its overview, with no create action", () => {
      renderPage({}, '/dashboard?tab=all-other', null, null, otherTeams);

      const panel = screen.getByRole('tabpanel', { name: 'All other indicators' });
      const table = within(panel).getByRole('table', {
        name: 'Indicators, most recently edited first',
      });

      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((cell) => cell.textContent),
      ).toEqual([
        'Indicator name',
        'Team',
        'Created by',
        'Last edited',
        'Last edited by',
        'Indicator status',
        'Publishing status',
      ]);
      expect(
        within(panel)
          .getByRole('link', { name: 'Hospital admissions for asthma' })
          .getAttribute('href'),
      ).toBe(`/dashboard/indicators/${otherIndicator.id}`);
      expect(within(panel).getByText('Team B')).toBeTruthy();
      expect(within(panel).queryByRole('button', { name: 'Create new indicator' })).toBeNull();
    });

    it("pages other teams' indicators with their own page number, keeping their tab open", () => {
      renderPage({}, '/dashboard?otherPage=2&tab=all-other', null, null, {
        ...otherTeams,
        page: 2,
        totalPages: 3,
      });

      const panel = screen.getByRole('tabpanel', { name: 'All other indicators' });

      expect(within(panel).getByRole('link', { name: '1' }).getAttribute('href')).toBe(
        '/dashboard?tab=all-other',
      );
      expect(within(panel).getByRole('link', { name: '3' }).getAttribute('href')).toBe(
        '/dashboard?otherPage=3&tab=all-other',
      );
      expect(within(panel).getByRole('link', { name: '2' }).getAttribute('aria-current')).toBe(
        'page',
      );
    });

    it("keeps Your teams' indicators open in its own page links", () => {
      renderPage({ page: 2, totalPages: 3 }, '/dashboard?page=2', null, null, otherTeams);

      expect(screen.getByRole('link', { name: '3' }).getAttribute('href')).toBe(
        '/dashboard?page=3&tab=your-teams',
      );
    });
  });

  describe('for an IMRG manager who also publishes', () => {
    it("offers the two review tabs, then Your teams' indicators and All other indicators", () => {
      renderPage({}, '/dashboard', { unassigned: [submitted], assigned: [] }, null, otherTeams);

      expect(screen.getByRole('heading', { level: 1, name: 'Indicators' })).toBeTruthy();
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Unassigned indicators',
        'Assigned indicators',
        "Your teams' indicators",
        'All other indicators',
      ]);
      expect(screen.getByRole('tabpanel', { name: 'Unassigned indicators' }).textContent).toContain(
        'Smoking prevalence',
      );
    });

    it("puts the create action and their indicators under Your teams' indicators", () => {
      renderPage({}, '/dashboard', { unassigned: [], assigned: [] }, null, otherTeams);

      const panel = screen.getByRole('tabpanel', { name: "Your teams' indicators" });

      expect(within(panel).getByRole('button', { name: 'Create new indicator' })).toBeTruthy();
      expect(within(panel).getByRole('link', { name: 'Life expectancy at birth' })).toBeTruthy();
    });

    it("keeps Your teams' indicators open in the page links", () => {
      renderPage(
        { page: 2, totalPages: 3 },
        '/dashboard?page=2&tab=your-teams',
        { unassigned: [], assigned: [] },
        null,
        otherTeams,
      );

      expect(
        screen.getByRole('tab', { name: "Your teams' indicators" }).getAttribute('aria-selected'),
      ).toBe('true');
      expect(screen.getByRole('link', { name: '1' }).getAttribute('href')).toBe(
        '/dashboard?tab=your-teams',
      );
      expect(screen.getByRole('link', { name: '3' }).getAttribute('href')).toBe(
        '/dashboard?page=3&tab=your-teams',
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
    it("offers a Review tab, counting the indicators to review, then Your teams' indicators and All other indicators", () => {
      renderPage({}, '/dashboard', null, [inReview], otherTeams);

      expect(screen.getByRole('heading', { level: 1, name: 'Indicators' })).toBeTruthy();
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Review (1)',
        "Your teams' indicators",
        'All other indicators',
      ]);
      expect(screen.getByRole('tabpanel', { name: 'Review (1)' }).textContent).toContain(
        'Smoking prevalence',
      );
    });

    it('lists an indicator sent back for changes on the Review tab without counting it', () => {
      const sentBack: IndicatorAdminListItem = {
        ...inReview,
        id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5d',
        name: 'Hip fractures',
        draftLocked: false,
        draftSubmissionStatus: 'changes_requested',
        draftResponseKind: 'minor_revisions',
        draftUpdateDecision: null,
      };

      renderPage({}, '/dashboard', null, [inReview, sentBack], otherTeams);

      const panel = screen.getByRole('tabpanel', { name: 'Review (1)' });
      expect(within(panel).getByRole('link', { name: 'Hip fractures' })).toBeTruthy();
      expect(within(panel).getByText('Minor revisions needed')).toBeTruthy();
    });

    it('leaves the count off the Review tab when nothing is assigned', () => {
      renderPage({}, '/dashboard', null, [], otherTeams);

      expect(screen.getByRole('tab', { name: 'Review' })).toBeTruthy();
      expect(screen.getByRole('tabpanel', { name: 'Review' }).textContent).toContain(
        'No assigned indicators under review',
      );
    });

    it("puts the create action and their indicators under Your teams' indicators", () => {
      renderPage({}, '/dashboard', null, [], otherTeams);

      const panel = screen.getByRole('tabpanel', { name: "Your teams' indicators" });

      expect(within(panel).getByRole('button', { name: 'Create new indicator' })).toBeTruthy();
      expect(within(panel).getByRole('link', { name: 'Life expectancy at birth' })).toBeTruthy();
    });
  });

  it('offers an IMRG manager who reviews the Unassigned, Assigned and Review tabs, headed Indicators', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardPage
          underReview={{ unassigned: [submitted], assigned: [] }}
          toReview={[inReview]}
          scheduled={null}
          awaitingDecision={null}
          list={null}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Indicators' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Unassigned indicators',
      'Assigned indicators',
      'Review (1)',
    ]);
  });

  it('offers an IMRG manager who reviews and publishes a tab for each role, in order', () => {
    renderPage({}, '/dashboard', { unassigned: [], assigned: [] }, [], otherTeams);

    expect(screen.getByRole('heading', { level: 1, name: 'Indicators' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Unassigned indicators',
      'Assigned indicators',
      'Review',
      "Your teams' indicators",
      'All other indicators',
    ]);
    expect(
      within(screen.getByRole('tabpanel', { name: "Your teams' indicators" })).getByRole('button', {
        name: 'Create new indicator',
      }),
    ).toBeTruthy();
  });

  it('offers an admin who publishes every indicator under Create and edit, alone', () => {
    renderPage();

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create new indicator' })).toBeTruthy();
  });

  it('offers an admin who reviews a Review tab then an All indicators tab, headed Indicators', () => {
    renderPage(
      { canCreate: false, page: 2, totalPages: 3 },
      '/dashboard?page=2&tab=all-indicators',
      null,
      [inReview],
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Indicators' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Review (1)',
      'All indicators',
    ]);
    expect(screen.getByRole('tab', { name: 'All indicators' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('link', { name: '3' }).getAttribute('href')).toBe(
      '/dashboard?page=3&tab=all-indicators',
    );
    expect(screen.queryByRole('button', { name: 'Create new indicator' })).toBeNull();
  });

  describe('for an admin', () => {
    const pending: IndicatorAdminListItem = {
      ...submitted,
      draftSubmissionStatus: 'approved',
      draftResponseKind: 'approved',
      draftUpdateDecision: null,
    };
    const scheduled: IndicatorAdminListItem = {
      ...pending,
      id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5d',
      name: 'Hip fractures',
      draftStatus: 'scheduled',
    };

    const awaitingDecision: IndicatorAdminListItem = {
      ...submitted,
      id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5e',
      name: 'Falls in older people',
      indicatorStatus: 'live',
    };

    function renderAdminPage(
      scheduledIndicators: IndicatorAdminListItem[],
      awaitingDecisionIndicators: IndicatorAdminListItem[] = [],
    ) {
      return render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardPage
            underReview={null}
            toReview={null}
            scheduled={scheduledIndicators}
            awaitingDecision={awaitingDecisionIndicators}
            list={{ canCreate: false, indicators: [indicator], page: 1, totalPages: 1 }}
          />
        </MemoryRouter>,
      );
    }

    it('offers a Scheduled indicators tab, counting them, first and open, then Update decision needed and All indicators', () => {
      renderAdminPage([scheduled, pending]);

      expect(screen.getByRole('heading', { level: 1, name: 'Indicators' })).toBeTruthy();
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Scheduled indicators (2)',
        'Update decision needed',
        'All indicators',
      ]);
      expect(
        screen.getByRole('tab', { name: 'Scheduled indicators (2)' }).getAttribute('aria-selected'),
      ).toBe('true');
    });

    it("lists the scheduled indicators in the list's columns, with their publishing status", () => {
      renderAdminPage([scheduled, pending]);

      const table = screen.getByRole('table', {
        name: 'Scheduled indicators, soonest publication date first',
      });
      const rows = within(table).getAllByRole('row').slice(1);

      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((header) => header.textContent),
      ).toEqual([
        'Indicator name',
        'Team',
        'Created by',
        'Last edited',
        'Last edited by',
        'Indicator status',
        'Publishing status',
      ]);
      expect(
        rows.map((row) => [...row.querySelectorAll('.govuk-tag')].map((tag) => tag.textContent)),
      ).toEqual([
        ['New', 'Publishing scheduled'],
        ['New', 'Pending scheduling'],
      ]);
    });

    it('says so when nothing is scheduled, leaving the count off the tab', () => {
      renderAdminPage([]);

      expect(screen.getByRole('tab', { name: 'Scheduled indicators' })).toBeTruthy();
      expect(
        within(screen.getByRole('tabpanel', { name: 'Scheduled indicators' })).getByText(
          'There are no scheduled indicators.',
        ),
      ).toBeTruthy();
    });

    it('counts the updates waiting for a decision on their tab, each "Update pending decision"', () => {
      renderAdminPage([], [awaitingDecision]);

      const table = within(
        screen.getByRole('tabpanel', { name: 'Update decision needed (1)' }),
      ).getByRole('table', { name: 'Updates waiting for a decision, oldest submission first' });
      expect(
        within(table)
          .getAllByRole('row')
          .slice(1)
          .map((row) => [...row.querySelectorAll('.govuk-tag')].map((tag) => tag.textContent)),
      ).toEqual([['Live', 'Update pending decision']]);
    });

    it('says so when no update waits for a decision', () => {
      renderAdminPage([]);

      expect(
        within(screen.getByRole('tabpanel', { name: 'Update decision needed' })).getByText(
          'There are no updates waiting for a decision.',
        ),
      ).toBeTruthy();
    });
  });

  it('shows what the page before left to say in an important banner', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardPage
          underReview={null}
          toReview={[]}
          scheduled={null}
          awaitingDecision={null}
          list={null}
          notification="You are no longer a reviewer of this indicator."
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('region', { name: 'Important' }).textContent).toContain(
      'You are no longer a reviewer of this indicator.',
    );
  });
});

describe('the dashboard search', () => {
  const LABEL = 'Search indicators by name or who created them';

  function renderSearched(
    search: string | undefined,
    url: string,
    props: Partial<Parameters<typeof DashboardPage>[0]> = {},
  ) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <DashboardPage
          search={search}
          underReview={null}
          toReview={null}
          scheduled={null}
          awaitingDecision={null}
          list={null}
          {...props}
        />
      </MemoryRouter>,
    );
  }

  const emptyList: IndicatorList = { canCreate: true, indicators: [], page: 1, totalPages: 1 };

  it('offers a search of the dashboard, sent to the dashboard as a query', () => {
    renderSearched(undefined, '/dashboard', { list: emptyList });

    const search = screen.getByRole('search');
    const form = search.querySelector('form');
    expect(form?.getAttribute('action')).toBe('/dashboard');
    expect(form?.getAttribute('method')).toBe('get');
    expect(within(search).getByRole('searchbox', { name: LABEL }).getAttribute('name')).toBe(
      'search',
    );
    expect(within(search).getByRole('button', { name: 'Search' })).toBeTruthy();
  });

  it('puts the search above the tabs', () => {
    renderSearched(undefined, '/dashboard', { underReview: { unassigned: [], assigned: [] } });

    const search = screen.getByRole('search');
    const tabs = screen.getByRole('tablist');
    expect(search.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the search the lists match', () => {
    renderSearched('asthma', '/dashboard?search=asthma', { list: emptyList });

    expect((screen.getByRole('searchbox', { name: LABEL }) as HTMLInputElement).value).toBe(
      'asthma',
    );
  });

  it('sends the open tab with a search, and no page', () => {
    renderSearched(undefined, '/dashboard?tab=assigned&page=2', {
      underReview: { unassigned: [], assigned: [] },
    });

    const form = screen.getByRole('search').querySelector('form');
    const hidden = [...(form?.querySelectorAll('input[type="hidden"]') ?? [])].map((input) => [
      input.getAttribute('name'),
      input.getAttribute('value'),
    ]);
    expect(hidden).toEqual([['tab', 'assigned']]);
  });

  it('offers Clear search, which leads to the dashboard with no search', () => {
    renderSearched(undefined, '/dashboard', { list: emptyList });

    const clear = within(screen.getByRole('search')).getByRole('link', { name: 'Clear search' });
    expect(clear.getAttribute('href')).toBe('/dashboard');
    expect(clear.getAttribute('aria-current')).toBeNull();
  });

  it('keeps the open tab, and no search or page, in the Clear search link', () => {
    renderSearched('asthma', '/dashboard?search=asthma&page=2&tab=assigned', {
      underReview: { unassigned: [], assigned: [] },
    });

    expect(screen.getByRole('link', { name: 'Clear search' }).getAttribute('href')).toBe(
      '/dashboard?tab=assigned',
    );
  });

  it('says no indicators match when the search matched none of the list', () => {
    renderSearched('quokka', '/dashboard?search=quokka', { list: emptyList });

    expect(screen.getByText('No indicators match your search.')).toBeTruthy();
    expect(screen.queryByText('There are no indicators for you to see yet.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create new indicator' })).toBeTruthy();
  });

  it('says no indicators match on each tab whose table the search left empty', () => {
    renderSearched('quokka', '/dashboard?search=quokka', {
      underReview: { unassigned: [], assigned: [inReview] },
      toReview: [],
      scheduled: [],
      awaitingDecision: [],
      list: emptyList,
    });

    const noMatches = (tab: string) =>
      within(screen.getByRole('tabpanel', { name: tab })).queryByText(
        'No indicators match your search.',
      );
    expect(noMatches('Unassigned indicators')).toBeTruthy();
    expect(noMatches('Assigned indicators')).toBeNull();
    expect(noMatches('Review')).toBeTruthy();
    expect(noMatches('Scheduled indicators')).toBeTruthy();
    expect(noMatches('Update decision needed')).toBeTruthy();
    expect(noMatches('Create and edit')).toBeTruthy();
  });

  it("says no indicators match on each of a publisher's tabs the search left empty", () => {
    renderSearched('quokka', '/dashboard?search=quokka', {
      list: emptyList,
      otherList: { ...emptyList, canCreate: false },
    });

    for (const tab of ["Your teams' indicators", 'All other indicators']) {
      expect(
        within(screen.getByRole('tabpanel', { name: tab })).getByText(
          'No indicators match your search.',
        ),
        tab,
      ).toBeTruthy();
    }
  });

  it("keeps the search in the page links of other teams' indicators", () => {
    renderSearched('asthma', '/dashboard?search=asthma&tab=all-other', {
      list: emptyList,
      otherList: { ...otherTeams, page: 1, totalPages: 2 },
    });

    expect(screen.getByRole('link', { name: '2' }).getAttribute('href')).toBe(
      '/dashboard?search=asthma&otherPage=2&tab=all-other',
    );
  });

  it('keeps the search in the page links', () => {
    renderSearched('asthma', '/dashboard?search=asthma&page=2', {
      list: { canCreate: true, indicators: [indicator], page: 2, totalPages: 3 },
    });

    expect(screen.getByRole('link', { name: '1' }).getAttribute('href')).toBe(
      '/dashboard?search=asthma',
    );
    expect(screen.getByRole('link', { name: '3' }).getAttribute('href')).toBe(
      '/dashboard?search=asthma&page=3',
    );
  });
});
