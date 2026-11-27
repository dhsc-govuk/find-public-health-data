import { expect, it } from 'vitest';

import {
  comparisonVariants,
  filterSeries,
  headlineSeries,
  isObservationPeriodType,
  isRollingPeriod,
  observationPeriodType,
  pairedAreaValues,
  periodMonths,
  periodTypeLength,
  periodYears,
  rankingAreaSeries,
  seriesPeriodTypes,
  tableAreaSeries,
  tableSummary,
  uncertainHeadlineAge,
} from './observation-series.ts';

function series(age: string, years: number[]) {
  return years.map((year) => ({
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    dimensions: [{ type: 'Age', value: age }],
  }));
}

it('adds eight periods with null gaps for sparklines without changing recent inputs or trends', () => {
  const observations = [20, 19, 18, 17, 16, 15, null, null, null, null, null, null, 2, 1].map(
    (value, index) => ({
      fromDate: `${2000 + index}-01-01`,
      toDate: `${2000 + index}-12-31`,
      dimensions: [],
      value,
    }),
  );
  const areas = [{ areaCode: 'E92000001', observations }];
  const recent = tableSummary(areas);
  const sparkline = tableSummary(areas, 'sparkline');
  expect(sparkline.tableSeries).toEqual(recent.tableSeries);
  expect(recent.areaData[0]?.observations).toEqual(
    observations.filter(({ value }) => value !== null).slice(-5),
  );
  expect(sparkline.areaData[0]?.observations.slice(-8)).toEqual(observations.slice(-8));
  expect(sparkline.areaData[0]?.observations).toHaveLength(11);
  expect(tableSummary(areas, 'latest').areaData[0]?.observations).toEqual(observations.slice(-1));
});

it('keeps England histories matching another area even when its headline uses a different age', () => {
  const headline = series('All ages', [2019, 2020, 2021, 2022, 2023]);
  const benchmark = series('45+', [2021, 2022]);
  const unused = series('15–44', [2022]);
  const local = series('45+', [2020, 2021, 2022]);

  expect(
    tableAreaSeries([
      { areaCode: 'E92000001', observations: [...headline, ...benchmark, ...unused] },
      { areaCode: 'E06000052', observations: local },
    ]),
  ).toEqual([
    { areaCode: 'E92000001', observations: [...headline, ...benchmark] },
    { areaCode: 'E06000052', observations: local },
  ]);
});

it('ranks one shared non-null period using the complete winning histories', () => {
  const points = (age: string, years: number[]) =>
    series(age, years).map((point) => ({
      ...point,
      dimensions: point.dimensions.map((dimension) => ({ ...dimension, sortOrder: 0 })),
      value: 1 as number | null,
    }));
  const older = points('All ages', [2020, 2021]);
  const longer = points('45+', [2019, 2020, 2021]);
  const latest = points('All ages', [2020, 2021, 2022]);
  const newest = latest[2];
  if (!newest) throw new Error('Expected a latest point');
  const missing = { ...newest, fromDate: '2023-01-01', toDate: '2023-12-31', value: null };
  const areas = [
    { areaCode: 'older', observations: [...older, ...longer] },
    { areaCode: 'newer', observations: [...latest, missing] },
    { areaCode: 'unknown', observations: [] },
  ];
  expect(rankingAreaSeries(areas)).toEqual([
    { areaCode: 'older', observations: [] },
    { areaCode: 'newer', observations: [latest[2]] },
    { areaCode: 'unknown', observations: [] },
  ]);
});

it('uses the first available sex and period variant, including missing first areas', () => {
  const point = (sex: string, sortOrder: number, fromDate: string, value = 1) => ({
    fromDate,
    toDate: '2023-12-31',
    value,
    dimensions: [{ type: 'Sex', value: sex, sortOrder }],
  });
  const female = point('Female', 1, '2023-01-01');
  const male = point('Male', 2, '2023-01-01', 2);
  const rolling = point('Female', 1, '2021-01-01', 3);
  expect(
    rankingAreaSeries([
      { areaCode: 'missing', observations: [] },
      { areaCode: 'local', observations: [male, rolling, female] },
    ]),
  ).toEqual([
    { areaCode: 'missing', observations: [] },
    { areaCode: 'local', observations: [female] },
  ]);
});

