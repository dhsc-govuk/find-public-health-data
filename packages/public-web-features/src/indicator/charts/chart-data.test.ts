import { describe, expect, it } from 'vitest';
import type { IndicatorAreaData, IndicatorObservation } from '../loader.ts';
import { observation } from '../view.testing.ts';
import {
  alignedSeries,
  areaQuintile,
  bounds,
  chartPeriods,
  englandCode,
  errorOffsets,
  pairedObservations,
  valueExtent,
} from './chart-data.ts';

function point(year: number, value: number | null, sex?: string): IndicatorObservation {
  return {
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    value,
    count: null,
    denominator: null,
    lowerCi95: null,
    upperCi95: null,
    lowerCi998: null,
    upperCi998: null,
    notes: [],
    dimensions: sex ? [{ type: 'Sex', value: sex, dimensionClass: 'core', sortOrder: 1 }] : [],
  };
}

function area(areaCode: string, ...observations: IndicatorObservation[]): IndicatorAreaData {
  return { areaCode, areaName: areaCode, observations };
}

describe('chart series', () => {
  it('keeps values tied at a quintile cutoff in the group of their first rank', () => {
    const cutoffs = [1, 3, 3, 7];
    expect([0, 1, 2, 3, 4, 7, 8].map((value) => areaQuintile(value, cutoffs))).toEqual([
      1, 1, 2, 2, 4, 4, 5,
    ]);
    expect(areaQuintile(null, cutoffs)).toBeNull();
    expect(areaQuintile(0, null)).toBeNull();
  });

  it('does not compare different population segments when an area lacks the reference segment', () => {
    const series = alignedSeries([
      area('local-1', point(2024, 4, 'Female')),
      area('local-2', point(2024, 8, 'Male')),
    ]);
    expect(series[0]?.observations.size).toBe(1);
    expect(series[1]?.observations.size).toBe(0);
  });

  it('pairs each indicator’s headline population independently', () => {
    const qof = {
      ...point(2024, 4),
      fromDate: '2024-04-01',
      toDate: '2025-03-31',
      dimensions: [{ type: 'Age', value: '17+ yrs', dimensionClass: 'core', sortOrder: 17 }],
    };
    const mortality = { ...point(2024, 8), fromDate: '2022-01-01' };
    expect(pairedObservations([area('local-1', qof)], [area('local-1', mortality)])).toEqual([
      {
        code: 'local-1',
        name: 'local-1',
        x: 4,
        y: 8,
        xPeriod: { fromDate: '2024-04-01', toDate: '2025-03-31' },
        yPeriod: { fromDate: '2022-01-01', toDate: '2024-12-31' },
      },
    ]);
  });

  it('pairs each area at each indicator’s latest non-null period and preserves zeroes', () => {
    const points = pairedObservations(
      [
        area(englandCode, point(2024, 4), point(2023, 3)),
        area('local-1', point(2024, null), point(2023, 0)),
        area('local-2', point(2024, 7)),
      ],
      [
        area(englandCode, point(2024, 5), point(2023, 4)),
        area('local-1', point(2024, 3), point(2023, 1)),
        area('local-2', point(2023, 5)),
      ],
    );
    expect(points).toMatchObject([
      {
        code: englandCode,
        xPeriod: { fromDate: '2024-01-01' },
        yPeriod: { fromDate: '2024-01-01' },
        x: 4,
        y: 5,
      },
      {
        code: 'local-1',
        xPeriod: { fromDate: '2023-01-01' },
        yPeriod: { fromDate: '2024-01-01' },
        x: 0,
        y: 3,
      },
      {
        code: 'local-2',
        xPeriod: { fromDate: '2024-01-01' },
        yPeriod: { fromDate: '2023-01-01' },
        x: 7,
        y: 5,
      },
    ]);
  });
});

it("takes the axis's extent from the values and their error bars as drawn", () => {
  const series = (value: number, lowerCi95: number, upperCi95: number) =>
    alignedSeries([
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [{ ...observation(value), lowerCi95, upperCi95 }],
      },
    ]);
  expect(valueExtent(series(1, -1, 3), '95')).toEqual([-1, 3]);
  expect(valueExtent(series(1, -1, 3), 'none')).toEqual([1, 1]);
  // An interval that contradicts its value draws no bar on either side, so it adds nothing.
  expect(valueExtent(series(10, 12, 8), '95')).toEqual([10, 10]);
});

it('aligns a mixed three and five year history to one period length', () => {
  const three = { ...observation(3), fromDate: '2022-09-01', toDate: '2025-08-31' };
  const five = { ...observation(5), fromDate: '2020-09-01', toDate: '2025-08-31' };
  const series = alignedSeries([
    area('local', three, five),
    area('benchmark', { ...three, value: 30 }, { ...five, value: 50 }),
    area('other-length', five),
  ]);
  expect(
    series.map(({ observations }) => [...observations.values()].map(({ value }) => value)),
  ).toEqual([[5], [50], [5]]);
});

it.each(['95', '99.8'] as const)(
  'caps the %s chart bars and extent before scaling the axis',
  (level) => {
    const point = {
      ...observation(72.49),
      value: 72.49,
      lowerCi95: 72042.0954,
      upperCi95: 72939.9819,
      lowerCi998: -2,
      upperCi998: 120.4115,
    };
    const indicator = { valueType: 'Proportion' };
    const interval = bounds(point, level, indicator);
    expect(interval).toEqual(level === '95' ? [100, 100] : [-2, 100]);
    const [below, above] = errorOffsets(point.value, interval) ?? [];
    expect(point.value + (above ?? 0)).toBe(100);
    expect(point.value - (below ?? 0)).toBe(level === '95' ? 100 : -2);
    expect(valueExtent(alignedSeries([area('England', point)]), level, indicator)).toEqual(
      level === '95' ? [72.49, 100] : [-2, 100],
    );
    expect(bounds(point, level, { valueType: 'Crude rate' })).toEqual(
      level === '95' ? [72042.0954, 72939.9819] : [-2, 120.4115],
    );
  },
);
it('plots every cumulative endpoint with its baseline in the labels and excludes annual and old-cycle points', () => {
  const cumulative = Array.from({ length: 17 }, (_, index) => ({
    ...point(2022, index + 1),
    fromDate: '2022-04-01',
    toDate: new Date(Date.UTC(2022, 6 + index * 3, 0)).toISOString().slice(0, 10),
    periodType: 'cumulative-quarter-2022-04-01' as const,
  }));
  const series = alignedSeries([
    area(
      englandCode,
      ...cumulative,
      { ...point(2022, 90), fromDate: '2022-04-01', toDate: '2023-03-31' },
      { ...point(2021, 80), periodType: 'cumulative-quarter-2021-01-01' },
    ),
  ]);
  expect([...(series[0]?.observations.values() ?? [])]).toEqual(cumulative);
  const labels = chartPeriods(series, { value: 'financial', label: 'Financial' });
  expect(labels).toHaveLength(17);
  expect(labels[3]?.label).toBe('2022/23 Q1 - 2022/23 Q4');
  expect(labels[5]?.label).toBe('2022/23 Q1 - 2023/24 Q2');
  expect(labels.at(-1)?.label).toBe('2022/23 Q1 - 2026/27 Q1');
});
