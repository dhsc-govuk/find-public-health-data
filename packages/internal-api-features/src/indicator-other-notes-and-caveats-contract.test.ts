import { describe, expect, it } from 'vitest';

import { otherNotesAndCaveatsSection as section } from './indicator-other-notes-and-caveats-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const empty = {
  hasDataQualityIssues: '',
  hasCaveats: '',
  caveatsDetail: '',
  hasOtherNotes: '',
  otherNotesDetail: '',
};

const allNo = {
  ...empty,
  hasDataQualityIssues: 'no',
  hasCaveats: 'no',
  hasOtherNotes: 'no',
};

const allYes = {
  ...empty,
  hasDataQualityIssues: 'yes',
  hasCaveats: 'yes',
  hasOtherNotes: 'yes',
};

const CAVEATS_FOR_DATA_QUALITY =
  "If there are data quality issues, you need to explain these in the 'Caveats' section";

describe('otherNotesAndCaveatsSection', () => {
  it('takes every detail without its surrounding spaces', () => {
    expect(
      section.schema.parse({
        hasDataQualityIssues: 'yes',
        hasCaveats: 'yes',
        caveatsDetail: '\tSurvey data. ',
        hasOtherNotes: 'yes',
        otherNotesDetail: ' Revised in 2024.',
      }),
    ).toEqual({
      hasDataQualityIssues: 'yes',
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
      hasDataQualityIssues: 'Select whether there are any data quality issues with this indicator',
      hasCaveats: 'Select whether there are any caveats needed',
      hasOtherNotes: 'Select whether there are any additional interpretation notes needed',
    });
  });

  it('asks for the details of every yes, blank ones included', () => {
    expect(sectionFieldErrors(section, { ...allYes, caveatsDetail: ' \n' })).toEqual({
      caveatsDetail: 'Provide details of the caveats',
      otherNotesDetail: 'Provide details of the additional interpretation notes',
    });
  });

  it('refuses no caveats beside data quality issues', () => {
    expect(sectionFieldErrors(section, { ...allNo, hasDataQualityIssues: 'yes' })).toEqual({
      hasCaveats: CAVEATS_FOR_DATA_QUALITY,
    });
  });

  it('refuses no caveats beside data quality issues with the other refusals', () => {
    expect(
      sectionFieldErrors(section, { ...empty, hasDataQualityIssues: 'yes', hasCaveats: 'no' }),
    ).toEqual({
      hasCaveats: CAVEATS_FOR_DATA_QUALITY,
      hasOtherNotes: 'Select whether there are any additional interpretation notes needed',
    });
  });

  it('takes caveats beside data quality issues', () => {
    expect(
      sectionFieldErrors(section, {
        ...allNo,
        hasDataQualityIssues: 'yes',
        hasCaveats: 'yes',
        caveatsDetail: 'Survey data.',
      }),
    ).toBeUndefined();
  });

  it('takes caveats without data quality issues', () => {
    expect(
      sectionFieldErrors(section, { ...allNo, hasCaveats: 'yes', caveatsDetail: 'Survey data.' }),
    ).toBeUndefined();
  });

  it.each([
    { ...allNo, hasDataQualityIssues: 'not-applicable' },
    { ...allNo, hasCaveats: true },
  ])('refuses an answer the form does not offer: %o', (body) => {
    expect(sectionFieldErrors(section, body)).toBeDefined();
  });

  it.each([
    null,
    {},
    { hasDataQualityIssues: 'no', hasCaveats: 'no' },
    { ...allNo, otherNotesDetail: 108 },
  ])('refuses %o, which the form never sends', (body) => {
    expect(sectionFieldErrors(section, body)).toBeDefined();
  });
});
