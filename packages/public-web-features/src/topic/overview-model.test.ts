import { tableSummary } from '@fphd/utils/observation-series';
import { publicYearType } from '@fphd/utils/period-type';
import { expect, it } from 'vitest';
import type { SelectedIndicator } from '../indicator/loader.ts';
import { indicatorDetail, observation } from '../indicator/view.testing.ts';
import { topicTableSelection } from './data.ts';
import { topicOverviewModel } from './overview-model.ts';

const area = {
  areaCode: 'E12000001',
  areaName: 'North East',
  observations: [2023, 2024].map((year, index) => ({
    ...observation(index === 0 ? 10 : 0),
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    count: index === 0 ? 100 : null,
  })),
};

const selected: SelectedIndicator = {
  detail: indicatorDetail(1, {
    name: 'Indicator',
    slug: 'indicator',
    polarity: 'lower-is-better',
    definition: 'Unused metadata',
  }),
  areaData: [area],
};

it('returns only the displayed headline and sparkline points without raw data or metadata', () => {
  const [highlight] = topicOverviewModel([selected], area.areaCode);
  expect(highlight).toEqual({
    shortId: 1,
    name: 'Indicator',
    slug: 'indicator',
    unit: '%',
    areaName: 'North East',
    period: '2024',
    count: null,
    value: 0,
    hasTrend: true,
    points: [
      { label: '2023', shortLabel: '2023', value: 10 },
      { label: '2024', shortLabel: '2024', value: 0 },
    ],
    trend: {
      direction: null,
      label: 'Trend unavailable',
      tone: 'grey',
      reason: 'not enough data points',
    },
  });
  expect(JSON.stringify(highlight)).not.toMatch(
    /observations|definition|Unused metadata|dimensions|notes|denominator|lowerCi|yearType|tableSeries/,
  );
});

it('sorts and bounds the sparkline to eight periods while taking the headline from the last non-null value', () => {
  const observations = Array.from({ length: 12 }, (_, index) => ({
    ...observation(index),
    value: index === 4 || index > 9 ? null : index === 9 ? 0 : index,
    fromDate: `${2013 + index}-01-01`,
    toDate: `${2013 + index}-12-31`,
    count: index === 9 ? 1234 : null,
  }));
  const [highlight] = topicOverviewModel(
    [
      {
        ...selected,
        areaData: [{ ...area, observations: [...observations].reverse() }],
      },
    ],
    area.areaCode,
  );
  expect(highlight).toMatchObject({ period: '2022', count: 1234, value: 0, hasTrend: true });
  expect(highlight?.points).toEqual(
    observations.slice(-8).map(({ fromDate, value }) => ({
      label: fromDate.slice(0, 4),
      shortLabel: fromDate.slice(0, 4),
      value,
    })),
  );
});

it('prefers three-year periods and shows the chosen area rather than England', () => {
  const annual = [10, 20, 30].map((value, index) => ({
    ...observation(value),
    fromDate: `${2022 + index}-01-01`,
    toDate: `${2022 + index}-12-31`,
  }));
  const rolling = annual.map((point, index) => ({
    ...point,
    fromDate: `${2020 + index}-01-01`,
    value: 100 - index,
    count: 186_922,
  }));
  const [highlight] = topicOverviewModel(
    [
      {
        ...selected,
        areaData: [
          { areaCode: 'E92000001', areaName: 'England', observations: annual },
          { ...area, observations: [...annual, ...rolling].reverse() },
        ],
      },
    ],
    area.areaCode,
  );
  expect(highlight).toMatchObject({
    areaName: 'North East',
    period: '2022 to 2024',
    count: 186_922,
    value: 98,
    trend: { direction: null, reason: 'multi-year periods' },
    points: rolling.map(({ fromDate, toDate, value }) => ({
      label: `${fromDate.slice(0, 4)} to ${toDate.slice(0, 4)}`,
      shortLabel: `${fromDate.slice(0, 4)}-${toDate.slice(2, 4)}`,
      value,
    })),
  });
});

it('expands financial years in the headline and chart while keeping endpoint labels compact', () => {
  const [highlight] = topicOverviewModel([
    {
      ...selected,
      detail: { ...selected.detail, yearType: publicYearType('financial', null) },
      areaData: [
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [{ ...observation(), fromDate: '2024-04-01', toDate: '2025-03-31' }],
        },
      ],
    },
  ]);
  expect(highlight).toMatchObject({
    period: '2024 to 2025',
    points: [{ label: '2024 to 2025', shortLabel: '2024/25', value: 12 }],
  });
});

it.each([0, 1234, null])('shows count %s in the single Count row', (count) => {
  const [highlight] = topicOverviewModel(
    [
      {
        ...selected,
        areaData: [{ ...area, observations: [{ ...observation(), count }] }],
      },
    ],
    area.areaCode,
  );
  expect(highlight?.count).toBe(count);
});

