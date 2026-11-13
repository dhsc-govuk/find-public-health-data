import { expect, it } from 'vitest';
import { compactIndicator, expandIndicator } from './compact-data.ts';
import { observation, selected, sex } from './view.testing.ts';

it('preserves every observation field and its order through the hydration boundary', () => {
  const source = selected();
  const zero = {
    ...observation(0, [sex('Female')]),
    count: 0,
    numerator: 0,
    denominator: 123,
    lowerCi95: null,
    upperCi998: 0,
    notes: [{ text: 'Suppressed <value> & "quoted"', category: 'Value note' }],
  };
  const missing = { ...zero, value: null, count: null, dimensions: [] };
  source.areaData.push({ areaCode: 'empty', areaName: 'Empty area', observations: [] });
  source.regionData = [{ areaCode: 'region', areaName: 'Region', observations: [zero, missing] }];
  source.ranges = { 'Local authorities': [] };
  const compact = compactIndicator(source);
  const hydrated = JSON.parse(JSON.stringify(compact));
  expect(expandIndicator(hydrated)).toEqual(source);
});

it('shares periods, dimensions and notes across histories and benchmark areas', () => {
  const source = selected();
  source.areaData = Array.from({ length: 20 }, (_, index) => ({
    areaCode: String(index),
    areaName: `Area ${index}`,
    observations: Array.from({ length: 30 }, () => observation(0, [sex('Female')])),
  }));
  source.regionData = source.areaData.slice(0, 1);
  const compact = compactIndicator(source);
  expect(compact.catalogue.periods).toHaveLength(1);
  expect(compact.catalogue.dimensions).toHaveLength(1);
  expect(compact.catalogue.notes).toHaveLength(1);
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(source).length / 4);
  expect(expandIndicator(JSON.parse(JSON.stringify(compact)))).toEqual(source);
});
