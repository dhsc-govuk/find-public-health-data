import { rankingAreaSeries, tableAreaSeries, tableSummary } from '@fphd/utils/observation-series';
import { expect, it } from 'vitest';
import { observation, selected, sex } from '../view.testing.ts';
import {
  loadRankingScatterComparison,
  loadScatterComparison,
  scatterSexComparisons,
} from './scatter-loader.ts';

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
    {
      code: 'A',
      x: 20,
      y: 0,
      xPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
      yPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
    },
  ]);
});
it('pairs different latest ranking periods without requesting history', () => {
  expect(
    loadRankingScatterComparison(pair(2024, 2023), new URLSearchParams())?.points,
  ).toMatchObject([
    {
      code: 'A',
      x: 0,
      y: 20,
      xPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
      yPeriod: { fromDate: '2023-01-01', toDate: '2023-12-31' },
    },
  ]);
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
      {
        code: 'A',
        x: 0,
        y: 21,
        xPeriod: { fromDate: '2023-01-01', toDate: '2023-12-31' },
        yPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
      },
    ]);
    const ranking = indicators.map((entry) => ({
      ...entry,
      areaData: rankingAreaSeries(entry.areaData).map((area, index) => ({
        ...area,
        populationKeys: [
          ...new Set(
            entry.areaData[index]?.observations.map((point) => point.dimensions[0]?.value) ?? [],
          ),
        ].filter((key): key is string => key !== undefined),
      })),
    }));
    expect(loadRankingScatterComparison(ranking, params)).toBeUndefined();
  },
);

it('reads canonical headlines when ranking populations differ', () => {
  const indicators = pair();
  indicators.forEach((entry, index) => {
    entry.areaData = entry.areaData.map((area) => ({
      ...area,
      populationKeys: [String(index)],
      observations: area.observations.map((point) => ({
        ...point,
        dimensions: [
          { type: 'Age', value: String(index), dimensionClass: 'core', sortOrder: index },
        ],
      })),
    }));
  });
  expect(loadScatterComparison(indicators, new URLSearchParams())?.points).toMatchObject([
    { code: 'A', x: 0, y: 20 },
  ]);
  expect(loadRankingScatterComparison(indicators, new URLSearchParams())).toBeUndefined();
});

it('keeps the history fallback when population metadata is missing for any area', () => {
  const indicators = pair();
  indicators.forEach((entry, index) => {
    for (const area of entry.areaData)
      for (const point of area.observations)
        point.dimensions = [
          { type: 'Age', value: String(index), dimensionClass: 'core', sortOrder: index },
        ];
  });
  expect(loadRankingScatterComparison(indicators, new URLSearchParams())).toBeUndefined();
});

it('keeps the history fallback when the elected populations differ', () => {
  const point = (year: number, value: number, population: string, rolling = false) => ({
    ...observation(value, [
      { type: 'Age', value: population, dimensionClass: 'core', sortOrder: 1 },
    ]),
    fromDate: `${year}-01-01`,
    toDate: `${year + (rolling ? 2 : 0)}-12-31`,
  });
  const indicators = [selected(108), selected(241)].map((entry, index) => ({
    ...entry,
    areaData: [
      {
        areaCode: 'A',
        areaName: 'Area A',
        observations: [
          ...Array.from({ length: 5 }, (_, year) =>
            point(2010 + year, index ? 20 : 0, 'Shared', true),
          ),
          ...(index
            ? [point(2024, 21, 'Shared')]
            : Array.from({ length: 10 }, (_, year) => point(2015 + year, 10, 'Other'))),
        ],
      },
    ],
  }));
  const canonical = indicators.map((entry) => ({
    ...entry,
    areaData: tableSummary(tableAreaSeries(entry.areaData)).areaData,
  }));
  expect(loadScatterComparison(canonical, new URLSearchParams())?.points).toMatchObject([
    {
      code: 'A',
      x: 10,
      y: 20,
      xPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
      yPeriod: { fromDate: '2014-01-01', toDate: '2016-12-31' },
    },
  ]);
  const rankings = indicators.map((entry) => ({
    ...entry,
    areaData: rankingAreaSeries(entry.areaData).map((area) => ({
      ...area,
      populationKeys: ['Shared', 'Other'],
    })),
  }));
  expect(loadRankingScatterComparison(rankings, new URLSearchParams())).toBeUndefined();
});

it('pairs a selected sex with an unsexed indicator and retains axis qualifiers', () => {
  const indicators = pair();
  const first = indicators[0];
  if (!first) throw new Error('Expected indicator');
  const firstArea = first.areaData[0];
  if (!firstArea) throw new Error('Expected area');
  firstArea.observations = [observation(8, [sex('Female')]), observation(9, [sex('Male')])];
  const result = scatterSexComparisons(indicators, new URLSearchParams());
  expect(result.variants).toMatchObject([
    { sex: 'Female', axisSexes: ['Female', ''], points: [{ x: 8, y: 20 }] },
    { sex: 'Male', axisSexes: ['Male', ''], points: [{ x: 9, y: 20 }] },
  ]);
});

it('pairs each indicator’s own age population when choosing a common sex', () => {
  const indicators = pair();
  indicators.forEach((entry, index) => {
    const area = entry.areaData[0];
    if (!area) throw new Error('Expected area');
    area.observations = [
      observation(10, [
        sex('Female'),
        { type: 'Age', value: index ? '65+' : '18+', dimensionClass: 'core', sortOrder: 1 },
      ]),
    ];
  });
  expect(scatterSexComparisons(indicators, new URLSearchParams()).variants).toMatchObject([
    { sex: 'Female', points: [{ code: 'A', x: 10, y: 10 }] },
  ]);
});
