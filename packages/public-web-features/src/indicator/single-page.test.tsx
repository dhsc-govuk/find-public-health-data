// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { createRoutesStub, useLocation, useNavigate, useNavigation } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { loadScatterComparison } from './charts/scatter-loader.ts';
import { compactIndicator, compactScatterComparison } from './compact-data.ts';
import { indicatorComparisonModel } from './comparison-model.ts';
import { indicatorPair } from './indicator-pair.ts';
import type { IndicatorDetail, SelectedIndicator } from './loader.ts';
import { IndicatorRoute } from './route.tsx';
import { SingleIndicatorPage } from './single-page.tsx';

afterEach(cleanup);

function selected(shortId: number, name: string, value: number): SelectedIndicator {
  const detail = {
    goal: null,
    shortId,
    slug: `indicator-${shortId}`,
    name,
    valueType: 'Proportion',
    unit: '%',
    yearType: null,
    updateFrequency: 'annually',
    updateFrequencyReason: null,
    updateFrequencyText: null,
    polarity: 'no-comparison-possible',
    ciMethod: null,
    ciConfidenceLevel: null,
    comparatorMethod: null,
    dataUpdatedAt: '2026-04-20T00:00:00Z',
    firstPublishedAt: '2026-04-20T00:00:00.000Z',
    lastPublishedAt: '2026-04-20T00:00:00.000Z',
    definition: `${name} definition`,
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
    areaTypes: [],
    topics: [{ slug: 'diabetes', title: 'Diabetes' }],
    classifications: [],
    updateSummaries: [],
  } as IndicatorDetail;
  return {
    detail,
    areaData: [
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [
          {
            fromDate: '2024-04-01',
            toDate: '2025-03-31',
            value,
            lowerCi95: value - 0.1,
            upperCi95: value + 0.1,
            lowerCi998: null,
            upperCi998: null,
            count: 100,
            denominator: 1000,
            notes: [],
            dimensions: [],
          },
        ],
      },
    ],
  };
}

function page(
  entries: SelectedIndicator[],
  url: string,
  areas: SelectedIndicator['areaData'] = [],
  history?: Promise<never>,
  search?: Promise<never>,
) {
  const primary = entries[0];
  if (!primary) throw new Error('Indicator fixture missing');
  const scatter = loadScatterComparison(entries, new URL(url, 'http://localhost').searchParams);
  const Routes = createRoutesStub([
    {
      path: 'indicator/:slug',
      Component: () => (
        <SingleIndicatorPage
          detail={entries[0]?.detail as IndicatorDetail}
          dataPlaceholder={null}
          comparedDetail={entries[1]?.detail}
          findSubject={search ? 'mortality' : ''}
          findResults={search ?? []}
          data={
            history ?? {
              selected: entries.slice(0, 1).map(compactIndicator),
              selectedAreas: [],
              displayGroups: [],
              benchmarkGeography: { regionByCode: {}, levelByCode: {} },
              findSubject: '',
              findResults: [],
              geographyOptions: undefined,
              areasLimited: false,
              defaultAreaLevel: undefined,
              selection: {
                areaCodes: [],
                areaLevels: [],
                shortIds: entries.map(({ detail }) => detail.shortId),
              },
            }
          }
          comparison={{
            areaChart: compactIndicator({
              ...primary,
              areaData: [...areas, ...(entries[0]?.areaData ?? [])],
            }),
            compareAreaRanges: [],
            scatter: scatter ? compactScatterComparison(scatter) : undefined,
            ...indicatorComparisonModel(entries, {
              compareAreasData: areas,
              comparedAreasData: [],
              compareAreaOptions: [],
              compareAreaGroup: 'Local authorities',
              comparisonDisplayGroups: [],
            }),
          }}
        />
      ),
    },
  ]);
  render(<Routes initialEntries={[url]} />);
}

it('opens one indicator with the five prototype tabs and no selection controls', () => {
  page([selected(241, 'Diabetes prevalence', 7.9)], '/indicator/indicator-241');
  expect(screen.getByRole('heading', { level: 1, name: 'Diabetes prevalence' })).toBeTruthy();
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
    'Indicator',
    'Compare areas',
    'Compare indicators',
    'Inequalities',
    'About this indicator',
  ]);
  expect(screen.queryByRole('button', { name: 'View selected indicators' })).toBeNull();
  expect(screen.queryByRole('checkbox', { name: 'Diabetes prevalence' })).toBeNull();
  expect(
    within(screen.getByRole('tabpanel', { name: 'Indicator' })).getByRole('region', {
      name: 'Diabetes prevalence trend chart',
    }).textContent,
  ).not.toContain('View chart data as a table');
});

