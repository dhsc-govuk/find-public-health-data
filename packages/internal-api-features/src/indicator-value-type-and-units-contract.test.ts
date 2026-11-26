import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';

import {
  ENTER_POPULATION,
  SELECT_STANDARD_POPULATION,
  valueTypeAndUnitsSection as section,
} from './indicator-value-type-and-units-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const DSR = VALUE_TYPE_IDS.directlyStandardisedRate;

const empty = {
  valueTypeId: '',
  standardPopulation: '',
  standardPopulationOther: '',
  referencePopulation: '',
  hasCount: '',
  countMeasure: '',
  countMeasureDetail: '',
  countIsEstimate: '',
  ratePer: '',
  rateObject: '',
  rateObjectDetail: '',
  valueSameAsCount: '',
  valueMeasure: '',
  valueMeasureDetail: '',
  gapObject: '',
  gapObjectDetail: '',
  ratioFormat: '',
};

const countedRate = {
  ...empty,
  valueTypeId: VALUE_TYPE_IDS.crudeRate,
  hasCount: 'yes',
  countMeasure: 'admissions',
  ratePer: '100000',
  rateObject: 'people',
};

describe('valueTypeAndUnitsSection', () => {
  it('takes the typed answers without their surrounding spaces', () => {
    expect(
      section.schema.parse({
        ...empty,
        valueTypeId: DSR,
        standardPopulation: 'other',
        standardPopulationOther: ' England 2021\n',
        hasCount: 'no',
        ratePer: '1000',
        rateObject: 'other',
        rateObjectDetail: '\tprocedures ',
      }),
    ).toEqual({
      ...empty,
      valueTypeId: DSR,
      standardPopulation: 'other',
      standardPopulationOther: 'England 2021',
      hasCount: 'no',
      ratePer: '1000',
      rateObject: 'other',
      rateObjectDetail: 'procedures',
    });
  });

  it.each([
    ['a value type that asks nothing more', { ...empty, valueTypeId: VALUE_TYPE_IDS.score }],
    ['a counted rate', countedRate],
    ['a counted estimate', { ...countedRate, countIsEstimate: 'yes' }],
    [
      'a count of an other measure it names',
      {
        ...empty,
        valueTypeId: VALUE_TYPE_IDS.count,
        countMeasure: 'other',
        countMeasureDetail: 'beds',
      },
    ],
    [
      'a proportion of the same thing as its count',
      {
        ...empty,
        valueTypeId: VALUE_TYPE_IDS.proportion,
        hasCount: 'yes',
        countMeasure: 'people',
        valueSameAsCount: 'yes',
      },
    ],
    [
      'a proportion with no count, of what it measures',
      {
        ...empty,
        valueTypeId: VALUE_TYPE_IDS.proportion,
        hasCount: 'no',
        valueMeasure: 'people',
      },
    ],
    [
      'a gap between what it names',
      {
        ...empty,
        valueTypeId: VALUE_TYPE_IDS.gap,
        valueMeasure: 'percentage-points',
        gapObject: 'employment-rates',
      },
    ],
    [
      'a ratio as a percentage',
      { ...empty, valueTypeId: VALUE_TYPE_IDS.ratio, hasCount: 'no', ratioFormat: 'percentage' },
    ],
    [
      'the 2013 European Standard Population beside a directly standardised rate',
      { ...countedRate, valueTypeId: DSR, standardPopulation: 'esp-2013' },
    ],
  ])('accepts %s', (_, body) => {
    expect(sectionFieldErrors(section, body)).toBeUndefined();
  });

  it('asks nothing of a follow-up its value type does not show', () => {
    expect(
      sectionFieldErrors(section, {
        ...empty,
        valueTypeId: VALUE_TYPE_IDS.lifeExpectancy,
        standardPopulation: 'other',
        countMeasure: 'other',
        rateObject: 'other',
        gapObject: 'other',
      }),
    ).toBeUndefined();
  });

  it.each([
    ['an empty form', empty, { valueTypeId: 'Select the value type' }],
    [
      'a directly standardised rate with nothing more',
      { ...empty, valueTypeId: DSR },
      {
        standardPopulation: SELECT_STANDARD_POPULATION,
        hasCount: 'Select whether there is a count',
        ratePer: 'Select what number the rate or proportion is per',
        rateObject: 'Select what object the rate or proportion is per',
      },
    ],
    [
      'an other standard population it does not name',
      {
        ...countedRate,
        valueTypeId: DSR,
        standardPopulation: 'other',
        standardPopulationOther: ' ',
      },
      { standardPopulationOther: ENTER_POPULATION },
    ],
    [
      'an indirectly standardised rate with no reference population',
      { ...countedRate, valueTypeId: VALUE_TYPE_IDS.indirectlyStandardisedRate },
      { referencePopulation: ENTER_POPULATION },
    ],
    [
      'a counted rate that does not say what it counts',
      { ...countedRate, countMeasure: '' },
      { countMeasure: 'Select what the count is measuring' },
    ],
    [
      'an other rate object it does not name',
      { ...countedRate, rateObject: 'other' },
      { rateObjectDetail: 'Enter what the rate or proportion is per' },
    ],
    [
      'a counted proportion that does not say whether its value measures the same thing',
      {
        ...empty,
        valueTypeId: VALUE_TYPE_IDS.proportion,
        hasCount: 'yes',
        countMeasure: 'people',
      },
      { valueSameAsCount: 'Select whether the value is measuring the same thing as the count' },
    ],
    [
      'a proportion of something else that does not say what',
      {
        ...empty,
        valueTypeId: VALUE_TYPE_IDS.proportion,
        hasCount: 'yes',
        countMeasure: 'people',
        valueSameAsCount: 'no',
      },
      { valueMeasure: 'Select what the value is measuring' },
    ],
    [
      'a gap with nothing more',
      { ...empty, valueTypeId: VALUE_TYPE_IDS.gap },
      {
        valueMeasure: 'Select what the value is measuring',
        gapObject: 'Select what object the gap is the difference of',
      },
    ],
    [
      'an other gap object and value measure it does not name',
      {
        ...empty,
        valueTypeId: VALUE_TYPE_IDS.gap,
        valueMeasure: 'other',
        gapObject: 'other',
      },
      {
        valueMeasureDetail: 'Enter what the value is measuring',
        gapObjectDetail: 'Enter what object the gap is the difference of',
      },
    ],
    [
      'a ratio that is neither a number nor a percentage',
      { ...empty, valueTypeId: VALUE_TYPE_IDS.ratio, hasCount: 'no' },
      { ratioFormat: 'Select whether the value is a number or a percentage' },
    ],
    [
      'an other count measure over 300 characters, beside the other refusals',
      {
        ...empty,
        valueTypeId: DSR,
        standardPopulation: 'other',
        hasCount: 'yes',
        countMeasure: 'other',
        countMeasureDetail: 'x'.repeat(301),
        ratePer: '100',
        rateObject: 'people',
      },
      {
        standardPopulationOther: ENTER_POPULATION,
        countMeasureDetail: 'What the count is measuring must be 300 characters or fewer',
      },
    ],
    [
      'a value type that is not an id',
      { ...empty, valueTypeId: 'Crude rate' },
      { valueTypeId: 'Select the value type' },
    ],
    [
      'choices it does not offer',
      {
        ...countedRate,
        valueTypeId: DSR,
        standardPopulation: '1976',
        countMeasure: 'hours',
        ratePer: '50',
        rateObject: 'beds',
      },
      {
        standardPopulation: SELECT_STANDARD_POPULATION,
        countMeasure: 'Select what the count is measuring',
        ratePer: 'Select what number the rate or proportion is per',
        rateObject: 'Select what object the rate or proportion is per',
      },
    ],
  ])('refuses %s', (_, body, fieldErrors) => {
    expect(sectionFieldErrors(section, body)).toEqual(fieldErrors);
  });

  it.each([{}, { ...empty, countMeasureDetail: 1 }, { ...empty, countIsEstimate: 'no' }])(
    'refuses %o, which the form never sends',
    (body) => {
      expect(sectionFieldErrors(section, body)).toBeDefined();
    },
  );
});
