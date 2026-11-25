import { describe, expect, it } from 'vitest';
import {
  summariseTrend,
  type TrendObservation,
  type TrendSettings,
  trendDirection,
} from './recent-trend.ts';

const proportion: TrendSettings = { valueType: 'Proportion' };
const rate: TrendSettings = { valueType: 'Crude rate' };

type Row = [
  string,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

function rows(data: Row[]): TrendObservation[] {
  return data.map(([fromDate, toDate, value, count, denominator, lowerCi95, upperCi95]) => ({
    fromDate,
    toDate,
    value,
    count,
    denominator,
    lowerCi95,
    upperCi95,
  }));
}

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

// Fingertips' own England rows, each with the Recent Trend Fingertips publishes for it.
describe('agrees with Fingertips', () => {
  it('tests proportions on their counts and denominators', () => {
    // 91871 School pupils with social, emotional and mental health needs: "Increasing".
    const pupils = rows([
      ['2021-04-01', '2022-03-31', 2.99214, 250272, 8364328, 2.98061, 3.0037],
      ['2022-04-01', '2023-03-31', 3.3, 275093, 8426530, 3.3, 3.3],
      ['2023-04-01', '2024-03-31', 3.61927, 305511, 8441223, 3.6067, 3.6319],
      ['2024-04-01', '2025-03-31', 4.04183, 339146, 8390893, 4.0285, 4.0552],
      ['2025-04-01', '2026-03-31', 4.496, 373284, 8302640, 4.4819, 4.5101],
    ]);
    expect(direction(pupils, proportion)).toBe('up');
    // The confidence interval test sees no trend here: one interval has no width.
    expect(direction(pupils, rate)).toBe('right');

    // 90811 Deliveries to young women and girls aged 12 to 17: "Decreasing and getting better".
    const deliveries = rows([
      ['2020-04-01', '2021-03-31', 0.58, 3079, 534802, 0.6, 0.6],
      ['2021-04-01', '2022-03-31', 0.56, 3085, 549836, 0.54, 0.58],
      ['2022-04-01', '2023-03-31', 0.605631892, 3125, 515990, 0.58, 0.63],
      ['2023-04-01', '2024-03-31', 0.55912, 2870, 513310, 0.54, 0.58],
      ['2024-04-01', '2025-03-31', 0.51296, 2612, 509200, 0.49371, 0.53296],
    ]);
    expect(direction(deliveries, proportion)).toBe('down');

    // 93793 Heart failure diagnosis confirmed by an ECG: "No significant change".
    const heartFailure = rows([
      [
        '2020-04-01',
        '2021-03-31',
        84.4922413956038,
        44704,
        52909,
        84.1813014579672,
        84.7981730773501,
      ],
      ['2021-04-01', '2022-03-31', 87.27361, 61006, 69902, 87.0245, 87.51862],
      ['2022-04-01', '2023-03-31', 92.71271, 148141, 159785, 92.58423, 92.83913],
      ['2023-04-01', '2024-03-31', 79.14188, 85660, 108236, 78.89879, 79.38289],
      ['2024-04-01', '2025-03-31', 84.97225, 179622, 211389, 84.81929, 85.12395],
    ]);
    expect(direction(heartFailure, proportion)).toBe('right');
  });

  it('tests other value types on their 95% confidence intervals', () => {
    // 93999 Mortality rate from influenza and pneumonia, a directly standardised rate:
    // "Increasing and getting worse".
    const influenza = rows([
      ['2020-01-01', '2020-12-31', 35.06888, 18714.604, 56325961, 34.56708, 35.57613],
      ['2021-01-01', '2021-12-31', 28.09202, 15189.198, 56554891, 27.64617, 28.54325],
      [
        '2022-01-01',
        '2022-12-31',
        34.0386740747639,
        18842,
        57144395,
        33.5534407364282,
        34.5291589353817,
      ],
      [
        '2023-01-01',
        '2023-12-31',
        40.3652174203186,
        22667,
        57932470,
        39.8399873252923,
        40.8956274094622,
      ],
      [
        '2024-01-01',
        '2024-12-31',
        37.4940038587246,
        21508,
        58620101,
        36.9929453187846,
        38.0001360411576,
      ],
    ]);
    expect(direction(influenza, { valueType: 'Directly standardised rate' })).toBe('up');
  });

  it('cannot calculate across a missing year', () => {
    // 91891 Dementia recorded prevalence, aged 65 and over, has no 2022: "Cannot be calculated".
    const dementia = rows([
      [
        '2018-01-01',
        '2018-12-31',
        4.32382451710711,
        448121,
        10363996,
        4.31145859376916,
        4.33622430056661,
      ],
      [
        '2019-01-01',
        '2019-12-31',
        4.33644285812844,
        456958,
        10537623,
        4.32416199538,
        4.34875701389001,
      ],
      [
        '2020-01-01',
        '2020-12-31',
        3.97473523331541,
        422973,
        10641539,
        3.96301387538155,
        3.98648982029546,
      ],
      ['2021-01-01', '2021-12-31', 3.94294, 425627, 10794653, 3.93135, 3.95457],
      ['2023-01-01', '2023-12-31', 4.2, 463843, 11160338, 4.1, 4.2],
      ['2024-01-01', '2024-12-31', 4.2, 482890, 11377188, 4.2, 4.3],
    ]);
    expect(summariseTrend(dementia, true).run).toBe(2);
    expect(direction(dementia, proportion)).toBeNull();
  });
});

describe('valid rows', () => {
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

  it('stops the run at the first invalid row or missing period back from the latest', () => {
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
