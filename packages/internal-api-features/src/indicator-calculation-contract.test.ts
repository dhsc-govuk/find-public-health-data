import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';

import {
  calculationResponseSchema,
  calculationSectionFor,
  calculationSection as section,
} from './indicator-calculation-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const SELECT_STANDARD_METHOD_USED =
  'Select whether the described standard method was used for this indicator';

const answered = {
  standardMethodUsed: 'yes',
  methodology: '',
  calculatedBy: 'ohid',
  calculatedByDetail: '',
} as const;

describe('calculationSection', () => {
  it('takes the methodology and the organisation name without their surrounding spaces', () => {
    expect(
      section.schema.parse({
        standardMethodUsed: 'no',
        methodology: '  A method\n',
        calculatedBy: 'other',
        calculatedByDetail: '\tONS ',
      }),
    ).toEqual({
      standardMethodUsed: 'no',
      methodology: 'A method',
      calculatedBy: 'other',
      calculatedByDetail: 'ONS',
    });
  });

  it.each(['ohid', 'dhsc'] as const)(
    'asks for no organisation name when %s calculated it',
    (calculatedBy) => {
      expect(sectionFieldErrors(section, { ...answered, calculatedBy })).toBeUndefined();
    },
  );

  it.each([
    [
      { standardMethodUsed: '', methodology: '', calculatedBy: '', calculatedByDetail: '' },
      { calculatedBy: 'Select who calculated the indicator' },
    ],
    [
      { ...answered, standardMethodUsed: 'no', methodology: ' ' },
      { methodology: 'Enter the methodology' },
    ],
    [
      { ...answered, calculatedBy: 'other', calculatedByDetail: ' \n' },
      { calculatedByDetail: 'Enter the organisation name' },
    ],
    [
      { ...answered, standardMethodUsed: 'no', calculatedBy: 'other' },
      {
        methodology: 'Enter the methodology',
        calculatedByDetail: 'Enter the organisation name',
      },
    ],
    [
      { ...answered, standardMethodUsed: 'maybe' },
      { standardMethodUsed: SELECT_STANDARD_METHOD_USED },
    ],
    [{ ...answered, calculatedBy: 'nhs' }, { calculatedBy: 'Select who calculated the indicator' }],
  ])('refuses %o', (body, fieldErrors) => {
    expect(sectionFieldErrors(section, body)).toEqual(fieldErrors);
  });

  it.each([{}, { methodology: 'A method', calculatedBy: 'ohid' }, { ...answered, methodology: 1 }])(
    'refuses %o, which the form never sends',
    (body) => {
      expect(sectionFieldErrors(section, body)).toBeDefined();
    },
  );
});

describe('calculationSectionFor', () => {
  describe('a value type with a standard method', () => {
    const proportion = calculationSectionFor(VALUE_TYPE_IDS.proportion);

    it('asks whether the standard method was used, beside every other refusal', () => {
      expect(
        sectionFieldErrors(proportion, {
          standardMethodUsed: '',
          methodology: '',
          calculatedBy: '',
          calculatedByDetail: '',
        }),
      ).toEqual({
        standardMethodUsed: SELECT_STANDARD_METHOD_USED,
        calculatedBy: 'Select who calculated the indicator',
      });
    });

    it('asks for the methodology under No', () => {
      expect(sectionFieldErrors(proportion, { ...answered, standardMethodUsed: 'no' })).toEqual({
        methodology: 'Enter the methodology',
      });
    });

    it.each([
      { ...answered },
      { ...answered, standardMethodUsed: 'no', methodology: 'Our own method' },
    ])('takes %o', (body) => {
      expect(proportion.schema.parse(body)).toEqual(body);
    });
  });

  describe('a value type with no standard method', () => {
    const score = calculationSectionFor(VALUE_TYPE_IDS.score);

    it('asks for the methodology alone', () => {
      expect(sectionFieldErrors(score, { ...answered, standardMethodUsed: '' })).toEqual({
        methodology: 'Enter the methodology',
      });
    });

    it('drops an answer to the standard method question, which it does not ask', () => {
      expect(score.schema.parse({ ...answered, methodology: 'Scored' })).toEqual({
        ...answered,
        standardMethodUsed: '',
        methodology: 'Scored',
      });
    });
  });

  describe('no value type', () => {
    const unchosen = calculationSectionFor(null);

    it('asks who calculated the indicator alone', () => {
      expect(
        sectionFieldErrors(unchosen, {
          standardMethodUsed: '',
          methodology: '',
          calculatedBy: '',
          calculatedByDetail: '',
        }),
      ).toEqual({ calculatedBy: 'Select who calculated the indicator' });
    });

    it('drops answers about the method, which it does not ask', () => {
      expect(unchosen.schema.parse({ ...answered, methodology: 'Typed by hand' })).toEqual({
        ...answered,
        standardMethodUsed: '',
        methodology: '',
      });
    });
  });
});

describe('calculationResponseSchema', () => {
  it('reads the value type beside the answers and their version', () => {
    const response = {
      answers: { ...answered, methodology: null, calculatedByDetail: null },
      version: 'a'.repeat(64),
      valueType: { id: VALUE_TYPE_IDS.score, name: 'Score' },
    };

    expect(calculationResponseSchema.safeParse(response).success).toBe(true);
    expect(calculationResponseSchema.safeParse({ ...response, valueType: null }).success).toBe(
      true,
    );
  });
});
