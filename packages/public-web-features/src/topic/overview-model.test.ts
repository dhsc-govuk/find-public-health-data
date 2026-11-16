import { publicYearType } from '@fphd/utils/period-type';
import { expect, it } from 'vitest';
import type { SelectedIndicator } from '../indicator/loader.ts';
import { indicatorDetail, observation } from '../indicator/view.testing.ts';
import { topicOverviewModel } from './overview-model.ts';

const area = {
  areaCode: 'E12000001',
  areaName: 'North East',
  observations: [2023, 2024].map((year, index) => ({
    ...observation(index === 0 ? 10 : 0),
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    count: null,
    numerator: index === 0 ? 100 : null,
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
  const [highlight] = topicOverviewModel([selected]);
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
  const [highlight] = topicOverviewModel([
    {
      ...selected,
      areaData: [{ ...area, observations: [...observations].reverse() }],
    },
  ]);
  expect(highlight).toMatchObject({ period: '2022', count: 1234, value: 0, hasTrend: true });
  expect(highlight?.points).toEqual(
    observations.slice(-8).map(({ fromDate, value }) => ({
      label: fromDate.slice(0, 4),
      shortLabel: fromDate.slice(0, 4),
      value,
    })),
  );
});

it('prefers three-year periods and the first selected area over England', () => {
  const annual = [10, 20, 30].map((value, index) => ({
    ...observation(value),
    fromDate: `${2022 + index}-01-01`,
    toDate: `${2022 + index}-12-31`,
  }));
  const rolling = annual.map((point, index) => ({
    ...point,
    fromDate: `${2020 + index}-01-01`,
    value: 100 - index,
    count: null,
    numerator: 186_922,
  }));
  const [highlight] = topicOverviewModel([
    {
      ...selected,
      areaData: [
        { areaCode: 'E92000001', areaName: 'England', observations: annual },
        { ...area, observations: [...annual, ...rolling].reverse() },
      ],
    },
  ]);
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

it.each([
  [0, 5678, 0],
  [1234, 5678, 1234],
  [null, 5678, 5678],
  [null, null, null],
])('uses count %s before numerator %s for the single Count row', (count, numerator, expected) => {
  const [highlight] = topicOverviewModel([
    {
      ...selected,
      areaData: [{ ...area, observations: [{ ...observation(), count, numerator }] }],
    },
  ]);
  expect(highlight?.count).toBe(expected);
});

it.each([
  ['', 'up', 'up'],
  ['Sex:Male', 'up', 'down'],
  ['', null, null],
] as const)(
  'uses the selected period trend only for the matching segment %s and direction %s',
  (segment, direction, expected) => {
    const [highlight] = topicOverviewModel([
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
            segments: { E12000001: '' },
            trends: { E12000001: 'down' },
          },
          {
            sex: '',
            periodType: '1-year',
            segments: { E12000001: segment },
            trends: { E12000001: direction },
          },
        ],
      },
    ]);
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