it('keeps England at the local ranking period and population rather than its newer headline', () => {
  const point = (year: number, value: number, age = 'All ages') => ({
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    value,
    dimensions: [{ type: 'Age', value: age, sortOrder: 0 }],
  });
  const benchmark = point(2022, 10);
  const local = point(2022, 12);
  const england = {
    areaCode: 'E92000001',
    observations: [benchmark, point(2024, 20), point(2022, 30, '65+')],
  };
  const areas = [{ areaCode: 'local', observations: [local] }, england];
  expect(rankingAreaSeries(areas)).toEqual([areas[0], { ...england, observations: [benchmark] }]);
  expect(
    rankingAreaSeries([
      { areaCode: 'local', observations: [local] },
      { ...england, observations: [point(2024, 20)] },
    ])[1]?.observations,
  ).toEqual([]);
});

it.each([
  ['2024-01-01', '2024-12-31', 1],
  ['2024-04-01', '2025-03-31', 1],
  ['2024-02-29', '2025-02-28', 1],
  ['2024-02-29', '2025-02-27', 1],
  ['2021-01-01', '2023-12-31', 3],
  ['2015-09-01', '2020-08-31', 5],
  ['2013-09-01', '2020-08-31', 7],
])('derives inclusive whole years from %s to %s as %i', (fromDate, toDate, years) => {
  const point = { fromDate, toDate };
  expect(periodYears(point)).toBe(years);
  expect(observationPeriodType(point)).toBe(`${years}-year`);
  expect(isRollingPeriod(point)).toBe(years > 1);
});

it.each([
  '1-year',
  '2-year',
  '3-year',
  '5-year',
  '7-year',
  '12-year',
  '1-month',
  '3-month',
  '18-month',
  '1-day',
  '500-day',
  '550-day',
  'cumulative-quarter-2022-04-01',
])('accepts period type %s', (type) => {
  expect(isObservationPeriodType(type)).toBe(true);
});

it.each([
  null,
  undefined,
  '',
  'all',
  '0-year',
  '-3-year',
  '3.5-year',
  '03-year',
  '3-years',
  '1e3-year',
  '9007199254740992-year',
  '0-day',
  '05-day',
  '1.5-day',
  '0-month',
  '03-month',
  '1.5-month',
  '-1-month',
  '3-months',
  '9007199254740992-month',
])('rejects invalid period type %s', (type) => {
  expect(isObservationPeriodType(type)).toBe(false);
});

it('keeps mixed three, five and seven year histories and cache selections separate', () => {
  const history = (years: number) =>
    Array.from({ length: 10 }, (_, index) => ({
      fromDate: `${2000 + index}-09-01`,
      toDate: `${2000 + index + years}-08-31`,
      value: years * 100 + index,
      dimensions: [{ type: 'Sex', value: 'Female', sortOrder: 1 }],
    }));
  const three = history(3);
  const five = history(5);
  const seven = history(7);
  const observations = [...three, ...five, ...seven];
  expect(seriesPeriodTypes([...observations].reverse())).toEqual(['3-year', '5-year', '7-year']);
  expect(comparisonVariants(observations)).toEqual([
    { sex: 'Female', periodType: '3-year' },
    { sex: 'Female', periodType: '5-year' },
    { sex: 'Female', periodType: '7-year' },
  ]);
  const complete = tableAreaSeries([{ areaCode: 'local', observations }]);
  expect(complete[0]?.observations).toEqual(observations);
  const summary = tableSummary(complete, 'sparkline');
  for (const [points, type] of [
    [three, '3-year'],
    [five, '5-year'],
    [seven, '7-year'],
  ] as const) {
    expect(filterSeries(observations, { periodType: type })).toEqual(points);
    expect(summary.areaData[0]?.observations).toEqual(expect.arrayContaining(points.slice(-8)));
    expect(
      summary.tableSeries.find(
        (selection) => selection.sex === 'Female' && selection.periodType === type,
      )?.segments.local,
    ).toBe(`Sex:Female|${type}`);
  }
  expect(new Set(headlineSeries(observations).map(observationPeriodType)).size).toBe(1);
});

