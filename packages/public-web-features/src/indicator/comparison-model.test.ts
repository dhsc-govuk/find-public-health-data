import { expect, it } from 'vitest';
import { areaComparisonRows } from './area-comparison.ts';
import { indicatorComparisonModel } from './comparison-model.ts';
import { indicatorPair } from './indicator-pair.ts';
import type { SelectedIndicator } from './loader.ts';
import { observation, selected, sex } from './view.testing.ts';

function areasModel(primary: SelectedIndicator) {
  return indicatorComparisonModel([primary], {
    compareAreasData: primary.areaData,
    comparedAreasData: [],
    compareAreaOptions: [],
    compareAreaGroup: 'Local authorities',
    comparisonDisplayGroups: [],
  }).areas;
}

it('compares areas with England, and says which area with a value is not compared', () => {
  const primary = selected();
  primary.areaData.push({
    areaCode: 'E06000001',
    areaName: 'Hartlepool',
    observations: [{ ...observation(10, [sex('Female')]), lowerCi95: null, upperCi95: null }],
  });
  const model = areasModel(primary);
  expect(model.comparedWithEngland).toBe(true);
  expect(model.rows.map(({ areaName, label }) => [areaName, label])).toEqual([
    ['England', ''],
    ['Cornwall', 'Better'],
    ['Hartlepool', 'Not compared'],
  ]);
});

it.each([
  ['its method makes no comparison', { comparatorMethod: 'No comparison' }],
  ['it has no comparator method', { comparatorMethod: null }],
  ['no comparison is possible', { polarity: 'no-comparison-possible' as const }],
])('does not compare areas with England when %s', (_reason, detail) => {
  const primary = selected();
  primary.detail = { ...primary.detail, ...detail };
  expect(areasModel(primary).comparedWithEngland).toBe(false);
});

it('does not compare areas with England when England has no value', () => {
  const primary = selected();
  primary.areaData = primary.areaData.filter(({ areaCode }) => areaCode !== 'E92000001');
  expect(areasModel(primary).comparedWithEngland).toBe(false);
});

it('still compares an indicator with no polarity by value, whatever its method', () => {
  const primary = selected();
  primary.detail = {
    ...primary.detail,
    polarity: 'no-polarity',
    comparatorMethod: 'No comparison',
  };
  const model = areasModel(primary);
  expect(model.comparedWithEngland).toBe(true);
  expect(model.rows.map(({ label }) => label)).toEqual(['', 'Higher']);
});

it('keeps displayed comparisons and pair ranges while leaving histories on the server', () => {
  const primary = selected();
  const compared = selected(241);
  const compareAreasData = primary.areaData.filter(({ areaCode }) => areaCode !== 'E92000001');
  const comparedAreasData = compared.areaData.filter(({ areaCode }) => areaCode !== 'E92000001');
  const model = indicatorComparisonModel([primary, compared], {
    compareAreasData,
    comparedAreasData,
    compareAreaOptions: [{ code: 'E06000052', name: 'Cornwall' }],
    compareAreaGroup: 'Local authorities',
    comparisonDisplayGroups: ['Local authorities'],
  });
  const original = areaComparisonRows(primary, compareAreasData, 'descending');
  expect(model.areas.rows.map(({ areaCode, value }) => [areaCode, value])).toEqual(
    original.rows.map(({ areaCode, value }) => [areaCode, value]),
  );
  expect(model.areas.period).toBe(original.period);
  expect(model.areas.multiYear).toBe(original.multiYear);
  const { displayValue: _, ...pair } = indicatorPair([primary, compared]);
  expect(model.pair).toEqual(pair);
  expect(JSON.stringify(model)).not.toMatch(/observations|dimensions|series|definition/);
});
