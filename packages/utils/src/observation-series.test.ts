import { expect, it } from 'vitest';

import { rankingAreaSeries, tableAreaSeries } from './observation-series.ts';

function series(age: string, years: number[]) {
  return years.map((year) => ({
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    dimensions: [{ type: 'Age', value: age }],
  }));
}

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
