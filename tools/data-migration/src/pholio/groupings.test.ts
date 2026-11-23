import { expect, it } from 'vitest';
import { createObservationGroupings } from './groupings.ts';

const annual = {
  IndicatorID: 108,
  SexID: 4,
  AgeID: 1,
  YearRange: 1,
  BaselineYear: 2021,
  BaselineQuarter: -1,
  BaselineMonth: -1,
};
const observation = { ...annual, Year: 2022, Quarter: -1, Month: -1, YearTypeID: 1 };

it('distinguishes an unpublished year range from an unpublished period format', () => {
  const groupings = createObservationGroupings([annual]);
  expect(groupings.exclusionReason({ ...observation, YearRange: -1 })).toBe(
    'year_range_not_in_grouping',
  );
  expect(groupings.exclusionReason({ ...observation, Quarter: 3 })).toBe(
    'periodicity_not_in_grouping',
  );
  expect(groupings.exclusionReason(observation)).toBeUndefined();
});

it('retains every period format represented by the indicator groupings', () => {
  const groupings = createObservationGroupings([
    annual,
    { ...annual, BaselineQuarter: 1 },
    { ...annual, YearRange: 3 },
    { ...annual, YearRange: -1, BaselineMonth: 1 },
  ]);
  expect(groupings.exclusionReason({ ...observation, Quarter: 3 })).toBeUndefined();
  expect(groupings.exclusionReason({ ...observation, YearRange: 3 })).toBeUndefined();
  expect(groupings.exclusionReason({ ...observation, YearRange: -1, Month: 7 })).toBeUndefined();
  expect(groupings.exclusionReason({ ...observation, Quarter: 1, Month: 7 })).toBe(
    'periodicity_not_in_grouping',
  );
});

it('does not infer that missing groupings mean an indicator is unpublished', () => {
  const groupings = createObservationGroupings([]);
  expect(groupings.exclusionReason(observation)).toBeUndefined();
  expect(groupings.hasSeries(observation)).toBe(false);
});

it('uses sex and age only to identify the grouped series among duplicate candidates', () => {
  const groupings = createObservationGroupings([annual]);
  const breakdown = { ...observation, SexID: 1, AgeID: 28 };
  expect(groupings.exclusionReason(breakdown)).toBeUndefined();
  expect(groupings.hasSeries(breakdown)).toBe(false);
  expect(groupings.hasSeries(observation)).toBe(true);
  expect(groupings.hasSeries({ ...observation, SexID: -1 })).toBe(false);
});

it.each([
  [1, '2021-01-01'],
  [2, '2021-04-01'],
  [3, '2021-09-01'],
])('derives an annual baseline with source year type %i', (yearType, expected) => {
  expect(createObservationGroupings([annual]).publishedFrom(108, yearType)).toBe(expected);
});

it.each([
  [1, 3, '2022-07-01'],
  [2, 2, '2022-07-01'],
  [10, 1, '2022-04-01'],
  [10, 5, '2022-04-01'],
])(
  'derives a quarterly baseline for year type %i and quarter %i',
  (yearType, quarter, expected) => {
    const groupings = createObservationGroupings([
      { ...annual, BaselineYear: 2022, BaselineQuarter: quarter, YearRange: 5 },
    ]);
    expect(groupings.publishedFrom(108, yearType)).toBe(expected);
  },
);

it.each([
  [1, 11, '2021-11-01'],
  [2, 11, '2022-02-01'],
  [3, 1, '2021-04-01'],
])('derives a monthly baseline for year type %i and month %i', (yearType, month, expected) => {
  const groupings = createObservationGroupings([{ ...annual, BaselineMonth: month }]);
  expect(groupings.publishedFrom(108, yearType)).toBe(expected);
});

it('uses the earliest converted baseline across every grouping of the indicator', () => {
  const groupings = createObservationGroupings([
    { ...annual, BaselineYear: 2024 },
    { ...annual, BaselineYear: 2022, BaselineQuarter: 3, SexID: 1 },
    { ...annual, BaselineYear: 2022, BaselineQuarter: 1, AgeID: 28 },
    { ...annual, IndicatorID: 999, BaselineYear: 2000 },
  ]);
  expect(groupings.publishedFrom(108, 2)).toBe('2022-04-01');
});

it('returns null when the indicator has no groupings', () => {
  expect(createObservationGroupings([]).publishedFrom(108, 1)).toBeNull();
  expect(createObservationGroupings([annual]).publishedFrom(999, 1)).toBeNull();
});
