import { describe, expect, it } from 'vitest';

import {
  type CountsAndValues,
  countsAndValuesAnswered,
  countsAndValuesQuestions,
  countsPhrase,
  valuesPhrase,
  valuesUnit,
} from './counts-and-values.ts';
import { VALUE_TYPE_IDS } from './value-type-and-unit.ts';

const UNANSWERED: CountsAndValues = {
  valueTypeId: null,
  hasCount: null,
  countMeasure: null,
  countMeasureDetail: null,
  ratePer: null,
  rateObject: null,
  rateObjectDetail: null,
  valueSameAsCount: null,
  valueMeasure: null,
  valueMeasureDetail: null,
  gapObject: null,
  gapObjectDetail: null,
  ratioFormat: null,
};

function answers(overrides: Partial<CountsAndValues>): CountsAndValues {
  return { ...UNANSWERED, ...overrides };
}

const NONE = {
  hasCount: false,
  countMeasure: false,
  rate: false,
  valueSameAsCount: false,
  valueMeasure: false,
  gapObject: false,
  ratioFormat: false,
};

describe('countsAndValuesQuestions', () => {
  it.each([
    ['Count', VALUE_TYPE_IDS.count, { countMeasure: true }],
    ['Crude rate', VALUE_TYPE_IDS.crudeRate, { hasCount: true, rate: true }],
    [
      'Directly standardised rate',
      VALUE_TYPE_IDS.directlyStandardisedRate,
      { hasCount: true, rate: true },
    ],
    [
      'Indirectly standardised rate',
      VALUE_TYPE_IDS.indirectlyStandardisedRate,
      { hasCount: true, rate: true },
    ],
    [
      'Indirectly standardised ratio',
      VALUE_TYPE_IDS.indirectlyStandardisedRatio,
      { hasCount: true },
    ],
    ['Proportion', VALUE_TYPE_IDS.proportion, { hasCount: true }],
    [
      'Indirectly standardised proportion',
      VALUE_TYPE_IDS.indirectlyStandardisedProportion,
      { hasCount: true },
    ],
    ['Ratio', VALUE_TYPE_IDS.ratio, { hasCount: true, ratioFormat: true }],
    ['Mean', VALUE_TYPE_IDS.mean, { valueMeasure: true }],
    ['Median', VALUE_TYPE_IDS.median, { valueMeasure: true }],
    ['Slope index of inequality', VALUE_TYPE_IDS.slopeIndexOfInequality, { valueMeasure: true }],
    [
      'Relative index of inequality',
      VALUE_TYPE_IDS.relativeIndexOfInequality,
      { valueMeasure: true },
    ],
    ['Gap', VALUE_TYPE_IDS.gap, { valueMeasure: true, gapObject: true }],
    ['Life expectancy', VALUE_TYPE_IDS.lifeExpectancy, {}],
    ['Healthy life expectancy', VALUE_TYPE_IDS.healthyLifeExpectancy, {}],
    ['Score', VALUE_TYPE_IDS.score, {}],
    ['no value type', null, {}],
  ])('asks of %s, before a count is answered, only its own questions', (_, valueTypeId, asks) => {
    expect(
      countsAndValuesQuestions({ valueTypeId, hasCount: null, valueSameAsCount: null }),
    ).toEqual({ ...NONE, ...asks });
  });

  it('asks what a counted rate is counting', () => {
    expect(
      countsAndValuesQuestions({
        valueTypeId: VALUE_TYPE_IDS.crudeRate,
        hasCount: true,
        valueSameAsCount: null,
      }),
    ).toEqual({ ...NONE, hasCount: true, countMeasure: true, rate: true });
  });

  it('asks of a counted proportion whether its value measures the same thing', () => {
    expect(
      countsAndValuesQuestions({
        valueTypeId: VALUE_TYPE_IDS.proportion,
        hasCount: true,
        valueSameAsCount: true,
      }),
    ).toEqual({ ...NONE, hasCount: true, countMeasure: true, valueSameAsCount: true });
  });

  it('asks what a proportion measures when its value measures something else', () => {
    expect(
      countsAndValuesQuestions({
        valueTypeId: VALUE_TYPE_IDS.proportion,
        hasCount: true,
        valueSameAsCount: false,
      }),
    ).toMatchObject({ valueSameAsCount: true, valueMeasure: true });
  });

  it('asks what a proportion with no count measures outright', () => {
    expect(
      countsAndValuesQuestions({
        valueTypeId: VALUE_TYPE_IDS.proportion,
        hasCount: false,
        valueSameAsCount: null,
      }),
    ).toEqual({ ...NONE, hasCount: true, valueMeasure: true });
  });
});

