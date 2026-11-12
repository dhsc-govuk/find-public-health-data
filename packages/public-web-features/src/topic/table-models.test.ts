import { tableAreaSeries, tableSummary } from '@fphd/utils/observation-series';
import { expect, it } from 'vitest';
import { recentTrend } from '../indicator/data.ts';
import type { IndicatorObservation, SelectedIndicator } from '../indicator/loader.ts';
import { topicAreaTableModel, topicDataTableModel } from './table-models.ts';

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

it('keeps England beside picked areas and judges each area against it', () => {
  const model = topicDataTableModel([entry], 'diabetes');
  expect(model.areas).toEqual([{ code: 'E12000001', name: 'North East' }]);
  expect(model.compared).toBe(true);
  expect(model.rows[0]?.england).toEqual({ value: 28, count: 280, numerator: 140 });
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
  lagging.areaData.push({
    areaCode: 'E12000002',
    areaName: 'North West',
    observations: Array.from({ length: 8 }, (_, index) => observation(2015 + index, 30 + index)),
  });
  const model = topicDataTableModel([lagging], 'diabetes');
  const [northEast, northWest] = model.rows[0]?.cells ?? [];
  expect(model.rows[0]?.period).toBe('2023');
  expect(model.rows[0]?.england?.value).toBe(28);
  expect(northEast).not.toHaveProperty('period');
  // North West's 2022 value (37) is above England's 2022 value (27), so worse for a
  // lower-is-better indicator, although it is below England's 2023 value shown.
  expect(northWest).toMatchObject({ value: 37, period: '2022', judgement: 'worse' });
});
