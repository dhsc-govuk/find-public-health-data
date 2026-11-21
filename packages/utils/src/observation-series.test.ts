import { expect, it } from 'vitest';

import {
  comparisonVariants,
  filterSeries,
  headlineSeries,
  isObservationPeriodType,
  isRollingPeriod,
  observationPeriodType,
  periodYears,
  rankingAreaSeries,
  seriesPeriodTypes,
  tableAreaSeries,
  tableSummary,
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
  ['2024-01-01', '2024-03-31', 1],
  ['2024-01-01', '2024-01-01', 1],
  ['2021-01-01', '2023-12-31', 3],
  ['2015-09-01', '2020-08-31', 5],
  ['2013-09-01', '2020-08-31', 7],
  ['2020-01-01', '2021-06-30', 1],
  ['2020-01-01', '2021-07-01', 2],
])('derives inclusive whole years from %s to %s as %i', (fromDate, toDate, years) => {
  const point = { fromDate, toDate };
  expect(periodYears(point)).toBe(years);
  expect(observationPeriodType(point)).toBe(`${years}-year`);
  expect(isRollingPeriod(point)).toBe(years > 1);
});

it.each(['1-year', '2-year', '3-year', '5-year', '7-year', '12-year'])(
  'accepts period type %s',
  (type) => {
    expect(isObservationPeriodType(type)).toBe(true);
  },
);

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