describe('countsPhrase and valuesPhrase', () => {
  it.each<[string, Partial<CountsAndValues>, string | null, string]>([
    [
      'a counted proportion of the same thing',
      {
        valueTypeId: VALUE_TYPE_IDS.proportion,
        hasCount: true,
        countMeasure: 'people',
        valueSameAsCount: true,
      },
      '[number] people',
      '[number]% of people',
    ],
    [
      'a counted proportion of something else',
      {
        valueTypeId: VALUE_TYPE_IDS.proportion,
        hasCount: true,
        countMeasure: 'admissions',
        valueSameAsCount: false,
        valueMeasure: 'people',
      },
      '[number] admissions',
      '[number]% of people',
    ],
    [
      'a counted rate',
      {
        valueTypeId: VALUE_TYPE_IDS.directlyStandardisedRate,
        hasCount: true,
        countMeasure: 'admissions',
        ratePer: 100000,
        rateObject: 'people',
      },
      '[number] admissions',
      '[number] admissions per 100,000 people',
    ],
    [
      'a rate with no count, per one',
      {
        valueTypeId: VALUE_TYPE_IDS.crudeRate,
        hasCount: false,
        ratePer: 1,
        rateObject: 'capita',
      },
      null,
      '[number] per capita',
    ],
    [
      'a rate per a million of an other object',
      {
        valueTypeId: VALUE_TYPE_IDS.crudeRate,
        hasCount: false,
        ratePer: 1000000,
        rateObject: 'other',
        rateObjectDetail: 'procedures',
      },
      null,
      '[number] per million procedures',
    ],
    [
      'a count of pounds',
      { valueTypeId: VALUE_TYPE_IDS.count, countMeasure: 'pounds' },
      null,
      '£[number]',
    ],
    [
      'a count of an other measure',
      { valueTypeId: VALUE_TYPE_IDS.count, countMeasure: 'other', countMeasureDetail: 'beds' },
      null,
      '[number] beds',
    ],
    [
      'a counted indirectly standardised ratio',
      {
        valueTypeId: VALUE_TYPE_IDS.indirectlyStandardisedRatio,
        hasCount: true,
        countMeasure: 'deaths',
      },
      null,
      '[number] deaths',
    ],
    [
      'an indirectly standardised ratio with no count',
      { valueTypeId: VALUE_TYPE_IDS.indirectlyStandardisedRatio, hasCount: false },
      null,
      '[number]',
    ],
    [
      'a gap',
      {
        valueTypeId: VALUE_TYPE_IDS.gap,
        valueMeasure: 'percentage-points',
        gapObject: 'employment-rates',
      },
      null,
      '[number] percentage points between employment rates',
    ],
    ['a mean', { valueTypeId: VALUE_TYPE_IDS.mean, valueMeasure: 'days' }, null, '[number] days'],
    ['a life expectancy', { valueTypeId: VALUE_TYPE_IDS.lifeExpectancy }, null, '[number] years'],
    [
      'a healthy life expectancy',
      { valueTypeId: VALUE_TYPE_IDS.healthyLifeExpectancy },
      null,
      '[number] years',
    ],
    [
      'a ratio as a percentage',
      { valueTypeId: VALUE_TYPE_IDS.ratio, hasCount: false, ratioFormat: 'percentage' },
      null,
      '[number]%',
    ],
    [
      'a ratio as a number',
      { valueTypeId: VALUE_TYPE_IDS.ratio, hasCount: false, ratioFormat: 'number' },
      null,
      '[number]',
    ],
    ['a score', { valueTypeId: VALUE_TYPE_IDS.score }, null, '[number]'],
  ])('phrases %s', (_, overrides, counts, values) => {
    expect(countsPhrase(answers(overrides))).toBe(counts);
    expect(valuesPhrase(answers(overrides))).toBe(values);
  });

  it('gives no phrases without a value type', () => {
    expect(countsPhrase(UNANSWERED)).toBeNull();
    expect(valuesPhrase(UNANSWERED)).toBeNull();
  });

  it('ignores answers the value type does not ask for', () => {
    const score = answers({
      valueTypeId: VALUE_TYPE_IDS.score,
      hasCount: true,
      countMeasure: 'people',
      ratePer: 1000,
      rateObject: 'people',
    });

    expect(countsPhrase(score)).toBeNull();
    expect(valuesPhrase(score)).toBe('[number]');
  });

  it.each<[string, Partial<CountsAndValues>, string]>([
    [
      'a rate with no object',
      { valueTypeId: VALUE_TYPE_IDS.crudeRate, ratePer: 100000 },
      '[number] per 100,000',
    ],
    ['a proportion with no measure', { valueTypeId: VALUE_TYPE_IDS.proportion }, '[number]%'],
    ['a mean with no measure', { valueTypeId: VALUE_TYPE_IDS.mean }, '[number]'],
    ['a count with no measure', { valueTypeId: VALUE_TYPE_IDS.count }, '[number]'],
  ])('phrases the values of %s from the answers it has', (_, overrides, values) => {
    expect(valuesPhrase(answers(overrides))).toBe(values);
  });
});

