import { describe, expect, it } from 'vitest';

import {
  type AgeRangeFormValues,
  type AgesFormValues,
  ageRangeFieldName,
  MAX_AGE_RANGES,
  agesSection as section,
} from './indicator-ages-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const blankRange: AgeRangeFormValues = {
  lowerLimit: '',
  lowerLimitUnit: '',
  upperLimit: '',
  upperLimitUnit: '',
};

const range = (values: Partial<AgeRangeFormValues>) => ({ ...blankRange, ...values });

const ranges = (...given: Partial<AgeRangeFormValues>[]): AgesFormValues => ({
  ...form,
  ageType: 'range',
  ageRanges: given.map(range),
});

const form: AgesFormValues = {
  ageType: '',
  ageRanges: [],
  specificAge: '',
  specificAgeUnit: '',
  ageDetail: '',
};

describe('agesSection', () => {
  it('takes the limits and ages without their surrounding spaces', () => {
    const parsed = section.schema.parse({
      ...form,
      ageType: 'specific',
      specificAge: ' 5 ',
      specificAgeUnit: 'weeks',
    });

    expect(parsed).toMatchObject({ specificAge: '5', specificAgeUnit: 'weeks' });
  });

  it.each([
    ['a lower limit alone', { lowerLimit: '65', lowerLimitUnit: 'years' }],
    ['an upper limit alone', { upperLimit: '75', upperLimitUnit: 'years' }],
    [
      'both limits',
      { lowerLimit: '6', lowerLimitUnit: 'weeks', upperLimit: '8', upperLimitUnit: 'weeks' },
    ],
    [
      'an upper limit equal to the lower in another unit',
      { lowerLimit: '1', lowerLimitUnit: 'years', upperLimit: '12', upperLimitUnit: 'months' },
    ],
    ['zero', { lowerLimit: '0', lowerLimitUnit: 'days' }],
    ['999', { upperLimit: '999', upperLimitUnit: 'days' }],
  ])('accepts a range with %s', (_, given) => {
    expect(sectionFieldErrors(section, ranges(given))).toBeUndefined();
  });

  it('accepts all ages, a specific age and other ages', () => {
    expect(sectionFieldErrors(section, { ...form, ageType: 'all' })).toBeUndefined();
    expect(
      sectionFieldErrors(section, {
        ...form,
        ageType: 'specific',
        specificAge: '5',
        specificAgeUnit: 'years',
      }),
    ).toBeUndefined();
    expect(
      sectionFieldErrors(section, { ...form, ageType: 'other', ageDetail: 'Year 6' }),
    ).toBeUndefined();
  });

  it.each([
    ['other ages', { ageType: 'other', ageDetail: 'Year 6' }],
    ['all ages', { ageType: 'all' }],
  ])('asks nothing of the age types not chosen beside %s', (_, given) => {
    expect(
      sectionFieldErrors(section, {
        ...form,
        ageRanges: [range({ lowerLimit: 'abc' })],
        specificAge: 'abc',
        ...given,
      }),
    ).toBeUndefined();
  });

  it('refuses an empty form', () => {
    expect(sectionFieldErrors(section, form)).toEqual({ ageType: 'Select the age type' });
  });

  it.each([
    [{ ageType: 'everyone' }, { ageType: 'Select the age type' }],
    [
      { ageType: 'specific' },
      { specificAge: 'Enter the age', specificAgeUnit: 'Select the periods' },
    ],
    [
      { ageType: 'specific', specificAge: '5.5', specificAgeUnit: 'years' },
      { specificAge: 'Age must be a whole number from 0 to 999' },
    ],
    [
      { ageType: 'specific', specificAge: '1000', specificAgeUnit: 'years' },
      { specificAge: 'Age must be a whole number from 0 to 999' },
    ],
    [{ ageType: 'specific', specificAgeUnit: 'years' }, { specificAge: 'Enter the age' }],
    [
      { ageType: 'specific', specificAge: '5', specificAgeUnit: 'decades' },
      { specificAgeUnit: 'Select the periods' },
    ],
    [{ ageType: 'other', ageDetail: ' ' }, { ageDetail: 'Enter the ages included' }],
    [
      { ageType: 'specific', ageDetail: 'Year\u000b6' },
      {
        specificAge: 'Enter the age',
        specificAgeUnit: 'Select the periods',
        ageDetail: 'Ages included must not include hidden formatting characters',
      },
    ],
  ])('refuses %o', (answers, fieldErrors) => {
    expect(sectionFieldErrors(section, { ...form, ...answers })).toEqual(fieldErrors);
  });

  it.each([
    [[blankRange], { lowerLimit: 'You must enter at least a lower or upper limit' }],
    [[{ lowerLimit: '5' }], { lowerLimitUnit: 'Select the periods for the lower limit' }],
    [
      [{ lowerLimit: '5', lowerLimitUnit: 'decades' }],
      { lowerLimitUnit: 'Select the periods for the lower limit' },
    ],
    [[{ upperLimitUnit: 'years' }], { upperLimit: 'Enter the upper limit' }],
    [
      [{ lowerLimit: '-1', lowerLimitUnit: 'years' }],
      { lowerLimit: 'Lower limit must be a whole number from 0 to 999' },
    ],
    [
      [{ lowerLimit: 'abc' }],
      {
        lowerLimit: 'Lower limit must be a whole number from 0 to 999',
        lowerLimitUnit: 'Select the periods for the lower limit',
      },
    ],
    [
      [{ lowerLimit: '5', lowerLimitUnit: 'years', upperLimit: '4', upperLimitUnit: 'years' }],
      { upperLimit: 'Upper limit must not be lower than the lower limit' },
    ],
    [
      [{ lowerLimit: '1', lowerLimitUnit: 'years', upperLimit: '51', upperLimitUnit: 'weeks' }],
      { upperLimit: 'Upper limit must not be lower than the lower limit' },
    ],
  ] as const)('refuses the range %o on the part at fault', (given, errors) => {
    const expected = Object.fromEntries(
      Object.entries(errors).map(([part, message]) => [
        ageRangeFieldName(0, part as keyof AgeRangeFormValues),
        message,
      ]),
    );

    expect(sectionFieldErrors(section, ranges(...given))).toEqual(expected);
  });

  it('names the range from the second on, so every refusal is told apart', () => {
    const valid = { lowerLimit: '16', lowerLimitUnit: 'years' };

    expect(
      sectionFieldErrors(
        section,
        ranges(
          valid,
          blankRange,
          { lowerLimit: '5', upperLimitUnit: 'years' },
          { lowerLimit: '9', lowerLimitUnit: 'days', upperLimit: '1', upperLimitUnit: 'days' },
          { upperLimit: 'x', upperLimitUnit: 'days' },
        ),
      ),
    ).toEqual({
      [ageRangeFieldName(1, 'lowerLimit')]:
        'You must enter at least a lower or upper limit for range 2',
      [ageRangeFieldName(2, 'lowerLimitUnit')]: 'Select the periods for lower limit 3',
      [ageRangeFieldName(2, 'upperLimit')]: 'Enter upper limit 3',
      [ageRangeFieldName(3, 'upperLimit')]: 'Upper limit 4 must not be lower than lower limit 4',
      [ageRangeFieldName(4, 'upperLimit')]: 'Upper limit 5 must be a whole number from 0 to 999',
    });
  });

  it('refuses a range answer with no ranges where the first one goes', () => {
    expect(sectionFieldErrors(section, ranges())).toEqual({
      [ageRangeFieldName(0, 'lowerLimit')]: 'You must enter at least a lower or upper limit',
    });
  });

  it('refuses more ranges than the page offers', () => {
    const full = Array.from({ length: MAX_AGE_RANGES + 1 }, (_, index) => ({
      lowerLimit: String(index),
      lowerLimitUnit: 'years',
    }));

    expect(sectionFieldErrors(section, ranges(...full))).toEqual({
      ageRanges: 'You cannot add more than 20 ranges',
    });
  });

  it('refuses a unit the page does not offer by the limit it belongs to', () => {
    expect(
      sectionFieldErrors(
        section,
        ranges({ lowerLimit: '16', lowerLimitUnit: 'years' }, { upperLimitUnit: 'decades' }),
      ),
    ).toEqual({
      [ageRangeFieldName(1, 'upperLimitUnit')]: 'Select the periods for upper limit 2',
    });
  });

  it('accepts what it gave, so the API can apply it again', () => {
    const parsed = section.schema.parse(ranges({ lowerLimit: ' 16 ', lowerLimitUnit: 'years' }));

    expect(section.schema.parse(parsed)).toEqual(parsed);
  });
});

describe('agesSection.formValues', () => {
  it('gives each stored age to the form as text, and each unanswered one as empty', () => {
    expect(
      section.formValues({
        ageType: 'range',
        ageRanges: [
          { lowerLimit: 0, lowerLimitUnit: 'days', upperLimit: null, upperLimitUnit: null },
        ],
        specificAge: null,
        specificAgeUnit: null,
        ageDetail: null,
      }),
    ).toEqual({
      ageType: 'range',
      ageRanges: [{ lowerLimit: '0', lowerLimitUnit: 'days', upperLimit: '', upperLimitUnit: '' }],
      specificAge: '',
      specificAgeUnit: '',
      ageDetail: '',
    });
  });
});