it('elects the same headline regardless of input order', () => {
  const history = (age: string, years: number, values: (number | null)[], start = 2020) =>
    values.map((value, index) => ({
      fromDate: `${start + index}-01-01`,
      toDate: `${start + index + years - 1}-12-31`,
      value,
      dimensions: [{ type: 'Age', value: age }],
    }));
  const winner = history('Z', 7, [1, 2]);
  const candidates = [
    ...history('A', 1, [1, 2, null]),
    ...history('A', 3, [1, 2]),
    ...history('Z', 9, [1, null]),
    ...winner,
  ];
  const newest = history('Z', 9, [1, null]);
  expect(headlineSeries(candidates)).toEqual(newest);
  expect(headlineSeries([...candidates].reverse())).toEqual(newest);
  const earlier = history('ZZ', 7, [1, 2], 2010);
  expect(headlineSeries([...winner, ...earlier])).toEqual(winner);
  const tied = history('A', 7, [1, 2]);
  expect(headlineSeries([...winner, ...tied])).toEqual(tied);
  expect(headlineSeries([...tied, ...winner])).toEqual(tied);
});

it('offers only the periods each sex publishes and caches only offered variants', () => {
  const observations = [
    {
      fromDate: '2024-01-01',
      toDate: '2024-12-31',
      value: 1,
      dimensions: [{ type: 'Sex', value: 'Male', sortOrder: 2 }],
    },
    ...[3, 5].map((years) => ({
      fromDate: '2020-01-01',
      toDate: `${2020 + years - 1}-12-31`,
      value: 2,
      dimensions: [{ type: 'Sex', value: 'Female', sortOrder: 1 }],
    })),
  ];
  const variants = comparisonVariants(observations);
  expect(variants).toEqual([
    { sex: 'Female', periodType: '3-year' },
    { sex: 'Female', periodType: '5-year' },
    { sex: 'Male', periodType: '1-year' },
  ]);
  expect(
    tableSummary([{ areaCode: 'local', observations }])
      .tableSeries.filter(({ segments }) => segments.local)
      .map(({ sex, periodType }) => ({ sex, periodType })),
  ).toEqual(expect.arrayContaining(variants));
  expect(
    tableSummary([{ areaCode: 'local', observations }]).tableSeries.filter(
      ({ rowOrder }) => rowOrder?.local !== undefined,
    ),
  ).toHaveLength(3);
});

it('keeps every area headline for aggregate comparisons without offering an extra row', () => {
  const point = { fromDate: '2024-01-01', toDate: '2024-12-31', value: 10 };
  const areas = [
    { areaCode: 'aggregate', observations: [{ ...point, dimensions: [] }] },
    {
      areaCode: 'sexed',
      observations: [{ ...point, dimensions: [{ type: 'Sex', value: 'Female', sortOrder: 1 }] }],
    },
  ];
  const summary = tableSummary(areas);
  const aggregate = summary.tableSeries.find(({ sex, periodType }) => !sex && periodType === 'all');
  expect(aggregate?.segments).toEqual({ aggregate: '|1-year', sexed: 'Sex:Female|1-year' });
  expect(aggregate?.headlines).toEqual({ aggregate: true, sexed: true });
  expect(aggregate?.rowOrder).toEqual({ aggregate: 0 });
  expect(summary.areaData).toEqual(areas);
});

it.each([
  ['2024-01-01', '2024-01-01', '1-day'],
  ['2020-01-01', '2021-07-01', '548-day'],
  ['2024-01-31', '2024-02-27', '28-day'],
  ['2024-01-31', '2024-03-01', '31-day'],
  ['2024-02-29', '2025-03-01', '367-day'],
])('keeps a non-month span %s to %s as %s', (fromDate, toDate, type) => {
  expect(periodMonths({ fromDate, toDate })).toBeNull();
  expect(periodYears({ fromDate, toDate })).toBeNull();
  expect(observationPeriodType({ fromDate, toDate })).toBe(type);
});

