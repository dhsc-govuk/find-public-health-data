import { expect, it } from 'vitest';
import { comparisonTable } from '../indicator/comparison.ts';
import type { ComparisonRow } from '../indicator/data.ts';
import { benchmarkJudgement, recentTrend } from '../indicator/data.ts';
import type { IndicatorObservation, SelectedIndicator } from '../indicator/loader.ts';
import { selected } from '../indicator/view.testing.ts';
import {
  englandObservation,
  JUDGEMENT_LABELS,
  topicJudgement,
  topicTableSelection,
} from './data.ts';

function observation(year: number, value: number | null): IndicatorObservation {
  return {
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    value,
    dimensions: [],
    notes: [],
    count: null,
    numerator: null,
    denominator: null,
    lowerCi95: null,
    upperCi95: null,
    lowerCi998: null,
    upperCi998: null,
  };
}

it('uses England for the area row period rather than a newer England observation', () => {
  const entry = {
    areaData: [
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [observation(2023, 10), observation(2024, 20)],
      },
    ],
  } as SelectedIndicator;
  const row: Pick<ComparisonRow, 'sex' | 'periodType' | 'series'> = {
    sex: '',
    periodType: 'all',
    series: [observation(2023, 8)],
  };
  expect(englandObservation(entry, row)?.value).toBe(10);
  expect(englandObservation(entry, { ...row, series: [observation(2022, 8)] })).toBeUndefined();
});

it('retains the displayed values, valid trend points and older England benchmark when compacting history', () => {
  const entry = {
    detail: {
      shortId: 1,
      name: 'Indicator',
      slug: 'indicator',
      unit: '%',
      yearType: null,
      polarity: 'lower-is-better',
      comparatorMethod: null,
    },
    areaData: [
      {
        areaCode: 'E07000223',
        areaName: 'Adur',
        observations: Array.from({ length: 20 }, (_, index) =>
          observation(2000 + index, index === 18 ? null : index),
        ),
      },
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: Array.from({ length: 30 }, (_, index) =>
          observation(2000 + index, index + 10),
        ),
      },
    ],
  } as SelectedIndicator;
  const project = (selected: SelectedIndicator[]) => {
    const model = comparisonTable(selected, { regionByCode: {}, levelByCode: {} }, 'england');
    return model.rows.map((row) => ({
      period: row.period,
      cells: row.cells.map((cell) => {
        const benchmark = model.benchmarkCellFor(row, cell);
        return {
          value: cell.value,
          count: cell.count,
          trend: model.trendOf(row, cell),
          benchmark: benchmark?.value,
          judgement: benchmarkJudgement(
            benchmark?.areaObservation,
            benchmark?.value ?? null,
            entry.detail,
          ),
        };
      }),
    }));
  };
  const compact = topicTableSelection([entry]);
  expect(project(compact)).toEqual(project([entry]));
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify([entry]).length / 2);
  expect(
    compact[0]?.areaData[1]?.observations.some(({ fromDate }) => fromDate === '2019-01-01'),
  ).toBe(true);
});

it('sends only displayed area values and their matching England benchmarks when trends are not shown', () => {
  const entry = {
    detail: {
      shortId: 1,
      name: 'Indicator',
      unit: '%',
      yearType: null,
      polarity: 'lower-is-better',
    },
    areaData: [
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: Array.from({ length: 30 }, (_, index) => observation(2000 + index, index)),
      },
      {
        areaCode: 'E07000223',
        areaName: 'Adur',
        observations: Array.from({ length: 20 }, (_, index) => observation(2000 + index, index)),
      },
    ],
  } as SelectedIndicator;
  const compact = topicTableSelection([entry], 0);
  expect(compact[0]?.areaData[0]?.observations.map(({ fromDate }) => fromDate)).toEqual([
    '2019-01-01',
    '2029-01-01',
  ]);
  expect(compact[0]?.areaData[1]?.observations.map(({ fromDate }) => fromDate)).toEqual([
    '2019-01-01',
  ]);
  const model = comparisonTable(compact, { regionByCode: {}, levelByCode: {} }, 'england');
  const row = model.rows[0];
  const cell = row?.cells.find(({ areaCode }) => areaCode === 'E07000223');
  expect(row && cell && model.benchmarkCellFor(row, cell)?.value).toBe(19);
});

it('keeps eight sparkline periods including gaps alongside the unchanged five valid trend inputs', () => {
  const entry = selected();
  const series = [20, 19, 18, 17, 16, 15, null, null, null, null, null, null, 2, 1].map(
    (value, index) => observation(2000 + index, value),
  );
  entry.areaData = [{ areaCode: 'E92000001', areaName: 'England', observations: series }];
  const recent = topicTableSelection([entry]);
  const sparkline = topicTableSelection([entry], 5, 8);
  const points = sparkline[0]?.areaData[0]?.observations ?? [];
  expect(points.slice(-8)).toEqual(series.slice(-8));
  expect(points).toHaveLength(11);
  expect(points.filter(({ value }) => value !== null)).toEqual(
    recent[0]?.areaData[0]?.observations,
  );
  expect(recentTrend(points, entry.detail.polarity)).toEqual(
    recentTrend(series, entry.detail.polarity),
  );
});

it('retains eight rolling periods when annual and rolling observations share the headline series', () => {
  const entry = selected();
  const annual = Array.from({ length: 12 }, (_, index) => observation(2010 + index, index));
  const rolling = annual.map((point, index) => ({ ...point, toDate: `${2012 + index}-12-31` }));
  entry.areaData = [
    { areaCode: 'E92000001', areaName: 'England', observations: [...annual, ...rolling] },
  ];
  const compact = topicTableSelection([entry], 5, 8);
  const points = compact[0]?.areaData[0]?.observations ?? [];
  expect(
    points.filter(({ fromDate, toDate }) => toDate.slice(0, 4) !== fromDate.slice(0, 4)),
  ).toEqual(rolling.slice(-8));
});

it('uses the same no-comparison judgement and label for indicators without polarity', () => {
  const detail = { polarity: 'no-polarity' } as SelectedIndicator['detail'];
  expect(JUDGEMENT_LABELS[topicJudgement(observation(2024, 10), 5, detail)]).toBe(
    'No comparison available',
  );
});
