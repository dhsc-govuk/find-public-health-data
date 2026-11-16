import { expect, it } from 'vitest';
import {
  areaColourMode,
  areaComparisonBarColour,
  areaComparisonBarMaximum,
  areaComparisonGroups,
  areaComparisonOptions,
  areaComparisonRegions,
  areaComparisonRows,
  comparisonRankingData,
  highlightedAreaCodes,
  orderAreaComparisonRows,
} from './area-comparison.ts';
import { indicatorPair } from './indicator-pair.ts';
import type { IndicatorObservation, SelectedIndicator } from './loader.ts';

it('compares counties and unitary authorities together without mixing in their districts', () => {
  const areas = ['E07000001', 'E06000001', 'E08000001', 'E09000001', 'E10000001'].map((code) => ({
    code,
  }));
  expect(areaComparisonOptions(areas, 'Local authorities').map(({ code }) => code)).toEqual(
    areas.slice(1).map(({ code }) => code),
  );
  expect(areaComparisonOptions(areas, 'Statistical regions')).toEqual(areas);
});

it('groups available areas by rank, keeps ties together, and excludes England', () => {
  const rows = [
    { areaCode: 'E92000001', value: 100 },
    { areaCode: 'a', value: 1 },
    { areaCode: 'b', value: 1 },
    { areaCode: 'c', value: 3 },
    { areaCode: 'd', value: 4 },
    { areaCode: 'missing', value: null },
  ];
  const quintiles = areaComparisonGroups(rows, 'quintiles');
  expect(quintiles.heading).toBe('Quintile');
  expect([...quintiles.labels]).toEqual([
    ['a', 'Quintile 1 (lowest)'],
    ['b', 'Quintile 1 (lowest)'],
    ['c', 'Quintile 3'],
    ['d', 'Quintile 4'],
  ]);
  expect(areaComparisonGroups(rows, 'england').heading).toBe('Compared with England');
});

function point(fromDate: string, toDate: string, value: number): IndicatorObservation {
  return {
    fromDate,
    toDate,
    value,
    count: null,
    numerator: null,
    denominator: null,
    lowerCi95: value - 0.1,
    upperCi95: value + 0.1,
    lowerCi998: null,
    upperCi998: null,
    dimensions: [],
    notes: [],
  };
}
function series(england: IndicatorObservation[], local: IndicatorObservation[]): SelectedIndicator {
  return {
    detail: { shortId: 1, name: 'Mortality', unit: 'per 100,000', yearType: null },
    areaData: [
      { areaCode: 'E92000001', areaName: 'England', observations: england },
      { areaCode: 'E06000039', areaName: 'Slough', observations: local },
    ],
  } as SelectedIndicator;
}
it('compares rolling local rates with England for the same period rather than its newer annual value', () => {
  const rolling = point('2022-01-01', '2024-12-31', 109.6);
  const annual = point('2024-01-01', '2024-12-31', 105);
  const mortality = series([rolling, annual], [point('2022-01-01', '2024-12-31', 120)]);
  const result = areaComparisonRows(mortality, mortality.areaData.slice(1), 'descending');
  expect(result.period).toBe('2022 to 2024');
  expect(result.multiYear).toBe(true);
  expect(result.england?.value).toBe(109.6);
  expect(result.england?.series).toEqual([rolling]);
  const other = series(
    [point('2024-01-01', '2024-12-31', 7.9)],
    [point('2024-01-01', '2024-12-31', 11)],
  );
  const pair = indicatorPair([other, mortality]);
  expect(pair.periods).toEqual(['2024', '2022 to 2024']);
  expect(pair.england?.values).toEqual([7.9, 109.6]);
});
it('leaves the benchmark unavailable when England has no observation for the local period', () => {
  const mortality = series(
    [point('2024-01-01', '2024-12-31', 105)],
    [point('2022-01-01', '2024-12-31', 120)],
  );
  const result = areaComparisonRows(mortality, mortality.areaData.slice(1), 'descending');
  expect(result.england?.value).toBeNull();
  expect(result.england?.series).toEqual([]);
});

