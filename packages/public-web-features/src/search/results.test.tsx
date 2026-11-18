// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
});
