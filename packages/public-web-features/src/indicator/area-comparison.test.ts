import { expect, it } from 'vitest';
import {
  areaComparisonBarColour,
  areaComparisonBarMaximum,
  areaComparisonGroups,
  areaComparisonOptions,
  areaComparisonRows,
  comparisonRankingData,
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
  const quartiles = areaComparisonGroups(rows, 'quartiles');
  expect(quartiles.heading).toBe('Quartile');
  expect([...quartiles.labels]).toEqual([
    ['a', 'Quartile 1 (lowest)'],
    ['b', 'Quartile 1 (lowest)'],
    ['c', 'Quartile 3'],
    ['d', 'Quartile 4 (highest)'],
  ]);
  expect(areaComparisonGroups(rows, 'quintiles').heading).toBe('Quintile');
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
  expect(areaComparisonBarColour('Quartile 1 (lowest)', 'quartiles', false)).toBe('#440154');
  expect(areaComparisonBarColour('Quintile 5 (highest)', 'quintiles', false)).toBe('#B4DE2C');
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
