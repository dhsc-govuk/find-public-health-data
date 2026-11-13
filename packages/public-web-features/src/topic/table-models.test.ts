import { tableAreaSeries, tableSummary } from '@fphd/utils/observation-series';
import { expect, it } from 'vitest';
import { recentTrend } from '../indicator/data.ts';
import type { IndicatorObservation, SelectedIndicator } from '../indicator/loader.ts';
import { sortTopicAreaTable, topicAreaTableModel, topicDataTableModel } from './table-models.ts';

const observation = (year: number, value: number): IndicatorObservation => ({
  fromDate: `${year}-01-01`,
  toDate: `${year}-12-31`,
  value,
  count: value * 10,
  numerator: value * 5,
  denominator: null,
  dimensions: [],
  notes: [],
  lowerCi95: value - 1,
  upperCi95: value + 1,
  lowerCi998: null,
  upperCi998: null,
});
const entry = {
  detail: {
    shortId: 1,
    name: 'Indicator',
    slug: 'indicator',
    unit: '%',
    yearType: null,
    polarity: 'lower-is-better',
    comparatorMethod: 'Confidence intervals overlapping reference value',
    topics: [{ slug: 'diabetes', subtopics: [{ title: 'Care and treatment' }] }],
    dataUpdatedAt: '2024-04-01T00:00:00Z',
  },
  areaData: [
    {
      areaCode: 'E92000001',
      areaName: 'England',
      observations: Array.from({ length: 10 }, (_, index) => observation(2015 + index, 20 + index)),
    },
    {
      areaCode: 'E12000001',
      areaName: 'North East',
      observations: Array.from({ length: 9 }, (_, index) => observation(2015 + index, 10 + index)),
    },
  ],
} as SelectedIndicator;

it('keeps identical table values, trends and benchmarks after compacting unused breakdowns', () => {
  const source = structuredClone(entry);
  const area = source.areaData[1];
  if (!area) throw new Error('Area fixture missing');
  area.observations.push(
    ...Array.from({ length: 30 }, (_, i) => ({
      ...observation(1995 + i, i),
      dimensions: [
        {
          type: 'Deprivation',
          value: 'Least deprived',
          dimensionClass: 'inequality',
          sortOrder: 1,
        },
      ],
    })),
  );
  const compact = { ...source, areaData: tableAreaSeries(source.areaData) };
  expect(compact.areaData[1]?.observations.length).toBeLessThan(area.observations.length);
  expect(topicDataTableModel([compact], 'diabetes')).toEqual(
    topicDataTableModel([source], 'diabetes'),
  );
  expect(topicAreaTableModel([compact], { regionByCode: {}, levelByCode: {} }, 'diabetes')).toEqual(
    topicAreaTableModel([source], { regionByCode: {}, levelByCode: {} }, 'diabetes'),
  );
});

it('preserves table values, trends, missing values and older England benchmarks with bounded histories', () => {
  const source = structuredClone(entry);
  const local = source.areaData[1];
  if (!local) throw new Error('Expected a local area');
  local.observations = local.observations.slice(0, 2);
  local.observations.push({ ...observation(2017, 0), value: null });
  const compact = { ...source, ...tableSummary(source.areaData, 'latest') };
  expect(compact.areaData[0]?.observations.length).toBeLessThan(
    source.areaData[0]?.observations.length ?? 0,
  );
  expect(topicDataTableModel([compact], 'diabetes')).toEqual(
    topicDataTableModel([source], 'diabetes'),
  );
  expect(topicAreaTableModel([compact], { regionByCode: {}, levelByCode: {} }, 'diabetes')).toEqual(
    topicAreaTableModel([source], { regionByCode: {}, levelByCode: {} }, 'diabetes'),
  );
});

it('elects the same series when trimming would make two histories the same length', () => {
  const source = structuredClone(entry);
  for (const area of source.areaData) {
    const long = area.observations.map((point) => ({
      ...point,
      dimensions: [{ type: 'Age', value: '45+', sortOrder: 1, dimensionClass: 'core' }],
    }));
    const short = long.slice(-6).map((point) => ({
      ...point,
      value: (point.value ?? 0) + 100,
      dimensions: [{ type: 'Age', value: '65+', sortOrder: 2, dimensionClass: 'core' }],
    }));
    area.observations = [...short, ...long];
  }
  const compact = { ...source, ...tableSummary(source.areaData, 'latest') };
  expect(topicDataTableModel([compact], 'diabetes')).toEqual(
    topicDataTableModel([source], 'diabetes'),
  );
  expect(topicAreaTableModel([compact], { regionByCode: {}, levelByCode: {} }, 'diabetes')).toEqual(
    topicAreaTableModel([source], { regionByCode: {}, levelByCode: {} }, 'diabetes'),
  );
});

it('serialises calculated table cells and trends without observation histories', () => {
  const model = topicDataTableModel([entry], 'diabetes');
  const cell = model.rows[0]?.cells.find(({ areaCode }) => areaCode === 'E12000001');
  expect(cell).toMatchObject({
    value: 18,
    count: 180,
    numerator: 90,
    trend: recentTrend(entry.areaData[1]?.observations ?? [], 'lower-is-better'),
  });
  expect(model.rows[0]).toMatchObject({ slug: 'indicator', subtopics: ['Care and treatment'] });
  expect(JSON.stringify(model)).not.toContain('observations');
  expect(JSON.stringify(model).length).toBeLessThan(JSON.stringify([entry]).length / 3);
});

