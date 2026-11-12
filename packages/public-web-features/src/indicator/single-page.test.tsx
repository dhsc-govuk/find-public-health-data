// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { compactIndicator } from './compact-data.ts';
import { indicatorComparisonModel } from './comparison-model.ts';
import { indicatorPair } from './indicator-pair.ts';
import type { IndicatorDetail, SelectedIndicator } from './loader.ts';
import { IndicatorRoute } from './route.tsx';
import { SingleIndicatorPage } from './single-page.tsx';

afterEach(cleanup);

function selected(shortId: number, name: string, value: number): SelectedIndicator {
  const detail = {
    shortId,
    slug: `indicator-${shortId}`,
    name,
    valueType: 'Proportion',
    unit: '%',
    yearType: null,
    updateFrequency: 'annually',
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
            numerator: null,
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
  const Routes = createRoutesStub([
    {
      path: 'indicator/:slug',
      Component: () => (
        <SingleIndicatorPage
          detail={entries[0]?.detail as IndicatorDetail}
          comparedDetail={entries[1]?.detail}
          complete={true}
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
              selection: {
                areaCodes: [],
                areaLevels: [],
                shortIds: entries.map(({ detail }) => detail.shortId),
              },
            }
          }
          comparison={{
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
  ).toContain('Data visualisation to follow');
});

it('offers the table columns for the raw numbers the indicator has', () => {
  const rate = selected(241, 'Diabetes prevalence', 7.9);
  rate.areaData = rate.areaData.map((area) => ({
    ...area,
    observations: area.observations.map((observation) => ({
      ...observation,
      count: null,
      numerator: 79,
    })),
  }));
  page([rate], '/indicator/indicator-241');

  const columns = within(screen.getByRole('tabpanel', { name: 'Indicator' }));

  // The columns sit in the collapsed display options.
  expect(columns.getByRole('checkbox', { name: 'Numerator', hidden: true })).toBeTruthy();
  expect(columns.queryByRole('checkbox', { name: 'Count', hidden: true })).toBeNull();
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
  expect(screen.getByRole('rowheader', { name: 'England (benchmark)' })).toBeTruthy();
  expect(screen.getByRole('rowheader', { name: 'Slough' })).toBeTruthy();
  const table = within(screen.getByRole('table', { name: /Table of area comparisons/ }));
  expect(table.getByRole('cell', { name: '7.9' })).toBeTruthy();
  expect(table.getByRole('cell', { name: '11.0' })).toBeTruthy();
  expect(table.getByRole('cell', { name: 'Higher' })).toBeTruthy();
  const slough = screen.getByRole('rowheader', { name: 'Slough' }).closest('tr');
  const bar = slough?.querySelector('svg rect:nth-of-type(2)');
  expect(bar?.getAttribute('fill')).toBe('#254BA4');
  expect(Number(bar?.getAttribute('width'))).toBeCloseTo((11 / 15) * 100);
  const map = within(screen.getByRole('tabpanel', { name: 'Compare areas' })).getByRole('region', {
    name: 'Diabetes prevalence map',
  });
  expect(map.textContent).toContain('Data visualisation to follow');
});

it('shows one compared indicator in an area-aligned comparison table', () => {
  page(
    [selected(241, 'Diabetes prevalence', 7.9), selected(93995, 'Diabetes mortality', 109.6)],
    '/indicator/indicator-241?compareWith=indicator-93995',
  );
  expect(
    screen.getByRole('tab', { name: 'Compare indicators' }).getAttribute('aria-selected'),
  ).toBe('true');
  expect(screen.getByRole('table', { name: /Table of indicator comparison/ })).toBeTruthy();
  expect(
    within(screen.getByRole('tabpanel', { name: 'Compare indicators' })).getByRole('region', {
      name: 'Indicator comparison scatter chart',
    }).textContent,
  ).toContain('Data visualisation to follow');
  expect(screen.getByRole('rowheader', { name: 'England' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Clear search' }).getAttribute('href')).toBe(
    '/indicator/indicator-241?tab-indicator=compare',
  );
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
            selection: { areaCodes: [], areaLevels: [], shortIds: [241] },
          }),
          comparison: Promise.resolve({
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
  expect(await screen.findByRole('rowheader', { name: 'Slough' })).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Type of geography' }), {
    target: { value: 'Statistical regions' },
  });
  expect(await screen.findByRole('rowheader', { name: 'London' })).toBeTruthy();
  expect(screen.queryByRole('rowheader', { name: 'Slough' })).toBeNull();
});

it('keeps comparison tables and the search form available while search loads or fails', async () => {
  const search = Promise.withResolvers<never>();
  page(
    [selected(241, 'Diabetes prevalence', 7.9), selected(108, 'Mortality', 109.6)],
    '/indicator/indicator-241?compareWith=indicator-108&find=mortality',
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
    '/indicator/indicator-241?compareWith=indicator-108',
    [],
    history.promise,
  );
  expect(screen.getByRole('rowheader', { name: 'England' })).toBeTruthy();
  await act(async () => history.reject(new Error('History unavailable')));
  expect(screen.getByRole('rowheader', { name: 'England' })).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Compare areas' }));
  expect(await screen.findByRole('rowheader', { name: 'England (benchmark)' })).toBeTruthy();
});