describe('valuesUnit', () => {
  it.each<[string, Partial<CountsAndValues>, string | null]>([
    [
      'the words after the number',
      {
        valueTypeId: VALUE_TYPE_IDS.crudeRate,
        hasCount: true,
        countMeasure: 'admissions',
        ratePer: 100000,
        rateObject: 'people',
      },
      'admissions per 100,000 people',
    ],
    [
      'a percentage with what it is of',
      { valueTypeId: VALUE_TYPE_IDS.proportion, hasCount: false, valueMeasure: 'people' },
      '% of people',
    ],
    ['pounds', { valueTypeId: VALUE_TYPE_IDS.mean, valueMeasure: 'pounds' }, '£'],
    ['nothing for the number alone', { valueTypeId: VALUE_TYPE_IDS.score }, null],
    ['nothing without a value type', {}, null],
  ])('is %s', (_, overrides, unit) => {
    expect(valuesUnit(answers(overrides))).toBe(unit);
  });
});

describe('countsAndValuesAnswered', () => {
  it('needs a value type', () => {
    expect(countsAndValuesAnswered(UNANSWERED)).toBe(false);
  });

  it('is answered by a value type that asks nothing more', () => {
    expect(countsAndValuesAnswered(answers({ valueTypeId: VALUE_TYPE_IDS.score }))).toBe(true);
  });

  it('needs every question the value type asks', () => {
    const rate = { valueTypeId: VALUE_TYPE_IDS.crudeRate, hasCount: false, ratePer: 1000 } as const;

    expect(countsAndValuesAnswered(answers(rate))).toBe(false);
    expect(countsAndValuesAnswered(answers({ ...rate, rateObject: 'people' }))).toBe(true);
  });

  it('needs the words for an Other choice', () => {
    const count = { valueTypeId: VALUE_TYPE_IDS.count, countMeasure: 'other' } as const;

    expect(countsAndValuesAnswered(answers(count))).toBe(false);
    expect(countsAndValuesAnswered(answers({ ...count, countMeasureDetail: 'beds' }))).toBe(true);
  });

  it('needs the questions the answers before it ask', () => {
    const proportion = { valueTypeId: VALUE_TYPE_IDS.proportion, hasCount: true } as const;

    expect(countsAndValuesAnswered(answers({ ...proportion, countMeasure: 'people' }))).toBe(false);
    expect(
      countsAndValuesAnswered(
        answers({ ...proportion, countMeasure: 'people', valueSameAsCount: true }),
      ),
    ).toBe(true);
  });
});