it('shows the definition below the heading, before the summary and with no label', () => {
  page([selected(241, 'Diabetes prevalence', 7.9)], '/indicator/indicator-241');

  const heading = screen.getByRole('heading', { level: 1, name: 'Diabetes prevalence' });
  const definition = screen.getByText('Diabetes prevalence definition');
  expect(heading.className).toContain('govuk-!-margin-bottom-5');
  expect(heading.nextElementSibling?.contains(definition)).toBe(true);
  expect(heading.nextElementSibling?.nextElementSibling?.className).toContain(
    'fphd-indicator-summary',
  );
  expect(screen.getAllByRole('term').map((term) => term.textContent)).not.toContain('Definition');
});

it("reads a placeholder in each data section of a preview's draft with no data to show", async () => {
  const { detail } = selected(241, 'Diabetes prevalence', 7.9);
  const Routes = createRoutesStub([
    {
      path: 'indicator/:slug',
      Component: () => (
        <SingleIndicatorPage
          detail={{ ...detail, dataState: 'no-upload', unanswered: [] }}
          dataPlaceholder="[Not provided yet]"
        />
      ),
    },
  ]);
  render(<Routes initialEntries={['/indicator/indicator-241']} />);

  expect(
    (await screen.findByRole('heading', { level: 1, name: 'Diabetes prevalence' })).textContent,
  ).toBe('Diabetes prevalence');
  expect(screen.getByText('Diabetes prevalence definition')).toBeTruthy();
  for (const name of ['Indicator', 'Compare areas', 'Compare indicators', 'Inequalities']) {
    expect(screen.getByRole('tabpanel', { name, hidden: true }).textContent).toBe(
      '[Not provided yet]',
    );
  }
  expect(
    within(screen.getByRole('tabpanel', { name: 'About this indicator', hidden: true })).getByRole(
      'heading',
      { name: 'Data attributes' },
    ),
  ).toBeTruthy();
});

it.each([
  [79, true],
  [null, false],
])('offers a Count column for count %s only where the data has one', (count, offered) => {
  const rate = selected(241, 'Diabetes prevalence', 7.9);
  rate.areaData = rate.areaData.map((area) => ({
    ...area,
    observations: area.observations.map((observation) => ({ ...observation, count })),
  }));
  page([rate], '/indicator/indicator-241');

  const columns = within(screen.getByRole('tabpanel', { name: 'Indicator' }));

  // The columns sit in the collapsed display options.
  expect(columns.queryAllByRole('checkbox', { name: 'Count', hidden: true })).toHaveLength(
    offered ? 1 : 0,
  );
  expect(columns.queryByRole('checkbox', { name: 'Numerator', hidden: true })).toBeNull();
});

it('keeps England as the benchmark when comparing local areas', () => {
  const primary = selected(241, 'Diabetes prevalence', 7.9);
  primary.detail.polarity = 'no-polarity';
  const england = primary.areaData[0];
  if (!england) throw new Error('England fixture missing');
  page([primary], '/indicator/indicator-241?tab-indicator=areas', [
    {
      ...england,
      areaCode: 'E06000039',
      areaName: 'Slough',
      observations: england.observations.map((observation) => ({ ...observation, value: 11 })),
    },
  ]);
  const table = within(screen.getByRole('table', { name: /Table of area comparisons/ }));
  expect(table.getByRole('rowheader', { name: 'England (benchmark)' })).toBeTruthy();
  expect(table.getByRole('rowheader', { name: 'Slough' })).toBeTruthy();
  expect(table.getByRole('cell', { name: '7.9' })).toBeTruthy();
  expect(table.getByRole('cell', { name: '11.0' })).toBeTruthy();
  expect(table.getByRole('cell', { name: 'Higher' })).toBeTruthy();
  const slough = table.getByRole('rowheader', { name: 'Slough' }).closest('tr');
  const bar = slough?.querySelector('svg svg rect');
  expect(bar?.getAttribute('fill')).toBe('#0E3F69');
  expect(Number(bar?.getAttribute('width'))).toBeCloseTo((11 / 15) * 100);
  const chart = within(screen.getByRole('tabpanel', { name: 'Compare areas' })).getByRole(
    'region',
    {
      name: /^Compare areas: Diabetes prevalence/,
    },
  );
  expect(chart.textContent).not.toContain('View chart data as a table');
  expect(screen.getByLabelText('Colour areas by')).toBeTruthy();
});

