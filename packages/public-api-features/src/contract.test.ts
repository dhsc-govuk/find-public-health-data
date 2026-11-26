import { describe, expect, it } from 'vitest';
import {
  indicatorDetailSchema,
  indicatorPageDetailSchema,
  indicatorTableDataSchema,
} from './contract.ts';

const detail = {
  goal: null,
  shortId: 108,
  slug: 'under-75-mortality-rate-from-all-causes',
  name: 'Under 75 mortality rate from all causes',
  valueType: 'Directly standardised rate',
  unit: 'per 100,000',
  yearType: null,
  updateFrequency: 'annually',
  updateFrequencyReason: null,
  updateFrequencyText: null,
  updateFrequencyYears: null,
  polarity: 'lower-is-better',
  ciMethod: null,
  ciConfidenceLevel: null,
  comparatorMethod: null,
  dataUpdatedAt: null,
  firstPublishedAt: '2026-04-20T16:25:18.000Z',
  lastPublishedAt: '2026-04-20T16:25:18.000Z',
  definition: null,
  rationale: null,
  methodology: null,
  numeratorDefinition: null,
  denominatorDefinition: null,
  numeratorDisclosureControl: null,
  denominatorDisclosureControl: null,
  caveats: null,
  notes: null,
  dataSource: null,
  numeratorSources: [],
  denominatorSources: [],
  dataValues: [],
  areaTypes: [],
  topics: [],
  classifications: [],
  updateSummaries: [],
};

describe('indicatorDetailSchema', () => {
  it.each(['valueType', 'polarity'])('rejects a detail with no %s', (field) => {
    expect(indicatorDetailSchema.safeParse({ ...detail, [field]: null }).success).toBe(false);
  });

  const everyYears = (updateFrequencyYears: number) => ({
    ...detail,
    updateFrequency: 'every-n-years',
    updateFrequencyYears,
  });

  it.each([2, 99])('accepts %s years between updates', (years) => {
    expect(indicatorDetailSchema.safeParse(everyYears(years)).success).toBe(true);
  });

  it.each([1, 100, 2.5])('refuses %s years between updates', (years) => {
    expect(indicatorDetailSchema.safeParse(everyYears(years)).success).toBe(false);
  });

  it('drops an unanswered list and a data state, so the public page never shows a placeholder', () => {
    const parsed = indicatorDetailSchema.parse({
      ...detail,
      unanswered: ['unit'],
      dataState: 'no-upload',
    });

    expect(parsed).not.toHaveProperty('unanswered');
    expect(parsed).not.toHaveProperty('dataState');
  });
});

describe('indicatorPageDetailSchema', () => {
  it('accepts the public detail as it is', () => {
    expect(indicatorPageDetailSchema.parse(detail)).toEqual(detail);
  });

  it("accepts a draft's unanswered questions and its data state", () => {
    const draft = {
      ...detail,
      valueType: null,
      unit: null,
      polarity: null,
      updateFrequency: null,
      unanswered: ['valueType', 'unit', 'polarity', 'updateFrequency'],
      dataState: 'no-upload',
    };

    expect(indicatorPageDetailSchema.parse(draft)).toEqual(draft);
  });
});

it.each([
  'all',
  '1-year',
  '3-year',
  '5-year',
  '7-year',
  '12-year',
  '1-month',
  '3-month',
  '500-day',
])('accepts table series period type %s', (periodType) => {
  expect(
    indicatorTableDataSchema.safeParse([
      { detail, areaData: [], tableSeries: [{ sex: '', periodType, segments: {} }] },
    ]).success,
  ).toBe(true);
});

it.each([
  '0-year',
  '05-year',
  '5.5-year',
  '-5-year',
  '0-month',
  '03-month',
  '1.5-month',
  'invalid',
])('rejects invalid table series period type %s', (periodType) => {
  expect(
    indicatorTableDataSchema.safeParse([
      { detail, areaData: [], tableSeries: [{ sex: '', periodType, segments: {} }] },
    ]).success,
  ).toBe(false);
});