it.each([
  ['2023-01-01', '2023-03-31', 3],
  ['2024-01-01', '2024-03-31', 3],
  ['2024-04-01', '2024-06-30', 3],
  ['2024-07-01', '2024-09-30', 3],
  ['2023-02-01', '2023-02-28', 1],
  ['2024-02-01', '2024-02-29', 1],
  ['2024-04-01', '2024-04-30', 1],
  ['2024-01-01', '2024-01-31', 1],
  ['2024-01-31', '2024-02-28', 1],
  ['2024-01-31', '2024-02-29', 1],
  ['2023-01-31', '2023-02-27', 1],
  ['2023-01-31', '2023-02-28', 1],
  ['2024-01-30', '2024-02-28', 1],
  ['2024-01-30', '2024-02-29', 1],
  ['2024-03-31', '2024-04-30', 1],
  ['2024-01-15', '2024-02-14', 1],
  ['2023-12-15', '2024-03-14', 3],
  ['2020-01-01', '2021-06-30', 18],
])('classifies calendar months from %s to %s as %i months', (fromDate, toDate, months) => {
  const point = { fromDate, toDate };
  expect(periodMonths(point)).toBe(months);
  expect(periodYears(point)).toBeNull();
  expect(observationPeriodType(point)).toBe(`${months}-month`);
  expect(isRollingPeriod(point)).toBe(months > 12);
});

it('orders and elects day, month and year series by the same approximate length', () => {
  const observations = [
    ['2024-01-01', '2024-12-31'],
    ['2024-07-01', '2024-09-30'],
    ['2024-01-31', '2024-03-01'],
    ['2024-02-01', '2024-02-29'],
    ['2024-01-01', '2024-01-30'],
  ].map(([fromDate = '', toDate = '']) => ({ fromDate, toDate, dimensions: [], value: 1 }));
  expect(seriesPeriodTypes(observations)).toEqual([
    '30-day',
    '1-month',
    '31-day',
    '3-month',
    '1-year',
  ]);
  expect(periodTypeLength('1-month')).toBe(30.4375);
  expect(periodTypeLength('12-month')).toBe(periodTypeLength('1-year'));
  expect(headlineSeries(observations)).toEqual([observations[0]]);
  expect(headlineSeries(observations.slice(1))).toEqual([observations[1]]);
  expect(headlineSeries(observations.slice(3))).toEqual([observations[3]]);
});

it('keeps quarters of different day lengths in one history', () => {
  const observations = [
    ['2023-01-01', '2023-03-31'],
    ['2023-04-01', '2023-06-30'],
    ['2023-07-01', '2023-09-30'],
  ].map(([fromDate = '', toDate = '']) => ({ fromDate, toDate, dimensions: [] }));
  expect(seriesPeriodTypes(observations)).toEqual(['3-month']);
  expect(filterSeries(observations, { periodType: '3-month' })).toEqual(observations);
  expect(headlineSeries(observations)).toEqual(observations);
});

it('keeps 500 and 550 day histories separate from annual and biennial histories', () => {
  const observations = [365, 500, 550, 730].map((days) => ({
    fromDate: '2021-01-01',
    toDate: new Date(Date.parse('2021-01-01') + (days - 1) * 86_400_000).toISOString().slice(0, 10),
    value: days,
    dimensions: [],
  }));
  expect(seriesPeriodTypes(observations)).toEqual(['1-year', '500-day', '550-day', '2-year']);
  for (const point of observations)
    expect(filterSeries(observations, { periodType: observationPeriodType(point) })).toEqual([
      point,
    ]);
  expect(headlineSeries(observations)[0]?.value).toBe(730);
});

it('counts suppressed points before period length and period length before the first point', () => {
  const history = (years: number, values: (number | null)[]) =>
    values.map((value, index) => ({
      fromDate: `${2025 - values.length + index - years}-01-01`,
      toDate: `${2024 - values.length + index}-12-31`,
      value,
      dimensions: [],
    }));
  const annual = history(1, [1, 2, null]);
  const rolling = history(7, [1, 2]);
  expect(headlineSeries([...annual, ...rolling])).toEqual(annual);
  const tied = history(1, [1, 2]);
  expect(headlineSeries([...tied, ...rolling])).toEqual(rolling);
  expect(headlineSeries([...rolling, ...tied])).toEqual(rolling);
});