it('uses one zero-based bar scale with confidence-interval headroom and prototype colours', () => {
  const indicator = series(
    [point('2024-01-01', '2024-12-31', 7.9)],
    [point('2024-01-01', '2024-12-31', 11)],
  );
  const { rows } = areaComparisonRows(indicator, indicator.areaData, 'descending');
  expect(areaComparisonBarMaximum(rows)).toBe(15);
  expect(areaComparisonBarColour('', 'england', true)).toBe('#b1b4b6');
  expect(areaComparisonBarColour('Higher', 'england', false, true)).toBe('#254BA4');
  expect(areaComparisonBarColour('Similar', 'england', false, true)).toBe('#FFFFFF');
  expect(areaComparisonBarColour('Worse', 'england', false)).toBe('#C00000');
  expect(areaComparisonBarColour('Quintile 1 (lowest)', 'quintiles', false)).toBe('#C5EEE9');
  expect(areaComparisonBarColour('Quintile 5 (highest)', 'quintiles', false)).toBe('#004842');
  expect(areaComparisonBarMaximum([])).toBe(1);
});

it('projects shared histories to the latest non-null comparison period using stored segments', () => {
  const older = point('2023-01-01', '2023-12-31', 10);
  const newer = point('2024-01-01', '2024-12-31', 12);
  const indicator = series([], []);
  indicator.areaData = [
    { areaCode: 'a', areaName: 'A', observations: [older, { ...newer, value: null }] },
    { areaCode: 'b', areaName: 'B', observations: [older, newer] },
    { areaCode: 'c', areaName: 'C', observations: [older] },
  ];
  indicator.tableSeries = [{ sex: '', periodType: 'all', segments: { a: '', b: '', c: '' } }];
  expect(comparisonRankingData(indicator).map(({ observations }) => observations)).toEqual([
    [],
    [newer],
    [],
  ]);
});

it('uses the latest local period when England alone has a newer value', () => {
  const older = point('2023-01-01', '2023-12-31', 10);
  const newer = point('2024-01-01', '2024-12-31', 12);
  const indicator = series([older, newer], [older]);
  expect(comparisonRankingData(indicator).map(({ observations }) => observations)).toEqual([
    [],
    [older],
  ]);
  indicator.areaData = indicator.areaData.slice(0, 1);
  expect(comparisonRankingData(indicator)[0]?.observations).toEqual([newer]);
});

it('offers England comparison and quintiles only, reading old quartile links as England', () => {
  expect(areaColourMode('quintiles')).toBe('quintiles');
  expect(areaColourMode('quartiles')).toBe('england');
  expect(areaColourMode(null)).toBe('england');
});

it('lists highlighted areas in the order picked, then England, then the rest by sort', () => {
  const rows = [
    { areaCode: 'E92000001', areaName: 'England', value: 5 },
    { areaCode: 'a', areaName: 'Alpha', value: 8 },
    { areaCode: 'b', areaName: 'Beta', value: 12 },
    { areaCode: 'c', areaName: 'Gamma', value: 3 },
    { areaCode: 'n', areaName: 'Nowhere', value: null },
    { areaCode: 'm', areaName: 'Missing', value: null },
  ];
  const order = (sort: string, highlighted: string[]) =>
    orderAreaComparisonRows(rows, sort, highlighted).map(({ areaCode }) => areaCode);
  expect(order('descending', [])).toEqual(['E92000001', 'b', 'a', 'c', 'm', 'n']);
  expect(order('ascending', [])).toEqual(['E92000001', 'c', 'a', 'b', 'm', 'n']);
  expect(order('alphabetical', [])).toEqual(['E92000001', 'a', 'b', 'c', 'm', 'n']);
  expect(order('descending', ['c', 'a', 'c', 'E92000001', 'gone'])).toEqual([
    'c',
    'a',
    'E92000001',
    'b',
    'm',
    'n',
  ]);
});

it('groups comparison areas under their regions and expands region ticks sent without scripting', () => {
  const northEast = { code: 'E12000001', name: 'North East' };
  const london = { code: 'E12000007', name: 'London' };
  const areas = [
    { code: 'E09000001', name: 'City of London', parent: london },
    { code: 'E06000047', name: 'County Durham', parent: northEast },
    { code: 'E06000001', name: 'Hartlepool', parent: northEast },
    { code: 'X', name: 'Nowhere', parent: null },
  ];
  expect(areaComparisonRegions(areas)).toEqual([
    { ...london, areas: ['E09000001'] },
    { ...northEast, areas: ['E06000047', 'E06000001'] },
  ]);
  expect(
    highlightedAreaCodes(
      new URLSearchParams('highlight=E06000001&highlight=X&highlightRegion=E12000001'),
      areas,
    ),
  ).toEqual(['E06000001', 'X', 'E06000047']);
});
