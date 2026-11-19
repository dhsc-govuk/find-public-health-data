// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IndicatorSearchRow } from './loader.ts';
import { SearchResults } from './results.tsx';
import { EMPTY_SEARCH_STATE } from './url.ts';

afterEach(cleanup);

function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}

function renderResults() {
  const router = createMemoryRouter(
    [
      {
        path: '/search',
        element: (
          <>
            <SearchResults
              extraParams={{ 'tab-search': 'indicators' }}
              gaCodes={[]}
              geoLevels={[]}
              searchResult={{ total: 0, limit: 200, indicators: [] }}
              sort="recently-updated"
              state={{
                ...EMPTY_SEARCH_STATE,
                q: 'diabetes',
                topics: ['mortality'],
                updatedWithin: '6',
              }}
            />
            <Location />
          </>
        ),
      },
    ],
    { initialEntries: ['/search?q=diabetes&sort=recently-updated'] },
  );
  render(<RouterProvider router={router} />);
  return screen.getByLabelText<HTMLSelectElement>('Sort by');
}

describe('SearchResults sort', () => {
  it('offers relevance and recently updated, showing the current sort', () => {
    const select = renderResults();

    expect([...select.options].map(({ text }) => text)).toEqual(['Relevance', 'Recently updated']);
    expect(select.value).toBe('recently-updated');
  });

  it('keeps the keyword, filters and tab when the sort form submits', () => {
    const select = renderResults();
    const form = select.form;
    if (!form) throw new Error('The sort select is outside a form');

    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/search');
    expect([...new FormData(form)]).toEqual([
      ['tab-search', 'indicators'],
      ['q', 'diabetes'],
      ['updatedWithin', '6'],
      ['t', 'mortality'],
      ['sort', 'recently-updated'],
    ]);
  });

  it('submits as soon as the sort changes', async () => {
    const select = renderResults();

    fireEvent.change(select, { target: { value: 'relevance' } });

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '?tab-search=indicators&q=diabetes&updatedWithin=6&t=mortality&sort=relevance',
      ),
    );
  });
});

function indicatorRow(shortId: number) {
  return {
    shortId,
    slug: `indicator-${shortId}`,
    name: `Indicator ${shortId}`,
    topics: [],
    classifications: [],
    latestPeriod: null,
    yearType: null,
    dataUpdatedAt: null,
  };
}

/** The results for the page in the URL, as the loader would read them. */
function PagedResults({ total }: { total: number }) {
  const page = Number(new URLSearchParams(useLocation().search).get('page') ?? '1');
  return (
    <SearchResults
      extraParams={{ 'tab-search': 'indicators' }}
      gaCodes={[]}
      geoLevels={[]}
      searchResult={{ total, limit: 50, page, indicators: [indicatorRow(page)] }}
      sort="recently-updated"
      state={{ ...EMPTY_SEARCH_STATE, q: 'rate', topics: ['mortality'] }}
    />
  );
}

