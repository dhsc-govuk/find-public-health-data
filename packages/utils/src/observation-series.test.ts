import { expect, it } from 'vitest';

import { tableAreaSeries } from './observation-series.ts';

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