it('shows one compared indicator in an area-aligned comparison table', () => {
  page(
    [selected(241, 'Diabetes prevalence', 7.9), selected(93995, 'Diabetes mortality', 109.6)],
    '/indicator/indicator-241?compareWith=93995',
  );
  expect(
    screen.getByRole('tab', { name: 'Compare indicators' }).getAttribute('aria-selected'),
  ).toBe('true');
  expect(screen.getByRole('table', { name: /Table of indicator comparison/ })).toBeTruthy();
  expect(
    within(screen.getByRole('tabpanel', { name: 'Compare indicators' })).getByRole('region', {
      name: 'Indicator comparison scatter chart',
    }).textContent,
  ).toContain('Table of indicator comparison');
  expect(screen.getByRole('heading', { name: 'Chart of indicator comparison' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Swap axis' })).toBeTruthy();
  expect(
    within(screen.getByRole('table', { name: /Table of indicator comparison/ })).getByRole(
      'rowheader',
      { name: 'England' },
    ),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Clear search' }).getAttribute('href')).toBe(
    '/indicator/indicator-241?tab-indicator=compare',
  );
});

it('labels cached scatter axes in the order requested by a saved comparison link', () => {
  page(
    [selected(241, 'Diabetes prevalence', 7.9), selected(93995, 'Diabetes mortality', 109.6)],
    '/indicator/indicator-241?compareWith=93995&scatter-x=93995&scatter-y=241',
  );
  const chart = within(screen.getByRole('region', { name: 'Indicator comparison scatter chart' }));
  const table = within(chart.getByRole('table', { hidden: true }));
  expect(
    table.getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent),
  ).toEqual(['Area', 'Diabetes mortality (2024/25)', 'Diabetes prevalence (2024/25)']);
  expect(table.getAllByRole('cell', { hidden: true }).map((cell) => cell.textContent)).toEqual([
    '109.6%',
    '7.9%',
  ]);
});

it('keeps England alongside the shared local-area range and aligns values by area code', () => {
  const first = selected(241, 'Prevalence', 7.9);
  const second = selected(93995, 'Mortality', 109.6);
  const local = (indicator: SelectedIndicator, code: string, name: string, value: number) => ({
    areaCode: code,
    areaName: name,
    observations:
      indicator.areaData[0]?.observations.map((observation) => ({ ...observation, value })) ?? [],
  });
  first.areaData.push(
    local(first, 'E06000039', 'Slough', 11),
    local(first, 'E06000040', 'Windsor', 5),
  );
  second.areaData.push(
    local(second, 'E06000040', 'Windsor', 60),
    local(second, 'E06000039', 'Slough', 120),
  );
  const model = indicatorPair([first, second]);
  expect(model.england?.values).toEqual([7.9, 109.6]);
  expect(model.areas.map(({ name, values }) => [name, values])).toEqual([
    ['Slough', [11, 120]],
    ['Windsor', [5, 60]],
  ]);
  expect(model.range).toEqual(['5.0% to 11.0%', '60.0% to 120.0%']);
});

it('replaces deferred comparison models after changing geography', async () => {
  const primary = selected(241, 'Diabetes prevalence', 7.9);
  const Routes = createRoutesStub([
    {
      path: 'indicator/:slug',
      Component: IndicatorRoute,
      loader: ({ request }) => {
        const regions = new URL(request.url).searchParams.get('areaType') === 'Statistical regions';
        const areas = [
          {
            areaCode: regions ? 'E12000007' : 'E06000039',
            areaName: regions ? 'London' : 'Slough',
            observations: primary.areaData[0]?.observations ?? [],
          },
        ];
        return {
          detail: primary.detail,
          dataPlaceholder: null,
          comparedDetail: undefined,
          complete: false,
          findSubject: '',
          findResults: [],
          data: Promise.resolve({
            selected: [compactIndicator(primary)],
            selectedAreas: [],
            displayGroups: [],
            benchmarkGeography: { regionByCode: {}, levelByCode: {} },
            findSubject: '',
            findResults: [],
            geographyOptions: undefined,
            areasLimited: false,
            defaultAreaLevel: undefined,
            selection: { areaCodes: [], areaLevels: [], shortIds: [241] },
          }),
          comparison: Promise.resolve({
            areaChart: compactIndicator({ ...primary, areaData: [...areas, ...primary.areaData] }),
            compareAreaRanges: [],
            scatter: undefined,
            ...indicatorComparisonModel([primary], {
              compareAreasData: areas,
              comparedAreasData: [],
              compareAreaOptions: [],
              compareAreaGroup: regions ? 'Statistical regions' : 'Local authorities',
              comparisonDisplayGroups: ['Local authorities', 'Statistical regions'],
            }),
          }),
        };
      },
    },
  ]);
  render(<Routes initialEntries={['/indicator/indicator-241?tab-indicator=areas']} />);
  expect(
    await within(
      await screen.findByRole('table', { name: /Table of area comparisons/ }),
    ).findByRole('rowheader', { name: 'Slough' }),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Type of geography' }), {
    target: { value: 'Statistical regions' },
  });
  expect(
    await within(
      await screen.findByRole('table', { name: /Table of area comparisons/ }),
    ).findByRole('rowheader', { name: 'London' }),
  ).toBeTruthy();
  expect(screen.queryByRole('rowheader', { name: 'Slough' })).toBeNull();
});

it('keeps benchmark controls interactive while replacement indicator data is deferred', async () => {
  const primary = selected(108, 'Mortality', 100);
  const england = primary.areaData[0];
  if (!england) throw new Error('England fixture missing');
  primary.areaData.unshift({ ...england, areaCode: 'E08000003', areaName: 'Manchester' });
  const data = {
    selected: [compactIndicator(primary)],
    selectedAreas: [{ code: 'E08000003', name: 'Manchester', level: 'Local authorities' }],
    displayGroups: [],
    benchmarkGeography: {
      regionByCode: { E08000003: { code: 'E12000002', name: 'North West' } },
      levelByCode: { E08000003: 'Local authorities' },
    },
    findSubject: '',
    findResults: [],
    geographyOptions: undefined,
    areasLimited: false,
    defaultAreaLevel: undefined,
    selection: { areaCodes: ['E08000003'], areaLevels: [], shortIds: [108] },
  };
  const pending = Promise.withResolvers<typeof data>();
  const Routes = createRoutesStub([
    {
      path: 'indicator/:slug',
      Component: () => {
        const location = useLocation();
        const navigation = useNavigation();
        const [resolve, setResolve] = useState<typeof data | Promise<typeof data>>(data);
        return (
          <>
            <button type="button" onClick={() => setResolve(pending.promise)}>
              Load benchmark data
            </button>
            <SingleIndicatorPage
              detail={primary.detail}
              dataPlaceholder={null}
              comparedDetail={undefined}
              data={resolve}
              findSubject=""
              findResults={[]}
              comparison={{
                areaChart: compactIndicator(primary),
                compareAreaRanges: [],
                scatter: undefined,
                ...indicatorComparisonModel([primary], {
                  compareAreasData: [],
                  comparedAreasData: [],
                  compareAreaOptions: [],
                  compareAreaGroup: 'Local authorities',
                  comparisonDisplayGroups: [],
                }),
              }}
            />
            <output data-testid="location">{navigation.location?.search ?? location.search}</output>
          </>
        );
      },
    },
  ]);
  render(<Routes initialEntries={['/indicator/indicator-108?as=E08000003']} />);
  const checkbox = await screen.findByRole('checkbox', { name: 'England' });
  fireEvent.click(checkbox);
  await waitFor(() =>
    expect(screen.getByTestId('location').textContent).toContain('cmp-108=england'),
  );
  expect(screen.getByRole('checkbox', { name: 'England' })).toBe(checkbox);
  expect((checkbox as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Load benchmark data' }));
  expect(screen.getByRole('checkbox', { name: 'England' })).toBe(checkbox);
  expect(screen.queryByText('Loading indicator data…')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Statistical regions' }));
  await waitFor(() =>
    expect(
      new URLSearchParams(screen.getByTestId('location').textContent ?? '').getAll('cmp-108'),
    ).toEqual(['england', 'region']),
  );
  await act(async () =>
    pending.resolve({
      ...data,
      selected: [
        compactIndicator({
          ...primary,
          areaData: primary.areaData.map((area) =>
            area.areaCode === 'E08000003'
              ? {
                  ...area,
                  observations: area.observations.map((point) => ({ ...point, value: 101 })),
                }
              : area,
          ),
        }),
      ],
    }),
  );
  expect(
    within(screen.getByRole('table', { name: /^Table:/ })).getByRole('cell', { name: '101.0%' }),
  ).toBeTruthy();
});

it('keeps a geography unchecked when earlier benchmark data resolves during navigation', async () => {
  const primary = selected(108, 'Mortality', 100);
  const england = primary.areaData[0];
  if (!england) throw new Error('England fixture missing');
  primary.areaData.unshift({ ...england, areaCode: 'E08000003', areaName: 'Manchester' });
  const level = 'Upper-tier local authorities';
  const data = {
    selected: [compactIndicator(primary)],
    selectedAreas: [{ code: 'E08000003', name: 'Manchester', level }],
    displayGroups: [level],
    benchmarkGeography: { regionByCode: {}, levelByCode: {} },
    geographyOptions: {
      query: '',
      level,
      groups: [{ name: level, areas: [{ code: 'E08000003', name: 'Manchester' }] }],
      error: false,
    },
    areasLimited: false,
    defaultAreaLevel: undefined,
    selection: { areaCodes: ['E08000003'], areaLevels: [], shortIds: [108] },
  };
  const benchmark = Promise.withResolvers<typeof data>();
  const removal = Promise.withResolvers<never>();
  const Routes = createRoutesStub([
    {
      path: 'indicator/:slug',
      HydrateFallback: () => null,
      loader: ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (!params.has('as')) return removal.promise;
        return {
          detail: primary.detail,
          comparedDetail: undefined,
          findSubject: '',
          findResults: [],
          data: params.get('cmp-108') === 'england' ? data : benchmark.promise,
          comparison: {
            areaChart: compactIndicator(primary),
            compareAreaRanges: [],
            scatter: undefined,
            ...indicatorComparisonModel([primary], {
              compareAreasData: [],
              comparedAreasData: [],
              compareAreaOptions: [],
              compareAreaGroup: level,
              comparisonDisplayGroups: [],
            }),
          },
        };
      },
      Component: () => {
        const location = useLocation();
        const navigation = useNavigation();
        const navigate = useNavigate();
        return (
          <>
            <IndicatorRoute />
            <button type="button" onClick={() => navigate(-1)}>
              Previous selection
            </button>
            <output data-testid="location">{navigation.location?.search ?? location.search}</output>
          </>
        );
      },
    },
  ]);
  render(<Routes initialEntries={['/indicator/indicator-108?as=E08000003&cmp-108=england']} />);
  const manchester = await screen.findByRole('checkbox', { name: 'Manchester' });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'England' }));
  await waitFor(() =>
    expect(
      new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('cmp-108'),
    ).toBe(''),
  );
  fireEvent.click(manchester);
  await waitFor(() =>
    expect(new URLSearchParams(screen.getByTestId('location').textContent ?? '').has('as')).toBe(
      false,
    ),
  );
  expect((manchester as HTMLInputElement).checked).toBe(false);
  await act(async () => benchmark.resolve(structuredClone(data)));
  expect(screen.getByRole('checkbox', { name: 'Manchester' })).toBe(manchester);
  expect((manchester as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Previous selection' }));
  await waitFor(() => expect((manchester as HTMLInputElement).checked).toBe(true));
});

it('keeps comparison tables and the search form available while search loads or fails', async () => {
  const search = Promise.withResolvers<never>();
  page(
    [selected(241, 'Diabetes prevalence', 7.9), selected(108, 'Mortality', 109.6)],
    '/indicator/indicator-241?compareWith=108&find=mortality',
    [],
    undefined,
    search.promise,
  );
  expect(screen.getByText('Loading indicator search results…')).toBeTruthy();
  expect(screen.getByLabelText('Search for an indicator')).toBeTruthy();
  expect(screen.getByRole('table', { name: /Table of indicator comparison/ })).toBeTruthy();
  await act(async () => search.reject(new Error('Search unavailable')));
  expect(await screen.findByText(/indicator search results could not be loaded/)).toBeTruthy();
  expect(screen.getByRole('table', { name: /Table of indicator comparison/ })).toBeTruthy();
  expect(screen.queryByText(/indicator comparisons could not be loaded/)).toBeNull();
  expect(screen.queryByText(/area comparisons could not be loaded/)).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Compare areas' }));
  expect(screen.getByRole('rowheader', { name: 'England (benchmark)' })).toBeTruthy();
});

it('renders area and indicator comparisons when primary history fails', async () => {
  const history = Promise.withResolvers<never>();
  page(
    [selected(241, 'Diabetes prevalence', 7.9), selected(108, 'Mortality', 109.6)],
    '/indicator/indicator-241?compareWith=108',
    [],
    history.promise,
  );
  expect(
    within(screen.getByRole('table', { name: /Table of indicator comparison/ })).getByRole(
      'rowheader',
      { name: 'England' },
    ),
  ).toBeTruthy();
  await act(async () => history.reject(new Error('History unavailable')));
  expect(
    within(screen.getByRole('table', { name: /Table of indicator comparison/ })).getByRole(
      'rowheader',
      { name: 'England' },
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Compare areas' }));
  expect(await screen.findByRole('rowheader', { name: 'England (benchmark)' })).toBeTruthy();
});
