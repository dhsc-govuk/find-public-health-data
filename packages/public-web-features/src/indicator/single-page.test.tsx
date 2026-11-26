// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ComponentProps, useState } from 'react';
import { createRoutesStub, useLocation, useNavigate, useNavigation } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { loadScatterComparison } from './charts/scatter-loader.ts';
import { compactIndicator, compactScatterComparison } from './compact-data.ts';
import { indicatorComparisonModel } from './comparison-model.ts';
import { indicatorPair } from './indicator-pair.ts';
import { sexedInequalities } from './inequalities.testing.ts';
import type { IndicatorDetail, SelectedIndicator } from './loader.ts';
import { IndicatorRoute } from './route.tsx';
import { SingleIndicatorPage } from './single-page.tsx';
import { deprivation } from './view.testing.ts';

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
    updateFrequencyYears: null,
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
    numeratorDisclosureControl: null,
    denominatorDisclosureControl: null,
    caveats: null,
    notes: null,
    dataSource: null,
    numeratorSources: [],
    denominatorSources: [],
    dataValues: [],
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

function pageProps(
  entries: SelectedIndicator[],
  url: string,
  areas: SelectedIndicator['areaData'] = [],
  history?: Promise<never>,
  search?: Promise<never>,
  englandOnly = false,
): Extract<ComponentProps<typeof SingleIndicatorPage>, { dataPlaceholder: null }> {
  const primary = entries[0];
  if (!primary) throw new Error('Indicator fixture missing');
  const scatter = loadScatterComparison(entries, new URL(url, 'http://localhost').searchParams);
  return {
    detail: entries[0]?.detail as IndicatorDetail,
    dataPlaceholder: null,
    comparedDetail: entries[1]?.detail,
    findSubject: search ? 'mortality' : '',
    findResults: search ?? [],
    data: history ?? {
      selected: entries.slice(0, 1).map(compactIndicator),
      selectedAreas: [],
      displayGroups: [],
      benchmarkGeography: { regionByCode: {}, levelByCode: {} },
      findSubject: '',
      findResults: [],
      geographyOptions: undefined,
      areasLimited: false,
      defaultAreaLevel: undefined,
      areaTypeNotice: undefined,
      selection: {
        areaCodes: [],
        areaLevels: [],
        shortIds: entries.map(({ detail }) => detail.shortId),
      },
    },
    comparison: {
      areaChart: compactIndicator({
        ...primary,
        areaData: [...areas, ...(entries[0]?.areaData ?? [])],
      }),
      compareAreaRanges: [],
      scatter: scatter ? compactScatterComparison(scatter) : undefined,
      englandOnly,
      ...indicatorComparisonModel(entries, {
        compareAreasData: areas,
        comparedAreasData: [],
        compareAreaOptions: [],
        compareAreaGroup: englandOnly ? '' : 'Local authorities',
        comparisonDisplayGroups: [],
      }),
    },
  };
}

function page(...args: Parameters<typeof pageProps>) {
  const props = pageProps(...args);
  const Routes = createRoutesStub([
    { path: 'indicator/:slug', Component: () => <SingleIndicatorPage {...props} /> },
  ]);
  render(<Routes initialEntries={[args[1]]} />);
}

it.each([
  ['Male', '42.0%'],
  ['Female', '22.0%'],
] as const)(
  'carries the Indicator %s choice through tab navigation to inequalities and its CSV link',
  async (sexValue, value) => {
    page([sexedInequalities()], '/indicator/indicator-90632');
    const indicator = screen.getByRole('tabpanel', { name: 'Indicator' });
    const select = within(indicator).getAllByLabelText('Select sex')[0] as HTMLSelectElement;
    fireEvent.change(select, { target: { value: sexValue } });
    await waitFor(() => expect(select.value).toBe(sexValue));
    fireEvent.click(screen.getByRole('tab', { name: 'Inequalities' }));
    const inequalities = screen.getByRole('tabpanel', { name: 'Inequalities' });
    fireEvent.click(within(inequalities).getByLabelText('Ethnic groups'));
    const white = await within(inequalities).findByText('White', { selector: 'th' });
    expect(white.closest('tr')?.textContent).toContain(value);
    const href = within(inequalities)
      .getByText("Download data for the areas you've chosen (CSV)")
      .getAttribute('href');
    const params = new URL(href ?? '', 'http://localhost').searchParams;
    expect(params.get('sex-90632')).toBe(sexValue);
    expect(params.get('tab-indicator')).toBe('inequalities');
  },
);

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