it('trusts a headline with no age, the only age, or an age that contains every other age', () => {
  const point = (value: string, ageFrom: string, ageUnder?: string) => ({
    fromDate: '2024-01-01',
    toDate: '2024-12-31',
    dimensions: [{ type: 'Age', value, ageFrom, ...(ageUnder ? { ageUnder } : {}) }],
  });
  const total = { fromDate: '2024-01-01', toDate: '2024-12-31', dimensions: [] };
  const whole = point('0-4 yrs', 'P0Y', 'P5Y');
  const adults = point('18+ yrs', 'P18Y');
  const female = (observation: typeof whole) => ({
    ...observation,
    dimensions: [...observation.dimensions, { type: 'Sex', value: 'Female' }],
  });

  expect(uncertainHeadlineAge([total, whole], total)).toBe(false);
  expect(uncertainHeadlineAge([whole, whole], whole)).toBe(false);
  expect(
    uncertainHeadlineAge(
      [
        whole,
        point('<1 yr', 'P0Y', 'P1Y'),
        point('1 yr', 'P1Y', 'P2Y'),
        point('2-4 yrs', 'P2Y', 'P5Y'),
      ],
      whole,
    ),
  ).toBe(false);
  expect(uncertainHeadlineAge([adults, point('65+ yrs', 'P65Y')], adults)).toBe(false);
  expect(uncertainHeadlineAge([whole, female(point('<18 yrs', 'P0Y', 'P18Y'))], whole)).toBe(false);
});

it('doubts a headline age beside a total or an age outside it', () => {
  const point = (value: string, ageFrom?: string, ageUnder?: string) => ({
    fromDate: '2024-01-01',
    toDate: '2024-12-31',
    dimensions: [
      { type: 'Age', value, ...(ageFrom ? { ageFrom } : {}), ...(ageUnder ? { ageUnder } : {}) },
    ],
  });
  const total = { fromDate: '2020-01-01', toDate: '2020-12-31', dimensions: [] };
  const adults = point('18+ yrs', 'P18Y');
  const older = point('65+ yrs', 'P65Y');

  expect(uncertainHeadlineAge([total, adults], adults)).toBe(true);
  expect(uncertainHeadlineAge([adults, point('16-24 yrs', 'P16Y', 'P25Y')], adults)).toBe(true);
  expect(uncertainHeadlineAge([older, point('45-64 yrs', 'P45Y', 'P65Y')], older)).toBe(true);
  expect(
    uncertainHeadlineAge(
      [point('5-14 yrs', 'P5Y', 'P15Y'), point('15+ yrs', 'P15Y')],
      point('5-14 yrs', 'P5Y', 'P15Y'),
    ),
  ).toBe(true);
  expect(
    uncertainHeadlineAge([point('School age'), point('Primary school age')], point('School age')),
  ).toBe(true);
});

it('keeps all cumulative quarters together, replaces the old baseline and separates annual data', () => {
  const cumulative = Array.from({ length: 17 }, (_, index) => ({
    fromDate: '2022-04-01',
    toDate: new Date(Date.UTC(2022, 6 + index * 3, 0)).toISOString().slice(0, 10),
    periodType: 'cumulative-quarter-2022-04-01' as const,
    dimensions: [],
    value: index + 1,
  }));
  const old = cumulative.map((point) => ({
    ...point,
    fromDate: '2021-04-01',
    periodType: 'cumulative-quarter-2021-04-01' as const,
  }));
  const annual = { fromDate: '2022-04-01', toDate: '2023-03-31', dimensions: [], value: 99 };
  const observations = [...old, annual, ...cumulative];
  expect(headlineSeries(observations)).toEqual(cumulative);
  expect(seriesPeriodTypes(observations)).toEqual(['cumulative-quarter-2022-04-01']);
  expect(filterSeries(observations, {})).toEqual(cumulative);
  expect(filterSeries(observations, { periodType: '1-year' })).toEqual([]);
  expect(observationPeriodType(annual)).toBe('1-year');
  const fourth = cumulative[3];
  if (!fourth) throw new Error('Missing fourth quarter');
  expect(observationPeriodType(fourth)).toBe('cumulative-quarter-2022-04-01');
  const summary = tableSummary([{ areaCode: 'E92000001', observations }]);
  expect(summary.areaData[0]?.observations).toEqual(cumulative.slice(-5));
  expect(summary.tableSeries.map(({ periodType }) => periodType)).toEqual([
    'all',
    'cumulative-quarter-2022-04-01',
  ]);
});

