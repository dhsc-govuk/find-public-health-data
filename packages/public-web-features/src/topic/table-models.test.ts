import { tableAreaSeries, tableSummary } from '@fphd/utils/observation-series';
import { describe, expect, it } from 'vitest';
import { recentTrend } from '../indicator/data.ts';
import type { IndicatorObservation, SelectedIndicator } from '../indicator/loader.ts';
import { sortTopicAreaTable, topicAreaTableModel, topicDataTableModel } from './table-models.ts';

const observation = (year: number, value: number): IndicatorObservation => ({
  fromDate: `${year}-01-01`,
  toDate: `${year}-12-31`,
  value,
  count: value * 10,
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

it('keeps England beside picked areas and judges each area against it', () => {
  const model = topicDataTableModel([entry], 'diabetes');
  expect(model.areas).toEqual([{ code: 'E12000001', name: 'North East' }]);
  expect(model.compared).toBe(true);
  expect(model.rows[0]?.england).toEqual({ value: 28, count: 280 });
  expect(model.rows[0]?.cells[0]?.judgement).toBe('better');
});

it('leaves England as the only column when no area is picked', () => {
  const model = topicDataTableModel(
    [{ ...entry, areaData: entry.areaData.slice(0, 1) }],
    'diabetes',
  );
  expect(model.areas).toEqual([{ code: 'E92000001', name: 'England' }]);
  expect(model.compared).toBe(false);
  expect(model.rows[0]?.england).toBeNull();
  expect(model.rows[0]?.cells[0]?.judgement).toBeNull();
});

it('names the period of an area that lags the row and judges it against England for that period', () => {
  const lagging = structuredClone(entry);
  const england = lagging.areaData[0];
  if (!england) throw new Error('England fixture missing');
  england.observations = england.observations.map((point) =>
    point.fromDate === '2022-01-01' ? observation(2022, 20) : point,
  );
  lagging.areaData.push({
    areaCode: 'E12000002',
    areaName: 'North West',
    observations: Array.from({ length: 8 }, (_, index) => observation(2015 + index, 19 + index)),
  });
  const model = topicDataTableModel([lagging], 'diabetes');
  const [northEast, northWest] = model.rows[0]?.cells ?? [];
  expect(model.rows[0]?.period).toBe('2023');
  expect(model.rows[0]?.england?.value).toBe(28);
  expect(northEast).not.toHaveProperty('period');
  expect(northWest).toMatchObject({
    value: 26,
    period: '2022',
    judgement: 'worse',
    benchmark: { value: 20, period: '2022' },
  });
});

it('keeps England out of the picked areas when an indicator has data only for England', () => {
  const englandOnly = {
    ...structuredClone(entry),
    detail: { ...entry.detail, shortId: 2, slug: 'england-only' },
    areaData: structuredClone(entry.areaData.slice(0, 1)),
  } as SelectedIndicator;
  const model = topicDataTableModel([englandOnly, entry], 'diabetes');
  expect(model.compared).toBe(true);
  expect(model.areas).toEqual([{ code: 'E12000001', name: 'North East' }]);
  expect(model.rows.map(({ slug, england }) => [slug, england?.value])).toEqual([
    ['england-only', 29],
    ['indicator', 28],
  ]);
});

it('gives no period to an area whose latest observation has no value', () => {
  const missing = structuredClone(entry);
  missing.areaData.push({
    areaCode: 'E12000002',
    areaName: 'North West',
    observations: [
      ...Array.from({ length: 7 }, (_, index) => observation(2015 + index, 30 + index)),
      { ...observation(2022, 0), value: null },
    ],
  });
  const cell = topicDataTableModel([missing], 'diabetes').rows[0]?.cells.find(
    ({ areaCode }) => areaCode === 'E12000002',
  );
  expect(cell?.value).toBeNull();
  expect(cell).not.toHaveProperty('period');
});

it.each(['absent', 'older', 'null', 'different segment'])(
  'leaves the comparison unavailable when England has %s data for the area period',
  (availability) => {
    const source = structuredClone(entry);
    const england = source.areaData[0];
    if (!england) throw new Error('England fixture missing');
    england.observations =
      availability === 'absent'
        ? []
        : availability === 'older'
          ? [observation(2022, 28)]
          : availability === 'null'
            ? [{ ...observation(2023, 28), value: null }]
            : [
                {
                  ...observation(2023, 28),
                  dimensions: [
                    { type: 'Sex', value: 'Male', dimensionClass: 'core', sortOrder: 1 },
                  ],
                },
              ];
    if (availability === 'different segment') source.areaData.reverse();
    source.ranges = {
      'Statistical regions': [
        {
          fromDate: '2023-01-01',
          toDate: '2023-12-31',
          segment: '',
          min: 5,
          p25: 10,
          p75: 20,
          max: 30,
        },
      ],
    };
    const row = topicDataTableModel([source], 'diabetes', {
      regionByCode: {},
      levelByCode: { E12000001: 'Statistical regions' },
    }).rows[0];
    expect(row?.england?.value).toBeNull();
    expect(row?.england).toMatchObject({ min: 5, p25: 10, p75: 20, max: 30 });
    expect(row?.cells[0]).toMatchObject({ value: 18, judgement: null });
  },
);

it('keeps an older same-period benchmark visible when England has no data for the row period', () => {
  const source = structuredClone(entry);
  const england = source.areaData[0];
  if (!england) throw new Error('England fixture missing');
  england.observations = [observation(2022, 28)];
  source.areaData.push({
    areaCode: 'E12000002',
    areaName: 'North West',
    observations: [observation(2022, 18)],
  });
  const row = topicDataTableModel([source], 'diabetes').rows[0];
  expect(row?.england?.value).toBeNull();
  expect(row?.cells[0]?.judgement).toBeNull();
  expect(row?.cells[1]).toMatchObject({
    value: 18,
    period: '2022',
    judgement: 'better',
    benchmark: { value: 28, period: '2022' },
  });
});

it('does not attach a period label to an empty area cell', () => {
  const source = structuredClone(entry);
  for (const area of source.areaData) area.observations = [];
  const row = topicDataTableModel([source], 'diabetes').rows[0];
  expect(row?.period).toBe('');
  expect(row?.cells[0]?.value).toBeNull();
  expect(row?.cells[0]).not.toHaveProperty('period');
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

it('takes the row period and England benchmark from the newest picked area, not the first', () => {
  const source = structuredClone(entry);
  const [england, northEast] = source.areaData;
  if (!england || !northEast) throw new Error('Fixture areas missing');
  source.areaData = [
    england,
    {
      areaCode: 'E12000000',
      areaName: 'A lagging area',
      observations: Array.from({ length: 8 }, (_, index) => observation(2015 + index, 10 + index)),
    },
    northEast,
  ];
  const row = topicDataTableModel([source], 'diabetes').rows[0];
  const lagging = row?.cells.find(({ areaCode }) => areaCode === 'E12000000');
  const newest = row?.cells.find(({ areaCode }) => areaCode === 'E12000001');
  expect(row?.period).toBe('2023');
  expect(row?.england?.value).toBe(28);
  expect(newest).not.toHaveProperty('period');
  expect(lagging).toMatchObject({
    value: 17,
    period: '2022',
    benchmark: { value: 27, period: '2022' },
  });
});

it('matches each area’s spread by its level, dates and segment, and England’s by the newest area', () => {
  const point = (year: number, value: number, age = '45+') => ({
    ...observation(year, value),
    dimensions: [
      { type: 'Sex', value: 'Persons', dimensionClass: 'core', sortOrder: 1 },
      { type: 'Age', value: age, dimensionClass: 'core', sortOrder: 1 },
    ],
  });
  const source = {
    ...entry,
    areaData: [
      { areaCode: 'E12000003', areaName: 'Yorkshire', observations: [point(2022, 8)] },
      { areaCode: 'E12000001', areaName: 'North East', observations: [point(2023, 18)] },
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [point(2022, 28), point(2023, 29), point(2022, 99, '65+')],
      },
    ],
    ranges: {
      'Statistical regions': [
        {
          fromDate: '2022-01-01',
          toDate: '2022-12-31',
          segment: '65+|Persons',
          min: 100,
          max: 200,
        },
        {
          fromDate: '2021-01-01',
          toDate: '2022-12-31',
          segment: '45+|Persons',
          min: 101,
          max: 201,
        },
        {
          fromDate: '2022-01-01',
          toDate: '2022-12-31',
          segment: '45+|Persons',
          min: 2,
          p25: 5,
          p75: 25,
          max: 35,
        },
        { fromDate: '2023-01-01', toDate: '2023-12-31', segment: '45+|Persons', min: 3, max: 36 },
      ],
    },
  };
  const model = topicDataTableModel([source], 'diabetes', {
    regionByCode: {},
    levelByCode: { E12000003: 'Statistical regions', E12000001: 'Statistical regions' },
  });
  const [first] = model.rows;
  const cell = (code: string) => first?.cells.find(({ areaCode }) => areaCode === code);
  expect(first?.period).toBe('2023');
  expect(first?.england).toMatchObject({ value: 29, min: 3, max: 36 });
  expect(cell('E12000003')?.range).toEqual({ min: 2, p25: 5, p75: 25, max: 35 });
  expect(cell('E12000001')?.range).toMatchObject({ min: 3, max: 36 });
});

it('leaves the spread out when the area’s level has no range for its period', () => {
  const model = topicDataTableModel([entry], 'diabetes', {
    regionByCode: {},
    levelByCode: { E12000001: 'Statistical regions' },
  });
  expect(model.rows[0]?.cells[0]).not.toHaveProperty('range');
  expect(model.rows[0]?.england).not.toHaveProperty('min');
});

it.each([false, true])(
  'keeps a known level’s England spread when another area’s level is unknown (reversed: %s)',
  (reverse) => {
    const source = structuredClone(entry);
    source.areaData.push({
      areaCode: 'E12000003',
      areaName: 'Yorkshire',
      observations: [observation(2022, 12)],
    });
    if (reverse) source.areaData.reverse();
    source.ranges = {
      'Statistical regions': [
        {
          fromDate: '2023-01-01',
          toDate: '2023-12-31',
          segment: '',
          min: 10,
          p25: 15,
          p75: 20,
          max: 25,
        },
      ],
    };
    const model = topicDataTableModel([source], 'diabetes', {
      regionByCode: {},
      levelByCode: { E12000001: 'Statistical regions' },
    });
    expect(model.mixedGeographyLevels).toBeUndefined();
    expect(model.rows[0]?.england).toMatchObject({ min: 10, p25: 15, p75: 20, max: 25 });
    expect(
      model.rows[0]?.cells.find(({ areaCode }) => areaCode === 'E12000003'),
    ).not.toHaveProperty('range');
  },
);

it.each([false, true])(
  'does not present one level’s spread as shared by mixed levels (reversed: %s)',
  (reverse) => {
    const source = structuredClone(entry);
    const local = source.areaData[1];
    if (!local) throw new Error('Area fixture missing');
    source.areaData.push({
      areaCode: 'E08000003',
      areaName: 'Manchester',
      observations: [observation(2023, 12)],
    });
    if (reverse) source.areaData.reverse();
    source.ranges = {
      'Statistical regions': [
        {
          fromDate: '2023-01-01',
          toDate: '2023-12-31',
          segment: '',
          min: 10,
          p25: 15,
          p75: 20,
          max: 25,
        },
      ],
      'Local authorities': [
        {
          fromDate: '2023-01-01',
          toDate: '2023-12-31',
          segment: '',
          min: 1,
          p25: 5,
          p75: 30,
          max: 40,
        },
      ],
    };
    const model = topicDataTableModel([source], 'diabetes', {
      regionByCode: {},
      levelByCode: { E12000001: 'Statistical regions', E08000003: 'Local authorities' },
    });
    const row = model.rows[0];
    expect(row?.england).toEqual({ value: 28, count: 280 });
    expect(row?.cells.find(({ areaCode }) => areaCode === 'E12000001')?.range).toEqual({
      min: 10,
      p25: 15,
      p75: 20,
      max: 25,
    });
    expect(row?.cells.find(({ areaCode }) => areaCode === 'E08000003')?.range).toEqual({
      min: 1,
      p25: 5,
      p75: 30,
      max: 40,
    });
  },
);

describe('trend sorts', () => {
  const years = (values: number[]) =>
    values.map((value, index) => observation(2018 + index, value));
  const rolling = (point: IndicatorObservation) => ({
    ...point,
    fromDate: `${Number(point.fromDate.slice(0, 4)) - 2}-01-01`,
  });
  const bySex =
    (value: string, sortOrder: number) =>
    (point: IndicatorObservation): IndicatorObservation => ({
      ...point,
      dimensions: [{ type: 'Sex', value, dimensionClass: 'core', sortOrder }],
    });
  const indicator = (
    shortId: number,
    name: string,
    england: IndicatorObservation[],
    polarity = 'lower-is-better',
  ) =>
    ({
      detail: { ...entry.detail, shortId, name, slug: `indicator-${shortId}`, polarity },
      areaData: [{ areaCode: 'E92000001', areaName: 'England', observations: england }],
    }) as SelectedIndicator;
  const withAreas = (
    selected: SelectedIndicator,
    areas: Record<string, IndicatorObservation[]>,
  ): SelectedIndicator => ({
    ...selected,
    areaData: [
      ...Object.entries(areas).map(([areaName, observations]) => ({
        areaCode: areaName === 'London' ? 'E12000007' : 'E12000001',
        areaName,
        observations,
      })),
      ...selected.areaData,
    ],
  });
  const rising = [20, 21, 22, 23, 24, 25];
  const multiYear = indicator(1, 'Multi-year periods', years(rising).map(rolling));
  const gettingWorse = indicator(2, 'Getting worse', years(rising));
  const others = [
    indicator(3, 'Too few points', years([20, 21, 22])),
    indicator(4, 'No polarity', years(rising), 'no-polarity'),
    indicator(5, 'No significant change', years([20, 20, 20, 20, 20, 20])),
  ];
  // In the order the search listed them.
  const selected = [multiYear, gettingWorse, ...others];
  const names = (model: ReturnType<typeof topicDataTableModel>) =>
    model.rows.map(({ name, suffix }) => (suffix ? `${name} ${suffix}` : name));

  it.each(['trend-desc', 'trend-asc', 'trend-better', 'trend-worse'] as const)(
    'puts rows whose England trend is unavailable last under %s when no area is picked, keeping each group’s order',
    (sort) => {
      const model = topicDataTableModel(selected, 'diabetes', undefined, sort);
      expect(names(model)).toEqual([
        'Getting worse',
        'No polarity',
        'No significant change',
        'Multi-year periods',
        'Too few points',
      ]);
      expect(model.rows.map(({ cells }) => cells[0]?.trend.label)).toEqual([
        'Increasing and getting worse',
        'Increasing',
        'No significant change',
        'Trend unavailable',
        'Trend unavailable',
      ]);
    },
  );

  it.each(['subtopic-asc', 'name-asc', 'period-desc', undefined] as const)(
    'keeps the listed order under %s',
    (sort) => {
      expect(names(topicDataTableModel(selected, 'diabetes', undefined, sort))).toEqual([
        'Multi-year periods',
        'Getting worse',
        'Too few points',
        'No polarity',
        'No significant change',
      ]);
    },
  );

  it('puts rows whose picked area’s trend is unavailable last, whatever England’s trend', () => {
    const compared = [
      withAreas(multiYear, { 'North East': years(rising) }),
      withAreas(gettingWorse, { 'North East': years([20, 21]) }),
      ...others.map((each) => withAreas(each, { 'North East': years(rising) })),
    ];
    const model = topicDataTableModel(compared, 'diabetes', undefined, 'trend-worse');
    expect(model.areas).toEqual([{ code: 'E12000001', name: 'North East' }]);
    expect(names(model)).toEqual([
      'Multi-year periods',
      'Too few points',
      'No polarity',
      'No significant change',
      'Getting worse',
    ]);
    expect(model.rows.map(({ cells }) => cells[0]?.trend.direction ?? null)).toEqual([
      'up',
      'up',
      'up',
      'up',
      null,
    ]);
  });

  it('reads the first area column the table shows, not the first area picked', () => {
    const compared = [
      withAreas(multiYear, { 'North East': years([20, 21]), London: years(rising) }),
      withAreas(gettingWorse, { 'North East': years(rising), London: years([20, 21]) }),
    ];
    const model = topicDataTableModel(compared, 'diabetes', undefined, 'trend-desc');
    expect(model.areas.map(({ name }) => name)).toEqual(['London', 'North East']);
    expect(names(model)).toEqual(['Multi-year periods', 'Getting worse']);
  });

  it('moves only the row of an indicator whose England trend is unavailable', () => {
    const sexed = indicator(6, 'By sex', [
      ...years(rising).map(bySex('Female', 1)),
      ...years([20, 21]).map(bySex('Male', 2)),
    ]);
    const model = topicDataTableModel([sexed, gettingWorse], 'diabetes', undefined, 'trend-desc');
    expect(names(model)).toEqual(['By sex (Female)', 'Getting worse', 'By sex (Male)']);
  });
});
