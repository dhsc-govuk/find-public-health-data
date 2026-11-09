import { describe, expect, it } from 'vitest';
import type { IndicatorAreaData, IndicatorObservation } from '../loader.ts';
import { alignedSeries, areaQuintile, englandCode, pairedObservations } from './chart-data.ts';

function point(year: number, value: number | null, sex?: string): IndicatorObservation {
  return {
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    value,
    count: null,
    numerator: null,
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

  it('uses the latest period with paired local data and preserves zero values', () => {
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
      { code: englandCode, fromDate: '2023-01-01', x: 3, y: 4 },
      { code: 'local-1', fromDate: '2023-01-01', x: 0, y: 1 },
    ]);
  });
});