it('leaves the data tabs out of a metadata-only preview, keeping About this indicator', async () => {
  const { detail } = selected(241, 'Diabetes prevalence', 7.9);
  const Routes = createRoutesStub([
    {
      path: 'indicator/:slug',
      Component: () => (
        <SingleIndicatorPage
          detail={{ ...detail, dataState: 'metadata-only', unanswered: [] }}
          dataPlaceholder="[Not shown in this preview]"
        />
      ),
    },
  ]);
  render(<Routes initialEntries={['/indicator/indicator-241']} />);

  await screen.findByRole('heading', { level: 1, name: 'Diabetes prevalence' });
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
    'About this indicator',
  ]);
  expect(
    within(screen.getByRole('tabpanel', { name: 'About this indicator' })).getByRole('heading', {
      name: 'Data attributes',
    }),
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
    areaTypeNotice: undefined,
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
                englandOnly: false,
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
    areaTypeNotice: undefined,
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

/** Each heading in a tab panel as its level and accessible name, in page order. */
function headingOutline(panel: HTMLElement) {
  return within(panel)
    .getAllByRole('heading')
    .map(
      (heading) =>
        `h${heading.tagName.slice(1)} ${heading.getAttribute('aria-label') ?? heading.textContent}`,
    );
}

it.each([
  [
    'Indicator',
    'tab-indicator=indicator',
    ['h2 Indicator', 'h2 Geographies', 'h2 Display options', 'h3 Table columns'],
    ['h2 Chart: Diabetes prevalence'],
  ],
  [
    'Compare areas',
    'tab-indicator=areas',
    ['h2 Compare areas', 'h2 Geographies', 'h2 Display options', 'h3 Table and map options'],
    ['h2 Map view', 'h2 Chart of area comparison', 'h3 2024/25'],
  ],
  [
    'Compare indicators',
    'compareWith=93995',
    ['h2 Compare indicators', 'h2 Geographies'],
    ['h2 Chart of indicator comparison'],
  ],
  [
    'Inequalities',
    'tab-indicator=inequalities',
    ['h2 Inequalities', 'h2 Geographies', 'h2 Display options', 'h3 Chart options'],
    ['h2 Chart of inequalities: Diabetes prevalence, England'],
  ],
])(
  'names each heading once on the %s tab, with its charts beside the options, not under them',
  (name, query, sidebar, charts) => {
    const primary = selected(241, 'Diabetes prevalence', 7.9);
    const england = primary.areaData[0];
    const latest = england?.observations[0];
    if (!england || !latest) throw new Error('England fixture missing');
    england.observations.push(
      { ...latest, value: 9.1, dimensions: [deprivation] },
      { ...latest, value: 6.2, dimensions: [{ ...deprivation, value: 'Least deprived' }] },
    );
    page(
      [primary, selected(93995, 'Diabetes mortality', 109.6)],
      `/indicator/indicator-241?${query}`,
      [{ ...england, areaCode: 'E06000039', areaName: 'Slough' }],
    );

    const outline = headingOutline(screen.getByRole('tabpanel', { name }));
    expect(outline).toEqual([...sidebar, ...charts]);
    expect(new Set(outline.map((heading) => heading.slice(3))).size).toBe(outline.length);
  },
);

it('moves focus from the skip link to the chart heading without changing the URL hash', () => {
  page([selected(241, 'Diabetes prevalence', 7.9)], '/indicator/indicator-241');
  const panel = within(screen.getByRole('tabpanel', { name: 'Indicator' }));

  fireEvent.click(panel.getByRole('link', { name: 'Skip to indicator chart and table' }));

  expect(document.activeElement).toBe(
    panel.getByRole('heading', { level: 2, name: 'Chart: Diabetes prevalence' }),
  );
  expect(window.location.hash).toBe('');
});

it('moves focus from the skip link to the no-data message when there is nothing to chart', () => {
  const primary = selected(241, 'Diabetes prevalence', 7.9);
  page([{ ...primary, areaData: [] }], '/indicator/indicator-241');
  const panel = within(screen.getByRole('tabpanel', { name: 'Indicator' }));

  fireEvent.click(panel.getByRole('link', { name: 'Skip to indicator chart and table' }));

  expect(document.activeElement).toBe(
    panel.getByText(/^This indicator has no England-level figure/),
  );
});

it('says England is the only geography on Compare areas, without the text naming an area type', () => {
  page(
    [selected(241, 'Diabetes prevalence', 7.9)],
    '/indicator/indicator-241?tab-indicator=areas',
    [],
    undefined,
    undefined,
    true,
  );
  const panel = screen.getByRole('tabpanel', { name: 'Compare areas' });
  expect(within(panel).getByText('Data only available for England')).toBeTruthy();
  expect(within(panel).queryByRole('combobox', { name: 'Type of geography' })).toBeNull();
  expect(within(panel).queryByText(/for every/)).toBeNull();
  expect(within(panel).queryByText('Showing:')).toBeNull();
  expect(within(panel).queryByText(/^Map of/)).toBeNull();
});

it('says England is the only geography on Compare indicators, and names no other areas in the chart key', () => {
  page(
    [selected(108, 'Mortality', 100), selected(241, 'Diabetes prevalence', 7.9)],
    '/indicator/indicator-108?tab-indicator=compare&compareWith=241',
    [],
    undefined,
    undefined,
    true,
  );
  const panel = screen.getByRole('tabpanel', { name: 'Compare indicators' });
  expect(within(panel).getByText('Data only available for England')).toBeTruthy();
  expect(within(panel).queryByRole('combobox', { name: 'Type of geography' })).toBeNull();
  expect(
    within(within(panel).getByRole('list', { name: 'Chart key' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['England']);
});

/** England's first diabetes prevalence point, recorded for one age group. */
function ageObservation(value: string, ageFrom: string, ageUnder?: string) {
  const [point] = selected(241, 'Diabetes prevalence', 7.9).areaData[0]?.observations ?? [];
  if (!point) throw new Error('England fixture missing');
  return {
    ...point,
    dimensions: [
      {
        type: 'Age',
        value,
        dimensionClass: 'core',
        sortOrder: 0,
        ageFrom,
        ...(ageUnder ? { ageUnder } : {}),
      },
    ],
  };
}

const ageWarning =
  'These figures are for the age group 65+ yrs. This indicator also has data for other ages, which may match its title better.';

it('warns on Indicator and Compare areas when another age falls outside the one shown', () => {
  const primary = selected(241, 'Diabetes prevalence', 7.9);
  const older = ageObservation('65+ yrs', 'P65Y');
  page(
    [
      {
        ...primary,
        areaData: [
          {
            areaCode: 'E92000001',
            areaName: 'England',
            observations: [older, ageObservation('45-64 yrs', 'P45Y', 'P65Y')],
          },
        ],
      },
    ],
    '/indicator/indicator-241',
    [{ areaCode: 'E06000039', areaName: 'Slough', observations: [older] }],
  );
  for (const name of ['Indicator', 'Compare areas'])
    expect(
      within(screen.getByRole('tabpanel', { name, hidden: true })).getByText(ageWarning),
    ).toBeTruthy();
});

it("never pairs a new indicator's comparison with the previous indicator's ages", async () => {
  const url = '/indicator/indicator-241';
  const primary = selected(241, 'Diabetes prevalence', 7.9);
  const older = ageObservation('65+ yrs', 'P65Y');
  const england = (observations: (typeof older)[]) => ({
    ...primary,
    areaData: [{ areaCode: 'E92000001', areaName: 'England', observations }],
  });
  const before = {
    ...pageProps([primary], url),
    data: pageProps([england([older, ageObservation('45-64 yrs', 'P45Y', 'P65Y')])], url).data,
  };
  const after = {
    ...pageProps([england([older])], url, [
      { areaCode: 'E06000039', areaName: 'Slough', observations: [older] },
    ]),
    data: new Promise<never>(() => undefined),
  };
  let navigate: () => void = () => undefined;
  const Routes = createRoutesStub([
    {
      path: 'indicator/:slug',
      Component: () => {
        const [props, setProps] = useState(before);
        navigate = () => setProps(after);
        return <SingleIndicatorPage {...props} />;
      },
    },
  ]);
  render(<Routes initialEntries={[url]} />);
  const panel = await screen.findByRole('tabpanel', { name: 'Compare areas', hidden: true });
  expect(within(panel).queryByText(ageWarning)).toBeNull();
  const observer = new MutationObserver(() => undefined);
  observer.observe(panel, { childList: true, subtree: true });
  act(() => navigate());
  const added = observer.takeRecords().flatMap(({ addedNodes }) => [...addedNodes]);
  observer.disconnect();
  expect(added.some((node) => node.textContent?.includes(ageWarning))).toBe(false);
});

it('gives no age warning when the series shown has no age', () => {
  page([selected(241, 'Diabetes prevalence', 7.9)], '/indicator/indicator-241');
  expect(screen.queryByText(/These figures are for the age group/)).toBeNull();
});