it('keeps annual twins out of year-end benchmarks and scatter values', () => {
  const cumulative = [1, 4].map((quarter) => ({
    fromDate: '2022-04-01',
    toDate: new Date(Date.UTC(2022, 3 + quarter * 3, 0)).toISOString().slice(0, 10),
    periodType: 'cumulative-quarter-2022-04-01' as const,
    dimensions: [],
    value: quarter,
  }));
  const annual = { fromDate: '2022-04-01', toDate: '2023-03-31', dimensions: [], value: 99 };
  const areas = ['E06000052', 'E92000001'].map((areaCode) => ({
    areaCode,
    areaName: areaCode,
    observations: [...cumulative, annual],
  }));
  expect(tableAreaSeries(areas).map(({ observations }) => observations)).toEqual([
    cumulative,
    cumulative,
  ]);
  expect(tableSummary(areas).areaData.map(({ observations }) => observations)).toEqual([
    cumulative,
    cumulative,
  ]);
  expect(pairedAreaValues(areas, areas).map(({ x, y, xPeriod }) => ({ x, y, xPeriod }))).toEqual(
    areas.map(() => ({
      x: 4,
      y: 4,
      xPeriod: {
        fromDate: '2022-04-01',
        toDate: '2023-03-31',
        periodType: 'cumulative-quarter-2022-04-01',
      },
    })),
  );
});

it.each([false, true])(
  'uses the published cumulative scatter series when the first area has only annual data (reverse twins: %s)',
  (reverse) => {
    const annual = {
      fromDate: '2022-04-01',
      toDate: '2023-03-31',
      dimensions: [],
      value: 99,
    };
    const cumulative = {
      ...annual,
      periodType: 'cumulative-quarter-2022-04-01' as const,
      value: 4,
    };
    const areas = [
      { areaCode: 'annual-only', areaName: 'Annual only', observations: [annual] },
      {
        areaCode: 'cumulative',
        areaName: 'Cumulative',
        observations: reverse ? [annual, cumulative] : [cumulative, annual],
      },
    ];
    expect(pairedAreaValues(areas, areas)).toEqual([
      {
        code: 'cumulative',
        name: 'Cumulative',
        x: 4,
        y: 4,
        xPeriod: {
          fromDate: cumulative.fromDate,
          toDate: cumulative.toDate,
          periodType: cumulative.periodType,
        },
        yPeriod: {
          fromDate: cumulative.fromDate,
          toDate: cumulative.toDate,
          periodType: cumulative.periodType,
        },
      },
    ]);
  },
);

it('elects cumulative baselines per population while retaining other populations and their annual periods', () => {
  const point = {
    fromDate: '2022-04-01',
    toDate: '2023-03-31',
    value: 99,
    dimensions: [{ type: 'Sex', value: 'Female', sortOrder: 1 }],
  };
  const female = { ...point, periodType: 'cumulative-quarter-2022-04-01' as const, value: 4 };
  const male = { ...point, dimensions: [{ type: 'Sex', value: 'Male', sortOrder: 2 }], value: 7 };
  const oldMale = {
    ...male,
    fromDate: '2021-04-01',
    periodType: 'cumulative-quarter-2021-04-01' as const,
    value: 3,
  };
  const observations = [point, female, male];
  expect(filterSeries(observations, {})).toEqual([female, male]);
  expect(filterSeries(observations, { sex: 'Male' })).toEqual([male]);
  expect(seriesPeriodTypes(observations)).toEqual([female.periodType, '1-year']);
  expect(filterSeries([point, female, oldMale], {})).toEqual([female, oldMale]);
});