function renderPages(url: string, total = 785) {
  const router = createMemoryRouter(
    [{ path: '/search', element: <PagedResults total={total} /> }],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
}

const pagesNavigation = () => screen.queryByRole('navigation', { name: 'Search results pages' });
const pageHref = (page: number) =>
  `/search?tab-search=indicators&sort=recently-updated&page=${page}&q=rate&t=mortality`;

describe('SearchResults pages', () => {
  // jsdom has no scrollIntoView, which the focus tests stub, so it is put back as it was after each.
  const scrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  afterEach(() => {
    if (scrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', scrollIntoView);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('shows no pages when every result fits on one', () => {
    renderPages('/search?q=rate&t=mortality', 50);

    expect(pagesNavigation()).toBeNull();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('50 indicators');
  });

  it('links to the first, last and neighbouring pages, keeping the search, filters and sort', () => {
    renderPages(pageHref(5));

    const navigation = pagesNavigation();
    if (!navigation) throw new Error('The pages navigation is missing');
    const links = within(navigation).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Previous page',
      '1',
      '4',
      '5',
      '6',
      '16',
      'Next page',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      [4, 1, 4, 5, 6, 16, 6].map(pageHref),
    );
    expect(within(navigation).getAllByText('⋯')).toHaveLength(2);
  });

  it('returns to the first page when the sort changes', () => {
    renderPages(pageHref(3));

    const form = screen.getByLabelText<HTMLSelectElement>('Sort by').form;
    if (!form) throw new Error('The sort select is outside a form');
    expect(new FormData(form).has('page')).toBe(false);
  });

  it('says which page is showing in the results heading', () => {
    renderPages(pageHref(2));

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '785 indicators, page 2 of 16',
    );
  });

  it.each([
    [
      'the first page',
      '/search?page=1&t=mortality&q=rate&sort=recently-updated&tab-search=indicators',
      '1',
    ],
    [
      'a later page',
      '/search?page=3&t=mortality&q=rate&sort=recently-updated&tab-search=indicators',
      '3',
    ],
  ])('marks only the current page as current on %s', (_name, url, current) => {
    renderPages(url);

    const navigation = pagesNavigation();
    if (!navigation) throw new Error('The pages navigation is missing');
    const marked = within(navigation)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(marked.map((link) => link.textContent)).toEqual([current]);
  });

  it('moves focus to the results heading when a page link is followed', async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    renderPages('/search?q=rate&t=mortality&sort=recently-updated&tab-search=indicators');

    fireEvent.click(screen.getByRole('link', { name: /Next/ }));

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: '785 indicators, page 2 of 16',
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(scrolled).toHaveBeenCalled();
  });

  it('keeps the page number out of the live count, so a new page announces only by focus', () => {
    renderPages(pageHref(2));

    const live = screen.getByRole('heading', { level: 2 }).querySelectorAll('[aria-live]');
    expect([...live].map((region) => region.textContent)).toEqual(['785 indicators']);
  });

  it('leaves focus alone when the search changes some other way', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const router = createMemoryRouter(
      [{ path: '/search', element: <PagedResults total={785} /> }],
      { initialEntries: [pageHref(3)] },
    );
    render(<RouterProvider router={router} />);
    const navigation = pagesNavigation();
    if (!navigation) throw new Error('The pages navigation is missing');

    fireEvent.click(within(navigation).getByRole('link', { name: '3' }), { metaKey: true });
    await act(() => router.navigate('/search?q=rate&t=mortality&sort=recently-updated'));

    expect(
      screen.getByRole('heading', { level: 2, name: '785 indicators, page 1 of 16' }),
    ).not.toBe(document.activeElement);
  });
});

const ROW: IndicatorSearchRow = {
  shortId: 241,
  slug: 'diabetes-qof-prevalence',
  name: 'Diabetes: QOF prevalence',
  topics: [{ slug: 'diabetes', title: 'Diabetes' }],
  classifications: [{ dimension: 'indicator_type', slug: 'outcome', name: 'Outcome' }],
  latestPeriod: { fromDate: '2024-04-01', toDate: '2025-03-31' },
  yearType: { value: 'financial', label: 'Financial' },
  dataUpdatedAt: '2026-04-29T12:05:00.000Z',
};

function renderResult(indicator: IndicatorSearchRow) {
  const router = createMemoryRouter(
    [
      {
        path: '/search',
        element: (
          <SearchResults
            extraParams={{}}
            gaCodes={[]}
            geoLevels={[]}
            searchResult={{ total: 1, limit: 50, page: 1, indicators: [indicator] }}
            sort="relevance"
            state={EMPTY_SEARCH_STATE}
          />
        ),
      },
    ],
    { initialEntries: ['/search'] },
  );
  const { container } = render(<RouterProvider router={router} />);
  return [...container.querySelectorAll<HTMLElement>('.fphd-search-result dl')];
}

const summaryRows = (lists: HTMLElement[]) =>
  lists.map((list) =>
    [...list.querySelectorAll('.govuk-summary-list__row')].map((row) => [
      row.querySelector('dt')?.textContent,
      row.querySelector('dd')?.textContent,
    ]),
  );

describe('SearchResults summary', () => {
  it('lists the most recent period and the data update date beside the topics and types', () => {
    const lists = renderResult(ROW);

    expect(summaryRows(lists)).toEqual([
      [
        ['Topics', 'Diabetes'],
        ['Measure type', 'Outcome'],
      ],
      [
        ['Most recent period', '2024 to 2025'],
        ['Data last updated', '29 April 2026'],
      ],
    ]);
    expect(screen.getByText('29 April 2026').getAttribute('datetime')).toBe(
      '2026-04-29T12:05:00.000Z',
    );
  });

  it('shows the dates for an indicator with no topics or types', () => {
    const lists = renderResult({ ...ROW, topics: [], classifications: [] });

    expect(summaryRows(lists)).toEqual([
      [
        ['Most recent period', '2024 to 2025'],
        ['Data last updated', '29 April 2026'],
      ],
    ]);
  });

  it('leaves out the period and update rows when the indicator has neither', () => {
    const lists = renderResult({ ...ROW, latestPeriod: null, dataUpdatedAt: null });

    expect(summaryRows(lists)).toEqual([
      [
        ['Topics', 'Diabetes'],
        ['Measure type', 'Outcome'],
      ],
    ]);
  });
});