it('preserves aggregate row choices when the winning headline contains a sex dimension', () => {
  const source = structuredClone(entry);
  for (const area of source.areaData) {
    area.observations = area.observations.map((point) => ({
      ...point,
      dimensions: [{ type: 'Sex', value: 'Male', dimensionClass: 'core', sortOrder: 1 }],
    }));
    area.observations.push({
      ...observation(2024, 100),
      dimensions: [
        { type: 'Age', value: '45+', dimensionClass: 'core', sortOrder: 1 },
        {
          type: 'Deprivation',
          value: 'Least deprived',
          dimensionClass: 'inequality',
          sortOrder: 1,
        },
      ],
    });
  }
  const compact = { ...source, ...tableSummary(source.areaData, 'latest') };
  expect(topicDataTableModel([compact], 'diabetes')).toEqual(
    topicDataTableModel([source], 'diabetes'),
  );
});

it('keeps the same-period England comparison when an area has older data', () => {
  const model = topicAreaTableModel([entry], { regionByCode: {}, levelByCode: {} }, 'diabetes');
  expect(model.areas).toEqual([{ areaCode: 'E12000001', areaName: 'North East' }]);
  expect(model.rows[0]?.england).toMatchObject({ value: 28, period: '2023' });
  expect(model.rows[0]?.cells[0]).toMatchObject({ value: 18, period: '2023', judgement: 'better' });
  expect(JSON.stringify(model)).not.toContain('observations');
});

it.each([
  ['lower-is-better', 'first', ['Yorkshire', 'North East', 'North West'], [9, 3, 6], 'ascending'],
  [
    'lower-is-better',
    'reverse',
    ['North East', 'Yorkshire', 'North West'],
    [3, 9, 6],
    'descending',
  ],
  ['higher-is-better', 'first', ['North East', 'Yorkshire', 'North West'], [3, 9, 6], 'descending'],
  [
    'higher-is-better',
    'reverse',
    ['Yorkshire', 'North East', 'North West'],
    [9, 3, 6],
    'ascending',
  ],
  ['no-polarity', 'first', ['North East', 'Yorkshire', 'North West'], [3, 9, 6], 'descending'],
  ['no-polarity', 'reverse', ['Yorkshire', 'North East', 'North West'], [9, 3, 6], 'ascending'],
] as const)(
  'ranks %s areas in %s order, keeping missing values last and other rows aligned',
  (polarity, order, areas, alignedValues, direction) => {
    const source = {
      ...entry,
      detail: { ...entry.detail, polarity },
      areaData: [
        ...entry.areaData,
        { areaCode: 'E12000002', areaName: 'North West', observations: [] },
        { areaCode: 'E12000003', areaName: 'Yorkshire', observations: [observation(2023, 10)] },
      ],
    };
    const second = {
      ...source,
      detail: { ...source.detail, shortId: 2, name: 'Second indicator' },
      areaData: source.areaData.map((area, index) => ({
        ...area,
        observations: [observation(2023, index * 3)],
      })),
    };
    const model = topicAreaTableModel(
      [source, second],
      { regionByCode: {}, levelByCode: {} },
      'diabetes',
    );
    const sorted = sortTopicAreaTable(model, new URLSearchParams({ sortAreas: `${order}:1|` }));
    expect(sorted.areas.map(({ areaName }) => areaName)).toEqual(areas);
    expect(sorted.rows[1]?.cells.map(({ value }) => value)).toEqual(alignedValues);
    expect(sorted.rows[0]?.cells.at(-1)?.value).toBeNull();
    expect(sorted.columnSort).toEqual({ key: '1|', reverse: order === 'reverse', direction });
  },
);

it('orders recently updated rows by the data update date and puts unknown dates last', () => {
  const model = topicAreaTableModel(
    [
      entry,
      { ...entry, detail: { ...entry.detail, shortId: 2, name: 'Unknown', dataUpdatedAt: null } },
      {
        ...entry,
        detail: {
          ...entry.detail,
          shortId: 3,
          name: 'Latest',
          dataUpdatedAt: '2025-01-01T00:00:00Z',
        },
      },
    ],
    { regionByCode: {}, levelByCode: {} },
    'diabetes',
  );
  const { rows } = sortTopicAreaTable(
    model,
    new URLSearchParams({ areaRowSort: 'recently-updated' }),
  );
  expect(rows.map(({ name }) => name)).toEqual(['Latest', 'Indicator', 'Unknown']);
});

it.each(['', 'sortAreas=first:missing', 'sortAreas=first:1|'])(
  'aligns sparse table rows with all areas for %s',
  (query) => {
    const second = {
      ...entry,
      detail: { ...entry.detail, shortId: 2 },
      areaData: [
        { areaCode: 'E12000007', areaName: 'London', observations: [observation(2024, 15)] },
      ],
    };
    const model = topicAreaTableModel(
      [entry, second],
      { regionByCode: {}, levelByCode: {} },
      'diabetes',
    );
    const table = sortTopicAreaTable(model, new URLSearchParams(query));
    expect(table.areas.map(({ areaCode }) => areaCode).toSorted()).toEqual([
      'E12000001',
      'E12000007',
    ]);
    for (const row of table.rows) {
      expect(row.cells.map(({ areaCode }) => areaCode)).toEqual(
        table.areas.map(({ areaCode }) => areaCode),
      );
    }
    expect(table.rows[0]?.cells.find(({ areaCode }) => areaCode === 'E12000007')).toEqual({
      areaCode: 'E12000007',
      value: null,
      period: 'No data',
      notes: [],
      judgement: 'none',
    });
  },
);
