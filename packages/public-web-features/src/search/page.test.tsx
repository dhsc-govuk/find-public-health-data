// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { SearchRoute } from './route.tsx';

afterEach(cleanup);

const searchLoaderData = {
  topicResults: [],
  geographyLookupUrl: '/geographies?scheme=public',
  q: '',
  topics: [],
  indicatorTypes: [],
  lifeStages: [],
  frameworks: [],
  populations: [],
  inequalities: [],
  sources: [],
  valueTypes: [],
  yearTypes: [],
  geoLevels: [],
  gaCodes: [],
  gaAreaNames: {},
  displayGroups: ['Local authorities', 'Statistical regions'],
  facets: {
    topics: [{ slug: 'mortality', title: 'Mortality' }],
    classifications: [{ dimension: 'indicator_type', slug: 'rate', name: 'Rate' }],
    sources: ['ONS'],
    valueTypes: ['Proportion'],
    yearTypes: ['Calendar'],
  },
  searchResult: { total: 0, limit: 200, indicators: [] },
};

function renderSearch(loaderData: object = searchLoaderData, url = '/search') {
  const Routes = createRoutesStub([
    { path: '/search', Component: SearchRoute, loader: () => loaderData },
  ]);
  render(<Routes initialEntries={[url]} />);
}

describe('the search page', () => {
  it('renders the search page skeleton with h1 and filters heading', async () => {
    renderSearch();

    expect(await screen.findByRole('heading', { level: 1, name: 'Search for data' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Indicator filters' })).toBeTruthy();
  });

  it('renders empty state inset text when there are no results', async () => {
    renderSearch();

    expect(
      await screen.findByText('No indicators match your selected filters or search terms.'),
    ).toBeTruthy();
  });

  it('shows results heading with total count', async () => {
    renderSearch({
      ...searchLoaderData,
      searchResult: {
        total: 5,
        limit: 200,
        indicators: [
          {
            shortId: 108,
            slug: 'under-75-mortality-rate-from-all-causes',
            name: 'Under 75 mortality rate from all causes',
            topics: [{ slug: 'mortality', title: 'Mortality' }],
            classifications: [],
          },
        ],
      },
    });

    expect(await screen.findByRole('heading', { name: '5 indicators' })).toBeTruthy();
  });

  it('prefills keyword input from loader data', async () => {
    renderSearch({ ...searchLoaderData, q: 'mortality' }, '/search?q=mortality');

    await screen.findByRole('heading', { level: 1, name: 'Search for data' });
    const input = screen.getByRole('searchbox', { name: 'Search by keywords' });
    expect((input as HTMLInputElement).defaultValue).toBe('mortality');
  });

  it('renders filter card bodies in the DOM (always present for no-JS)', async () => {
    renderSearch();

    await screen.findByRole('heading', { level: 1, name: 'Search for data' });
    // Bodies are always in the DOM so no-JS users can reach every filter.
    // Closed cards carry the hidden attribute; open cards do not.
    const body = document.querySelector('.fphd-topic-indicator-filters .fphd-filter-card__footer');
    expect(body).toBeTruthy();
    expect(body?.querySelector('input[type=checkbox]')).toBeTruthy();
  });

  it('opens a card automatically when it has an active filter (body not hidden)', async () => {
    renderSearch({ ...searchLoaderData, topics: ['mortality'] }, '/search?t=mortality');

    await screen.findByRole('heading', { level: 1, name: 'Search for data' });
    const selectedTopic = screen.getByRole('checkbox', { name: 'Mortality' });
    expect((selectedTopic as HTMLInputElement).checked).toBe(true);
    expect(selectedTopic.closest('.fphd-collapsible-body')?.hasAttribute('hidden')).toBe(false);
  });

  it('links to the other pages of results when they fill more than one', async () => {
    renderSearch({
      ...searchLoaderData,
      sort: 'relevance',
      searchResult: {
        total: 350,
        limit: 50,
        page: 1,
        indicators: Array.from({ length: 50 }, (_, i) => ({
          shortId: 100 + i,
          slug: `indicator-${100 + i}`,
          name: `Indicator ${i}`,
          topics: [],
          classifications: [],
        })),
      },
    });

    const pages = await screen.findByRole('navigation', { name: 'Search results pages' });
    expect(within(pages).getByRole('link', { name: '7' }).getAttribute('href')).toBe(
      '/search?page=7',
    );
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });
});
