import { rankingAreaSeries } from '@fphd/utils/observation-series';
import { expect, it } from 'vitest';
import { observation, selected, sex } from '../view.testing.ts';
import { loadRankingScatterComparison, loadScatterComparison } from './scatter-loader.ts';

function pair(xYear = 2024, yYear = 2024) {
  return [selected(108), selected(241)].map((entry, index) => ({
    ...entry,
    areaData: [
      {
        areaCode: 'A',
        areaName: 'Area A',
        observations: [
          {
            ...observation(index ? 20 : 0),
            fromDate: `${index ? yYear : xYear}-01-01`,
            toDate: `${index ? yYear : xYear}-12-31`,
          },
        ],
      },
    ],
  }));
}
it('pairs matching ranking periods and preserves zeroes and saved axes', () => {
  const params = new URLSearchParams('scatter-x=241&scatter-y=108');
  expect(loadRankingScatterComparison(pair(), params)?.points).toMatchObject([
    { code: 'A', x: 20, y: 0, period: '2024-01-01|2024-12-31' },
  ]);
});
it('requests a common-period read when ranking periods differ', () => {
  expect(loadRankingScatterComparison(pair(2024, 2023), new URLSearchParams())).toBeUndefined();
});
it('does not treat disjoint latest areas as an empty history', () => {
  const indicators = pair();
  const other = indicators[1]?.areaData[0];
  if (!other) throw new Error('Expected area');
  other.areaCode = 'B';
  expect(loadRankingScatterComparison(indicators, new URLSearchParams())).toBeUndefined();
});
it('preserves bounded headline election for sex variants', () => {
  const indicators = pair();
  for (const entry of indicators)
    for (const area of entry.areaData)
      for (const point of area.observations) point.dimensions = [sex('Female')];
  expect(loadRankingScatterComparison(indicators, new URLSearchParams())).toBeUndefined();
});

it.each(['Age', 'Ethnicity'])(
  'reads history when rankings hide an earlier matching %s segment',
  (type) => {
    const point = (year: number, value: number, segment: string) => ({
      ...observation(value, [{ type, value: segment, dimensionClass: 'core', sortOrder: 1 }]),
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    });
    const indicators = [selected(108), selected(241)].map((entry, index) => ({
      ...entry,
      areaData: [
        {
          areaCode: 'A',
          areaName: 'Area A',
          observations: index
            ? [point(2023, 20, 'First'), point(2024, 21, 'First')]
            : [point(2023, 0, 'First')],
        },
        { areaCode: 'B', areaName: 'Area B', observations: [point(2024, 30, 'Second')] },
      ],
    }));
    const params = new URLSearchParams();
    expect(loadScatterComparison(indicators, params)?.points).toMatchObject([
      { code: 'A', x: 0, y: 20, period: '2023-01-01|2023-12-31' },
    ]);
    const ranking = indicators.map((entry) => ({
      ...entry,
      areaData: rankingAreaSeries(entry.areaData),
    }));
    expect(loadRankingScatterComparison(ranking, params)).toBeUndefined();
  },
);
