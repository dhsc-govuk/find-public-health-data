import { expect, it } from 'vitest';
import { comparisonTable } from './comparison.ts';
import type { IndicatorObservation, SelectedIndicator } from './loader.ts';

function point(value: number, type: string, population: string): IndicatorObservation {
  return {
    fromDate: '2023-01-01',
    toDate: '2023-12-31',
    value,
    lowerCi95: value - 1,
    upperCi95: value + 1,
    lowerCi998: null,
    upperCi998: null,
    count: null,
    denominator: null,
    notes: [],
    dimensions: [{ type, value: population, sortOrder: 1, dimensionClass: 'core' }],
  };
}
function selection(
  local: IndicatorObservation[],
  england: IndicatorObservation[],
): SelectedIndicator[] {
  return [
    {
      detail: {
        shortId: 1,
        name: 'Life expectancy',
        slug: 'life-expectancy',
        unit: 'years',
        yearType: null,
        polarity: 'higher-is-better',
        comparatorMethod: null,
      },
      areaData: [
        { areaCode: 'E07000223', areaName: 'Adur', observations: [] },
        { areaCode: 'E06000055', areaName: 'Bedford', observations: local },
        { areaCode: 'E92000001', areaName: 'England', observations: england },
      ],
    },
  ] as SelectedIndicator[];
}
it('keeps sexed rows and their matching benchmarks when the first selected area has no data', () => {
  const model = comparisonTable(
    selection(
      [point(80, 'Sex', 'Female'), point(75, 'Sex', 'Male')],
      [point(85, 'Sex', 'Female'), point(78, 'Sex', 'Male')],
    ),
    { regionByCode: {}, levelByCode: {} },
    'england',
  );
  expect(model.rows.map(({ sex }) => sex)).toEqual(['Female', 'Male']);
  const female = model.rows[0];
  if (!female) throw new Error('Female row missing');
  expect(female.cells[0]?.value).toBeNull();
  expect(female.cells[1]?.value).toBe(80);
  expect(
    model.benchmarkCellFor(female, female.cells[1] as (typeof female.cells)[number])?.value,
  ).toBe(85);
});
it('leaves an England benchmark unavailable when its age population does not match the local value', () => {
  const model = comparisonTable(
    selection([point(80, 'Age', '65 years')], [point(85, 'Age', 'All ages')]),
    { regionByCode: {}, levelByCode: {} },
    'england',
  );
  const row = model.rows[0];
  if (!row) throw new Error('Comparison row missing');
  expect(model.benchmarkCellFor(row, row.cells[1] as (typeof row.cells)[number])?.value).toBeNull();
});
