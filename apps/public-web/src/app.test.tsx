// @vitest-environment jsdom
import {
  HomeRoute,
  IndicatorRoute,
  PublicHomePage,
  SearchRoute,
  type SelectedIndicator,
  TopicRoute,
  TopicsRoute,
} from '@fphd/public-web-features';
import { serviceName } from '@fphd/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRoutesStub, Meta } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { compactIndicator } from '../../../packages/public-web-features/src/indicator/compact-data.ts';
import { indicatorComparisonModel } from '../../../packages/public-web-features/src/indicator/comparison-model.ts';
import PublicApp, { ErrorBoundary, meta } from './root.tsx';

const CALENDAR_YEARS = { id: '01a0d88c-310a-7ca5-8494-19e32c307628', label: 'Calendar' };

function indicatorPage<
  T extends {
    data: { selected: unknown[]; findResults: unknown[]; findSubject: string };
    comparison: Parameters<typeof indicatorComparisonModel>[1];
  },
>(page: T) {
  const selected = page.data.selected as SelectedIndicator[];
  return {
    ...page,
    data: { ...page.data, selected: selected.slice(0, 1).map(compactIndicator) },
    comparison: {
      ...indicatorComparisonModel(selected, page.comparison),
      areaChart: compactIndicator({
        detail: selected[0]?.detail as SelectedIndicator['detail'],
        areaData: page.comparison.compareAreasData,
      }),
      compareAreaRanges: [],
      scatter: undefined,
    },
    findResults: page.data.findResults,
    findSubject: page.data.findSubject,
  };
}

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
    expect(screen.getByRole('heading', { name: 'Ways to find data' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse by topic' }).getAttribute('href')).toBe(
      '/topics',
    );
    expect(screen.getByRole('link', { name: 'Topics' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
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
      updateFrequencyReason: null,
      updateFrequencyText: null,
      updateFrequencyYears: null,
      polarity: 'lower-is-better',
      ciMethod: null,
      ciConfidenceLevel: null,
      comparatorMethod: null,
      dataUpdatedAt: null,
      firstPublishedAt: '2026-04-20T00:00:00.000Z',
      lastPublishedAt: '2026-04-20T00:00:00.000Z',
      definition: null,
      rationale: null,
      methodology: null,
      numeratorDefinition: null,
      denominatorDefinition: null,
      numeratorDisclosureControl: null,
      denominatorDisclosureControl: null,
      caveats: null,
      notes: null,
      dataSource: null,
      numeratorSources: [],
      denominatorSources: [],
      dataValues: [],
      areaTypes: [{ name: 'UA unchanged', areaCount: 125 }],
      topics: [],
      classifications: [],
      updateSummaries: [],
    };
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'indicator/:slug',
            Component: IndicatorRoute,
            loader: () =>
              indicatorPage({
                detail,
                comparedDetail: undefined,
                complete: true,
                comparison: {
                  compareAreasData: [],
                  comparedAreasData: [],
                  compareAreaOptions: [],
                  compareAreaGroup: '',
                  comparisonDisplayGroups: [],
                },
                data: {
                  displayGroups: [],
                  findResults: [],
                  findSubject: '',
                  areasLimited: false,
                  benchmarkGeography: { regionByCode: {}, levelByCode: {} },
                  selectedAreas: [
                    { code: 'E06000052', name: 'Cornwall', level: 'Local authorities' },
                  ],
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
                          // England publishes both shapes, so the page offers the choice,
                          // but only the shape the picked area publishes.
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
                },
              }),
          },
        ],
      },
    ]);

    // A period type the picked area lacks gives way to the one it has, and the page says why.
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
    const [select] = screen.getAllByLabelText<HTMLSelectElement>('Type of time period');
    expect([...(select?.options ?? [])].map(({ text }) => text)).toEqual([
      '3 year rolling average',
    ]);
    expect(
      screen
        .getAllByRole('status')
        .some(
          ({ textContent }) =>
            textContent === 'Showing 3 year rolling averages because Cornwall has no 1 year data.',
        ),
    ).toBe(true);
    expect(
      within(screen.getByRole('table', { name: /^Table:/ })).getByRole('rowheader', {
        name: '2021 to 2023',
      }),
    ).toBeTruthy();
  });

  it('offers shared benchmarks with their spreads and a comparison chart for each picked area', async () => {
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
      updateFrequencyReason: null,
      updateFrequencyText: null,
      updateFrequencyYears: null,
      polarity: 'lower-is-better',
      ciMethod: null,
      ciConfidenceLevel: null,
      comparatorMethod: null,
      dataUpdatedAt: null,
      firstPublishedAt: '2026-04-20T00:00:00.000Z',
      lastPublishedAt: '2026-04-20T00:00:00.000Z',
      definition: null,
      rationale: null,
      methodology: null,
      numeratorDefinition: null,
      denominatorDefinition: null,
      numeratorDisclosureControl: null,
      denominatorDisclosureControl: null,
      caveats: null,
      notes: null,
      dataSource: null,
      numeratorSources: [],
      denominatorSources: [],
      dataValues: [],
      areaTypes: [{ name: 'UA unchanged', areaCount: 125 }],
      topics: [],
      classifications: [],
      updateSummaries: [],
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
            loader: () =>
              indicatorPage({
                detail,
                comparedDetail: undefined,
                complete: true,
                comparison: {
                  compareAreasData: [],
                  comparedAreasData: [],
                  compareAreaOptions: [],
                  compareAreaGroup: '',
                  comparisonDisplayGroups: [],
                },
                data: {
                  displayGroups: [],
                  findResults: [],
                  findSubject: '',
                  areasLimited: false,
                  selectedAreas: [
                    { code: 'E06000052', name: 'Cornwall', level: 'Local authorities' },
                  ],
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
                        'england:upper': [rangePeriod],
                        'region:E12000009:upper': [rangePeriod],
                      },
                    },
                  ],
                  selection: {
                    areaCodes: ['E06000052'],
                    areaLevels: [],
                    shortIds: [108],
                  },
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
    const tableOptions = screen
      .getByRole('button', { name: 'Table columns' })
      .closest<HTMLElement>('.fphd-filter-card');
    if (!tableOptions) throw new Error('Table options missing');
    const benchmarks = screen
      .getByRole('button', { name: 'Benchmarks' })
      .closest<HTMLElement>('.fphd-filter-card');
    if (!benchmarks) throw new Error('Benchmarks card missing');
    const england = within(benchmarks).getByRole('checkbox', { name: 'England' });
    const table = within(screen.getByRole('table', { name: /^Table:/ }));
    expect(table.queryByRole('columnheader', { name: 'England' })).toBeNull();

    fireEvent.click(england);
    expect(await table.findByRole('columnheader', { name: 'England' })).toBeTruthy();

    // The benchmark brings its spread and the comparison chart by default.
    const trend = within(screen.getByRole('table', { name: /^Table:/ }));
    expect(trend.getByRole('columnheader', { name: 'Lowest' })).toBeTruthy();
    expect(trend.getByRole('columnheader', { name: 'Highest' })).toBeTruthy();
    expect(trend.getByRole('columnheader', { name: 'Compared with England' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '300.1' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '500.9' })).toBeTruthy();
    expect(
      screen.getByText(
        /Value: 395.6.*Area: Cornwall.*Value: 410.3.*Area: England.*Lowest to highest: 300.1.*500.9/,
      ),
    ).toBeTruthy();

    // Switching off the minimum and maximum leaves the chart in place.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Minimum/Maximum values' }));
    await waitFor(() => expect(trend.queryByRole('columnheader', { name: 'Lowest' })).toBeNull());
    expect(trend.getByRole('columnheader', { name: 'Compared with England' })).toBeTruthy();

    // The statistical-region benchmark takes the parent region's name and values.
    fireEvent.click(within(benchmarks).getByRole('checkbox', { name: 'Statistical regions' }));
    expect(
      await screen.findByRole('columnheader', { name: 'South West (Statistical region)' }),
    ).toBeTruthy();
    expect(screen.getByRole('cell', { name: '400.2' })).toBeTruthy();
    expect(trend.getByRole('columnheader', { name: 'England' })).toBeTruthy();
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

  it('shows the environment banner and feedback link from the root loader', async () => {
    const Routes = createRoutesStub([
      {
        id: 'root',
        path: '/',
        Component: PublicApp,
        loader: () => ({ environmentName: 'Dev', feedbackMailbox: 'feedback@example.com' }),
        children: [{ index: true, Component: PublicHomePage }],
      },
    ]);

    render(<Routes initialEntries={['/']} />);

    expect((await screen.findByRole('region', { name: 'Environment' })).textContent).toContain(
      'Dev',
    );
    expect(screen.getByRole('link', { name: 'feedback@example.com' }).getAttribute('href')).toBe(
      'mailto:feedback@example.com',
    );
  });

  it('keeps the environment banner on an error page when the root loader ran', async () => {
    const Routes = createRoutesStub([
      {
        id: 'root',
        path: '/',
        Component: PublicApp,
        ErrorBoundary,
        loader: () => ({ environmentName: 'Test', feedbackMailbox: undefined }),
        children: [
          {
            path: 'topics/:slug',
            Component: TopicRoute,
            loader: () => {
              throw new Error('The API is down');
            },
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/topics/diabetes']} />);

    expect(
      await screen.findByRole('heading', { name: 'Sorry, there is a problem with the service' }),
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Environment' }).textContent).toContain('Test');
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

  it('home page renders search form and Browse all data card', async () => {
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
    expect(screen.getByText('For example, diabetes or mental health')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse all data' }).getAttribute('href')).toBe(
      '/search',
    );
  });

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
    expect(screen.getByRole('heading', { name: 'Indicator filters' })).toBeTruthy();
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
    const body = document.querySelector('.fphd-topic-indicator-filters .fphd-filter-card__footer');
    expect(body).toBeTruthy();
    expect(body?.querySelector('input[type=checkbox]')).toBeTruthy();
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
    const selectedTopic = screen.getByRole('checkbox', { name: 'Mortality' });
    expect((selectedTopic as HTMLInputElement).checked).toBe(true);
    expect(selectedTopic.closest('.fphd-collapsible-body')?.hasAttribute('hidden')).toBe(false);
  });

  it('links to the other pages of results when they fill more than one', async () => {
    const pagedData = {
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
    };

    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'search',
            Component: SearchRoute,
            loader: () => pagedData,
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/search']} />);

    const pages = await screen.findByRole('navigation', { name: 'Search results pages' });
    expect(within(pages).getByRole('link', { name: '7' }).getAttribute('href')).toBe(
      '/search?page=7',
    );
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });
});

describe('error page titles', () => {
  // createRoutesStub ignores the root's Layout, which renders Meta in the app, so the root
  // route's component and error boundary render Meta here instead.
  function routesWithMeta(loader: () => never) {
    return createRoutesStub([
      {
        id: 'root',
        path: '/',
        meta,
        Component: () => (
          <>
            <Meta />
            <PublicApp />
          </>
        ),
        ErrorBoundary: () => (
          <>
            <Meta />
            <ErrorBoundary />
          </>
        ),
        children: [{ path: 'topics/:slug', Component: TopicRoute, loader }],
      },
    ]);
  }

  async function titlesAndHeading() {
    const heading = await screen.findByRole('heading', { level: 1 });
    const titles = [...document.head.querySelectorAll('title')].map((title) => title.textContent);
    return { heading: heading.textContent, titles };
  }

  it('titles the not-found page from a loader 404 after its heading', async () => {
    const Routes = routesWithMeta(() => {
      throw new Response('Not Found', { status: 404 });
    });

    render(<Routes initialEntries={['/topics/no-such-topic']} />);

    const { heading, titles } = await titlesAndHeading();
    expect(heading).toBe('Page not found');
    expect(titles).toEqual([`${heading} - ${serviceName} - GOV.UK`]);
  });

  it('titles the error page after its heading when a loader fails', async () => {
    const Routes = routesWithMeta(() => {
      throw new Error('The API is down');
    });

    render(<Routes initialEntries={['/topics/diabetes']} />);

    const { heading, titles } = await titlesAndHeading();
    expect(heading).toBe('Sorry, there is a problem with the service');
    expect(titles).toEqual([`${heading} - ${serviceName} - GOV.UK`]);
  });
});
