import { expect, it } from 'vitest';
import { areaComparisonRows } from './area-comparison.ts';
import { indicatorComparisonModel } from './comparison-model.ts';
import { indicatorPair } from './indicator-pair.ts';
import { selected } from './view.testing.ts';

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
