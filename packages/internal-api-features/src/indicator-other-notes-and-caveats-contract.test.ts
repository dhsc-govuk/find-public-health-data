import { describe, expect, it } from 'vitest';

import { otherNotesAndCaveatsSection as section } from './indicator-other-notes-and-caveats-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const empty = {
  hasRounding: '',
  roundingDetail: '',
  hasCaveats: '',
  caveatsDetail: '',
  hasOtherNotes: '',
  otherNotesDetail: '',
};

const allNo = {
  ...empty,
  hasRounding: 'no',
  hasCaveats: 'no',
  hasOtherNotes: 'no',
};

const allYes = {
  ...empty,
  hasRounding: 'yes',
  hasCaveats: 'yes',
  hasOtherNotes: 'yes',
};

describe('otherNotesAndCaveatsSection', () => {
  it('takes every detail without its surrounding spaces', () => {
    expect(
      section.schema.parse({
        hasRounding: 'yes',
        roundingDetail: ' Rounded to the nearest 5. ',
        hasCaveats: 'yes',
        caveatsDetail: '\tSurvey data. ',
        hasOtherNotes: 'yes',
        otherNotesDetail: ' Revised in 2024.',
      }),
    ).toEqual({
      hasRounding: 'yes',
      roundingDetail: 'Rounded to the nearest 5.',
      hasCaveats: 'yes',
      caveatsDetail: 'Survey data.',
      hasOtherNotes: 'yes',
      otherNotesDetail: 'Revised in 2024.',
    });
  });

  it('asks for no details when every answer is no', () => {
    expect(sectionFieldErrors(section, allNo)).toBeUndefined();
  });

  it('asks for every answer when the form is empty', () => {
    expect(sectionFieldErrors(section, empty)).toEqual({
      hasRounding: 'Select whether rounding has been applied',
      hasCaveats: 'Select whether there are any caveats needed',
      hasOtherNotes: 'Select whether there are any other notes needed',
    });
  });

  it('asks for the details of every yes, blank ones included', () => {
    expect(sectionFieldErrors(section, { ...allYes, caveatsDetail: ' \n' })).toEqual({
      roundingDetail: 'Provide details of the rounding',
      caveatsDetail: 'Provide details of the caveats',
      otherNotesDetail: 'Provide details of the other notes',
    });
  });

  it.each([
    { ...allNo, hasRounding: 'not-applicable' },
    { ...allNo, hasCaveats: true },
  ])('refuses an answer the form does not offer: %o', (body) => {
    expect(sectionFieldErrors(section, body)).toBeDefined();
  });

  it.each([null, {}, { hasRounding: 'no', hasCaveats: 'no' }, { ...allNo, otherNotesDetail: 108 }])(
    'refuses %o, which the form never sends',
    (body) => {
      expect(sectionFieldErrors(section, body)).toBeDefined();
    },
  );
});