it.each([
  ['', 'up', 'up'],
  ['', null, null],
] as const)(
  'uses the selected period trend only for the matching segment %s and direction %s',
  (segment, direction, expected) => {
    const [highlight] = topicOverviewModel(
      [
        {
          ...selected,
          areaData: [
            {
              ...area,
              observations: [5, 4, 3, 2, 1].map((value, index) => ({
                ...observation(value),
                fromDate: `${2020 + index}-01-01`,
                toDate: `${2020 + index}-12-31`,
              })),
            },
          ],
          tableSeries: [
            {
              sex: '',
              periodType: 'all',
              segments: { E12000001: `${segment}|1-year` },
              trends: { E12000001: direction },
            },
            {
              sex: '',
              periodType: '1-year',
              segments: { E12000001: `${segment}|1-year` },
              trends: { E12000001: direction },
            },
          ],
        },
      ],
      area.areaCode,
    );
    expect(highlight?.trend.direction).toBe(expected);
  },
);

it.each([{ observations: [] }, { observations: [{ ...observation(), value: null }] }])(
  'keeps no-data fallbacks when there are no valid values in %j',
  ({ observations }) => {
    const [highlight] = topicOverviewModel([
      {
        ...selected,
        areaData: observations.length
          ? [{ areaCode: 'E92000001', areaName: 'England', observations }]
          : [],
      },
    ]);
    expect(highlight).toMatchObject({
      areaName: 'England',
      period: 'No data',
      count: null,
      value: null,
      hasTrend: false,
      trend: { direction: null, reason: 'not enough data points' },
    });
  },
);

it("shows England's figures when no area is chosen, even with data for another area", () => {
  const england = {
    areaCode: 'E92000001',
    areaName: 'England',
    observations: area.observations.map((point) => ({ ...point, value: 50, count: 5000 })),
  };
  const [highlight] = topicOverviewModel([{ ...selected, areaData: [area, england] }]);
  expect(highlight).toMatchObject({ areaName: 'England', value: 50, count: 5000 });
});

it.each([{ observations: [] }, { observations: [{ ...observation(), value: null }] }])(
  'never substitutes England when the chosen area has no values in %j',
  ({ observations }) => {
    const england = { areaCode: 'E92000001', areaName: 'England', observations: [observation(50)] };
    for (const areaData of [[england], [england, { ...area, observations }]]) {
      const [highlight] = topicOverviewModel(
        [{ ...selected, areaData }],
        area.areaCode,
        area.areaName,
      );
      expect(highlight).toMatchObject({
        period: 'No data',
        value: null,
        count: null,
        hasTrend: false,
      });
      expect(highlight?.areaName).toBe('North East');
    }
  },
);

it.each([5, 7])(
  'keeps a %i year highlight separate from shorter periods after history compaction',
  (years) => {
    const points = (length: number) =>
      Array.from({ length: 10 }, (_, index) => ({
        ...observation(length * 100 + index),
        fromDate: `${2000 + index}-09-01`,
        toDate: `${2000 + index + length}-08-31`,
      }));
    const entry = {
      ...selected,
      areaData: [{ ...area, observations: [...points(3), ...points(years)] }],
    };
    const compact = topicTableSelection([entry], 5, 8);
    const [highlight] = topicOverviewModel(compact, area.areaCode);
    expect(highlight?.value).toBe(years * 100 + 9);
    expect(highlight?.trend).toMatchObject({ reason: 'multi-year periods' });
    expect(highlight?.points.map(({ value }) => value)).toEqual(
      points(years)
        .slice(-8)
        .map(({ value }) => value),
    );
  },
);

it.each([false, true])('uses the headline period election for sexed=%s', (sexed) => {
  const points = [3, 5].map((years) => ({
    ...observation(years),
    fromDate: '2020-01-01',
    toDate: `${2020 + years - 1}-12-31`,
    dimensions: sexed
      ? [{ type: 'Sex', value: 'Female', sortOrder: 1, dimensionClass: 'core' }]
      : [],
  }));
  const [highlight] = topicOverviewModel(
    [{ ...selected, areaData: [{ ...area, observations: points }] }],
    area.areaCode,
  );
  expect(highlight?.value).toBe(5);
});

it('keeps the cached population when the remaining histories would elect another', () => {
  const points = ['A', 'B'].map((age) => ({
    ...observation(age === 'A' ? 999 : 12),
    dimensions: [{ type: 'Age', value: age, sortOrder: 1, dimensionClass: 'core' }],
  }));
  const [highlight] = topicOverviewModel(
    [
      {
        ...selected,
        areaData: [{ ...area, observations: points }],
        tableSeries: [
          { sex: '', periodType: 'all', segments: { [area.areaCode]: 'Age:B|1-year' } },
        ],
      },
    ],
    area.areaCode,
  );
  expect(highlight?.value).toBe(12);
});

it('keeps the full-history headline after sexed period histories are bounded', () => {
  const points = (years: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      ...observation(years * 100 + index),
      fromDate: `${2000 + index}-01-01`,
      toDate: `${2000 + index + years - 1}-12-31`,
      dimensions: [{ type: 'Sex', value: 'Female', sortOrder: 1, dimensionClass: 'core' }],
    }));
  const compact = tableSummary(
    [{ ...area, observations: [...points(3, 12), ...points(5, 10)] }],
    'sparkline',
  );
  const [highlight] = topicOverviewModel([{ ...selected, ...compact }], area.areaCode);
  expect(highlight?.value).toBe(311);
  expect(highlight?.points).toHaveLength(8);
});
