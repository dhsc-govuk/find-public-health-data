import { describe, expect, it } from 'vitest';
import publishedTrends from './fixtures/fingertips-recent-trends.json' with { type: 'json' };
import {
  summariseTrend,
  type TrendObservation,
  type TrendSettings,
  trendDirection,
} from './recent-trend.ts';

const proportion = { valueType: 'Proportion' };
const rate: TrendSettings = { valueType: 'Crude rate' };

function year(
  start: number,
  value: number,
  overrides: Partial<TrendObservation> = {},
): TrendObservation {
  return {
    fromDate: `${start}-01-01`,
    toDate: `${start}-12-31`,
    value,
    count: value * 10,
    denominator: 1000,
    lowerCi95: value - 0.5,
    upperCi95: value + 0.5,
    ...overrides,
  };
}

const years = (
  values: number[],
  first = 2019,
  overrides: (value: number) => Partial<TrendObservation> = () => ({}),
) => values.map((value, index) => year(first + index, value, overrides(value)));
const rising = years([10, 12, 14, 16, 18]);
const direction = (series: TrendObservation[], settings = rate, annual = true) =>
  trendDirection(summariseTrend(series, annual), settings);

describe('published live Fingertips series', () => {
  it.each(publishedTrends.samples)('$key matches published marker $marker.Marker', (sample) => {
    expect(direction(sample.observations, { valueType: sample.valueType }, sample.annual)).toBe(
      [null, 'up', 'down', 'right'][sample.marker.Marker],
    );
  });
});

describe('valid rows', () => {
  it.each(['Count', 'Score', null])(
    'cannot calculate %s with complete observations',
    (valueType) => {
      expect(direction(rising, { valueType })).toBeNull();
    },
  );

  it.each([
    'Directly standardised rate',
    'Indirectly standardised proportion',
    'Indirectly standardised ratio',
    'Indirectly standardised rate',
    'Ratio',
    'Mean',
  ])('allows %s when the observations support the calculation', (valueType) => {
    expect(direction(rising, { valueType })).toBe('up');
  });

  it('only calculates a series of annual periods', () => {
    expect(direction(rising)).toBe('up');
    expect(direction(rising, rate, false)).toBeNull();
  });

  it('needs five rows in the run', () => {
    expect(direction(rising.slice(1))).toBeNull();
  });

  it('needs Value, Count, Denominator and both 95% limits on each row of the run', () => {
    // Indicator 94184 publishes values and intervals but no counts or denominators.
    expect(direction(rising.map((r) => ({ ...r, count: null, denominator: null })))).toBeNull();
    expect(direction(rising.map((r) => ({ ...r, count: null })))).toBeNull();
    expect(direction(rising.map((r) => ({ ...r, denominator: null })))).toBeNull();
    expect(direction(rising.map((r) => ({ ...r, denominator: 0 })))).toBeNull();
    expect(direction(rising.map((r) => ({ ...r, value: null })))).toBeNull();
    expect(direction([...rising.slice(0, 4), year(2023, 18, { lowerCi95: null })])).toBeNull();
    expect(direction([...rising.slice(0, 4), year(2023, 18, { upperCi95: null })])).toBeNull();
  });

  it('stops the run at an interior invalid row or missing period', () => {
    const invalid = [year(2017, 8), year(2018, 9, { count: null }), ...rising];
    expect(summariseTrend(invalid, true).run).toBe(5);
    expect(direction(invalid)).toBe('up');
    const broken = [
      ...rising.slice(0, 2),
      year(2021, 13, { value: null }),
      ...years([14, 16, 18], 2022),
    ];
    expect(summariseTrend(broken, true).run).toBe(3);
    expect(direction(broken)).toBeNull();
    const gap = [...years([8, 9]), ...years([10, 12, 14, 16, 18], 2022)];
    expect(summariseTrend(gap, true).run).toBe(5);
    expect(direction(gap)).toBe('up');
  });

  it('skips trailing invalid rows before finding the latest run', () => {
    const series = [
      ...rising,
      year(2024, 19, { value: null }),
      year(2025, 20, { denominator: null }),
    ];
    expect(summariseTrend(series, true).run).toBe(5);
    expect(direction(series)).toBe('up');
  });

  it('cannot calculate when any row of the run has Count equal to Denominator', () => {
    expect(direction([...rising.slice(0, 4), year(2023, 18, { count: 1000 })])).toBeNull();
    // Fingertips checks the whole run, not just the five points it uses.
    expect(direction([year(2018, 9, { count: 1000 }), ...rising])).toBeNull();
    expect(
      direction([year(2017, 9, { count: 1000 }), year(2018, 9, { value: null }), ...rising]),
    ).toBe('up');
  });

  it('uses the latest five points of the run', () => {
    expect(
      summariseTrend([year(2018, 5), ...rising], true).points.map(({ value }) => value),
    ).toEqual([10, 12, 14, 16, 18]);
  });
});

describe('confidence interval test', () => {
  it('reads the slope of a significant trend', () => {
    expect(direction(rising)).toBe('up');
    expect(direction(years([18, 16, 14, 12, 10]))).toBe('down');
  });

  it('reports no change when the chi-square is not significant', () => {
    const wide = years([10, 12, 14, 16, 18], 2019, (value) => ({
      lowerCi95: value - 20,
      upperCi95: value + 20,
    }));
    expect(direction(wide)).toBe('right');
  });

  it('reports no change when dropping one point reverses the slope', () => {
    // Significant upwards only because of the last point; without it the slope is negative.
    expect(direction(years([10.1, 10, 10, 9.9, 12]))).toBe('right');
  });

  it('works out the chi-square Fingertips does', () => {
    // A 95% interval of ±1.96 weights every point by one, so the slope is the ordinary least
    // squares slope and chi-square is slope² × Σ(t − mean t)² = slope² × 10.
    const unit = (values: number[]) =>
      years(values, 2019, (value) => ({ lowerCi95: value - 1.96, upperCi95: value + 1.96 }));
    // Slope 0.3 gives 0.9; slope 1 gives 10, just over the 9.5495 threshold.
    expect(direction(unit([1, 1.3, 1.6, 1.9, 2.2]))).toBe('right');
    expect(direction(unit([1, 2, 3, 4, 5]))).toBe('up');
  });
});

describe('proportions test', () => {
  const counts = (values: number[], intervals: Partial<TrendObservation> = {}) =>
    years(values, 2019, (count) => ({ count, denominator: 1000, ...intervals }));

  it.each([0, 1100])('reports no change when count %i makes the logit slope undefined', (count) => {
    for (let index = 0; index < 5; index++) {
      const values = [100, 120, 140, 160, 180];
      values[index] = count;
      expect(direction(counts(values), proportion)).toBe('right');
    }
  });

  it('tests counts against denominators whatever the intervals say', () => {
    const wide = counts([100, 120, 140, 160, 180], { lowerCi95: 0, upperCi95: 1e6 });
    expect(direction(wide)).toBe('right');
    expect(direction(wide, proportion)).toBe('up');
    expect(direction(counts([180, 160, 140, 120, 100]), proportion)).toBe('down');
    expect(direction(counts([10, 11, 10, 11, 10]), proportion)).toBe('right');
  });
});
