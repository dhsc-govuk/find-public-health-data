// @vitest-environment jsdom
import {
  HomeRoute,
  IndicatorRoute,
  PublicHomePage,
  SearchRoute,
  TopicRoute,
  TopicsRoute,
} from '@fphd/public-web-features';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PublicApp, { ErrorBoundary } from './root.tsx';

const CALENDAR_YEARS = { id: '01a0d88c-310a-7ca5-8494-19e32c307628', label: 'Calendar' };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('public application routes', () => {
  it('renders the landing page introduction and shell navigation', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [{ index: true, Component: HomeRoute }],
      },
    ]);

    render(<Routes initialEntries={['/']} />);

    expect(await screen.findByRole('heading', { name: 'Find public health data' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Public health data' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Using this service' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Find data' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse by topics' }).getAttribute('href')).toBe(
      '/topics',
    );
    expect(screen.getByRole('link', { name: 'Topics' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'GOV.UK' })).toBeTruthy();
  });

  it('renders the topics page as an alphabetical list of links from loader data', async () => {
    // Ordering is the repository/API's responsibility (asserted elsewhere); this fixture is
    // already alphabetical, and the page must render it in that order without reshuffling.
    const topics = [
      { slug: 'topic-a', title: 'Topic A', description: 'All about topic A.' },
      { slug: 'topic-b', title: 'Topic B', description: 'All about topic B.' },
    ];
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [{ path: 'topics', Component: TopicsRoute, loader: () => topics }],
      },
    ]);

    render(<Routes initialEntries={['/topics']} />);

    expect(await screen.findByRole('heading', { name: 'Public health topics' })).toBeTruthy();

    const links = screen.getAllByRole('link', { name: /^Topic [AB]$/ });
    expect(links.map((link) => link.textContent)).toEqual(['Topic A', 'Topic B']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/topics/topic-a',
      '/topics/topic-b',
    ]);
    expect(screen.getByText('All about topic A.')).toBeTruthy();
    expect(screen.getByText('All about topic B.')).toBeTruthy();
  });

  it('renders the topic page title and description from loader data', async () => {
    const topic = {
      slug: 'topic-a',
      title: 'Topic A',
      description: 'All about topic A.',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    };
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'topics/:slug',
            Component: TopicRoute,
            loader: () => ({
              topic,
              content: null,
            }),
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/topics/topic-a']} />);

    expect(await screen.findByRole('heading', { name: 'Topic A' })).toBeTruthy();
    expect(screen.getByText('All about topic A.')).toBeTruthy();
  });

  it('offers only the period shapes the picked areas publish', async () => {
    const observation = (fromDate: string, toDate: string, value: number) => ({
      fromDate,
      toDate,
      value,
      lowerCi95: null,
      upperCi95: null,
      lowerCi998: null,
      upperCi998: null,
      count: null,
      denominator: null,
      notes: [],
      dimensions: [{ type: 'Age', value: 'All ages', dimensionClass: 'core', sortOrder: 1 }],
    });
    const detail = {
      shortId: 93995,
      slug: 'mortality-rate-for-deaths-involving-diabetes-all-ages',
      name: 'Mortality rate for deaths involving diabetes, all ages',
      valueType: 'Directly standardised rate',
      unit: 'per 100,000',
      yearType: CALENDAR_YEARS,
      updateFrequency: 'annually',
      polarity: 'lower-is-better',
      ciMethod: null,
      ciConfidenceLevel: null,
      comparatorMethod: null,
      dataUpdatedAt: null,
      definition: null,
      rationale: null,
      methodology: null,
      numeratorDefinition: null,
      denominatorDefinition: null,
      disclosureControl: null,
      caveats: null,
      notes: null,
      dataSource: null,
      numeratorSources: [],
      denominatorSources: [],
      areaTypes: [{ name: 'UA unchanged', areaCount: 125 }],
      topics: [],
      classifications: [],
    };
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'indicator/:slug',
            Component: IndicatorRoute,
            loader: () => ({
              selectedAreas: [{ code: 'E06000052', name: 'Cornwall', level: 'Local authorities' }],
              selected: [
                {
                  detail,
                  areaData: [
                    {
                      areaCode: 'E06000052',
                      areaName: 'Cornwall',
                      // Rolling-only: no single-year series exists for the picked area.
                      observations: [observation('2021-01-01', '2023-12-31', 10.2)],
                    },
                    {
                      areaCode: 'E92000001',
                      areaName: 'England',
                      // England publishes both shapes, but must not put a period
                      // choice on a page whose picked area cannot honour it.
                      observations: [
                        observation('2021-01-01', '2023-12-31', 11.4),
                        observation('2023-01-01', '2023-12-31', 11.9),
                      ],
                    },
                  ],
                },
              ],
              selection: {
                areaCodes: ['E06000052'],
                areaLevels: [],
                shortIds: [93995],
              },
            }),
          },
        ],
      },
    ]);

    // A stale pt param in the URL must fall back to All, not blank the table.
    render(
      <Routes
        initialEntries={[
          '/indicator/mortality-rate-for-deaths-involving-diabetes-all-ages?as=E06000052&pt-93995=1-year',
        ]}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Mortality rate for deaths involving diabetes, all ages',
      }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Select time period type')).toBeNull();
    expect(screen.getByRole('rowheader', { name: '2021 to 2023' })).toBeTruthy();
  });

  it('offers a benchmark beside each picked area with an optional comparison range', async () => {
    const observationFor = (value: number) => ({
      fromDate: '2023-01-01',
      toDate: '2023-12-31',
      value,
      lowerCi95: null,
      upperCi95: null,
      lowerCi998: null,
      upperCi998: null,
      count: null,
      denominator: null,
      notes: [],
      dimensions: [{ type: 'Age', value: '<75 yrs', dimensionClass: 'core', sortOrder: 1 }],
    });
    const detail = {
      shortId: 108,
      slug: 'under-75-mortality-rate-from-all-causes',
      name: 'Under 75 mortality rate from all causes',
      valueType: 'Directly standardised rate',
      unit: 'per 100,000',
      yearType: CALENDAR_YEARS,
      updateFrequency: 'annually',
      polarity: 'lower-is-better',
      ciMethod: null,
      ciConfidenceLevel: null,
      comparatorMethod: null,
      dataUpdatedAt: null,
      definition: null,
      rationale: null,
      methodology: null,
      numeratorDefinition: null,
      denominatorDefinition: null,
      disclosureControl: null,
      caveats: null,
      notes: null,
      dataSource: null,
      numeratorSources: [],
      denominatorSources: [],
      areaTypes: [{ name: 'UA unchanged', areaCount: 125 }],
      topics: [],
      classifications: [],
    };
    // The segment matches the fixture observations' dimension values, as the table only
    // brackets a row with a range describing the same population.
    const rangePeriod = {
      fromDate: '2023-01-01',
      toDate: '2023-12-31',
      segment: '<75 yrs',
      min: 300.1,
      max: 500.9,
    };
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'indicator/:slug',
            Component: IndicatorRoute,
            loader: () => ({
              selectedAreas: [{ code: 'E06000052', name: 'Cornwall', level: 'Local authorities' }],
              benchmarkGeography: {
                regionByCode: { E06000052: { code: 'E12000009', name: 'South West' } },
                levelByCode: { E06000052: 'Local authorities' },
              },
              selected: [
                {
                  detail,
                  areaData: [
                    {
                      areaCode: 'E06000052',
                      areaName: 'Cornwall',
                      observations: [observationFor(395.6)],
                    },
                    {
                      areaCode: 'E92000001',
                      areaName: 'England',
                      observations: [observationFor(410.3)],
                    },
                  ],
                  regionData: [
                    {
                      areaCode: 'E12000009',
                      areaName: 'South West',
                      observations: [observationFor(400.2)],
                    },
                  ],
                  ranges: {
                    'Local authorities': [rangePeriod],
                    'Statistical regions': [rangePeriod],
                  },
                },
              ],
              selection: {
                areaCodes: ['E06000052'],
                areaLevels: [],
                shortIds: [108],
              },
            }),
          },
        ],
      },
    ]);

    render(
      <Routes
        initialEntries={['/indicator/under-75-mortality-rate-from-all-causes?as=E06000052']}
      />,
    );

    // England is not a column of its own while a real area is picked and no benchmark
    // is chosen.
    fireEvent.click(await screen.findByRole('button', { name: 'Table columns' }));
    const select = await screen.findByLabelText('Select a geography or goal to compare with');
    expect(screen.queryByRole('columnheader', { name: 'England' })).toBeNull();

    fireEvent.change(select, { target: { value: 'england' } });
    expect(await screen.findByRole('columnheader', { name: 'England' })).toBeTruthy();

    // Turning the range on adds the spread and the dot-and-whisker comparison.
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    expect(await screen.findByRole('columnheader', { name: 'Minimum' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Maximum' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '300.1' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '500.9' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Cornwall 395.6 against England 410.3/ })).toBeTruthy();

    // The statistical-region benchmark takes the parent region's name and values.
    fireEvent.change(select, { target: { value: 'region' } });
    expect(
      await screen.findByRole('columnheader', { name: 'South West (Statistical region)' }),
    ).toBeTruthy();
    expect(screen.getByRole('cell', { name: '400.2' })).toBeTruthy();
  });

  it('renders the not-found page when the indicator loader throws a 404 response', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        ErrorBoundary,
        children: [
          {
            path: 'indicator/:slug',
            Component: IndicatorRoute,
            loader: () => {
              throw new Response('Not Found', { status: 404 });
            },
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/indicator/no-such-indicator']} />);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });

  it('renders the not-found page when the topic loader throws a 404 response', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        ErrorBoundary,
        children: [
          {
            path: 'topics/:slug',
            Component: TopicRoute,
            loader: () => {
              throw new Response('Not Found', { status: 404 });
            },
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/topics/no-such-topic']} />);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });

  it('nav includes Search between Home and Topics', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [{ index: true, Component: PublicHomePage }],
      },
    ]);

    render(<Routes initialEntries={['/']} />);

    await screen.findByRole('heading', { name: 'Find public health data' });
    expect(screen.getByRole('link', { name: 'Search' }).getAttribute('href')).toBe('/search');
  });

  it('home page renders search form and See all data card', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [{ index: true, Component: PublicHomePage }],
      },
    ]);

    render(<Routes initialEntries={['/']} />);

    await screen.findByRole('heading', { name: 'Find public health data' });
    expect(screen.getByLabelText('Search for data')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See all data' }).getAttribute('href')).toBe('/search');
  });

  const searchLoaderData = {
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

  it('renders the search page skeleton with h1 and filters heading', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'search',
            Component: SearchRoute,
            loader: () => searchLoaderData,
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/search']} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Search for data' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Filters' })).toBeTruthy();
  });

  it('renders empty state inset text when there are no results', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'search',
            Component: SearchRoute,
            loader: () => searchLoaderData,
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/search']} />);

    expect(
      await screen.findByText('No indicators match your selected filters or search terms.'),
    ).toBeTruthy();
  });

  it('shows results heading with total count', async () => {
    const dataWithResults = {
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
    };

    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'search',
            Component: SearchRoute,
            loader: () => dataWithResults,
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/search']} />);

    expect(await screen.findByRole('heading', { name: '5 indicators' })).toBeTruthy();
  });

  it('prefills keyword input from loader data', async () => {
    const dataWithQ = { ...searchLoaderData, q: 'mortality' };

    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'search',
            Component: SearchRoute,
            loader: () => dataWithQ,
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/search?q=mortality']} />);

    await screen.findByRole('heading', { level: 1, name: 'Search for data' });
    const input = screen.getByRole('searchbox', { name: 'Search by keywords' });
    expect((input as HTMLInputElement).defaultValue).toBe('mortality');
  });

  it('renders filter card bodies in the DOM (always present for no-JS)', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'search',
            Component: SearchRoute,
            loader: () => searchLoaderData,
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/search']} />);

    await screen.findByRole('heading', { level: 1, name: 'Search for data' });
    // Bodies are always in the DOM so no-JS users can reach every filter.
    // Closed cards carry the hidden attribute; open cards do not.
    const noneSelected = document.querySelector('.fphd-collapsible-body');
    expect(noneSelected).toBeTruthy();
    expect(noneSelected?.textContent).toContain('None selected');
  });

  it('opens a card automatically when it has an active filter (body not hidden)', async () => {
    const dataWithTopic = { ...searchLoaderData, topics: ['mortality'] };

    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'search',
            Component: SearchRoute,
            loader: () => dataWithTopic,
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/search?t=mortality']} />);

    await screen.findByRole('heading', { level: 1, name: 'Search for data' });
    const selectedTopicsEl = screen.getByText('Selected topics');
    // The card body must not have the hidden attribute when a filter is active.
    expect(selectedTopicsEl.closest('.fphd-collapsible-body')?.hasAttribute('hidden')).toBe(false);
  });

  it('shows cap message when total exceeds 200', async () => {
    const cappedData = {
      ...searchLoaderData,
      searchResult: {
        total: 350,
        limit: 200,
        indicators: Array.from({ length: 200 }, (_, i) => ({
          shortId: 100 + i,
          slug: `indicator-${100 + i}`,
          name: `Indicator ${i}`,
          topics: [],
          classifications: [],
        })),
      },
    };

    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'search',
            Component: SearchRoute,
            loader: () => cappedData,
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/search']} />);

    expect(await screen.findByText(/Showing the first 200 of 350/)).toBeTruthy();
  });
});
