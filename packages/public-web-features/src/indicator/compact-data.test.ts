import { expect, it } from 'vitest';
import {
  compactIndicator,
  compactScatterComparison,
  expandIndicator,
  expandScatterComparison,
} from './compact-data.ts';
import { observation, selected, sex } from './view.testing.ts';

it('preserves every observation field and its order through the hydration boundary', () => {
  const source = selected();
  const zero = {
    ...observation(0, [sex('Female')]),
    count: 0,
    denominator: 123,
    lowerCi95: null,
    upperCi998: 0,
    notes: [{ text: 'Suppressed <value> & "quoted"', category: 'Value note' }],
  };
  const missing = { ...zero, value: null, count: null, dimensions: [] };
  source.areaData.push({ areaCode: 'empty', areaName: 'Empty area', observations: [] });
  source.regionData = [{ areaCode: 'region', areaName: 'Region', observations: [zero, missing] }];
  source.benchmarkData = [
    { areaCode: 'neighbour', areaName: 'Neighbour', observations: [missing, zero] },
  ];
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

it('preserves scatter values, independent periods and sex variants through hydration', () => {
  const point = {
    code: 'E92000001',
    name: 'England',
    xPeriod: { fromDate: '2024-04-01', toDate: '2025-03-31' },
    yPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
    x: 0,
    y: -0.123456789,
  };
  const source = {
    points: [point],
    variants: [
      { sex: 'Female', axisSexes: ['', 'Female'], points: [{ ...point, y: 20 }] },
      { sex: 'Male', axisSexes: ['', 'Male'], points: [] },
    ],
  };
  const compact = compactScatterComparison(source);
  expect(expandScatterComparison(JSON.parse(JSON.stringify(compact)))).toEqual(source);
  expect(expandScatterComparison(compactScatterComparison({ points: [] }))).toEqual({ points: [] });
});

it('preserves cumulative identity across hydration even when an annual row has identical dates', () => {
  const source = selected();
  const annual = { ...observation(10), fromDate: '2022-04-01', toDate: '2023-03-31' };
  const cumulative = { ...annual, periodType: 'cumulative-quarter-2022-04-01' as const, value: 20 };
  source.areaData = [
    { areaCode: 'E92000001', areaName: 'England', observations: [annual, cumulative] },
  ];
  const compact = compactIndicator(source);
  expect(compact.catalogue.periods).toHaveLength(2);
  expect(expandIndicator(JSON.parse(JSON.stringify(compact)))).toEqual(source);
});
