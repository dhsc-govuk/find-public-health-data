import { UPDATE_FREQUENCIES } from '@fphd/utils/update-frequency';
import { describe, expect, it } from 'vitest';

import { updateFrequencySection as section } from './indicator-update-frequency-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const NO_DETAILS = {
  updateFrequencyYears: '',
  updateFrequencyText: '',
  noFixedFrequencyReason: '',
  noLongerUpdatedReason: '',
};
const DETAILS = {
  updateFrequencyYears: '3',
  updateFrequencyText: 'Annual measurements during the academic year.',
  noFixedFrequencyReason: 'Published when the survey runs.',
  noLongerUpdatedReason: 'The survey has ended.',
};

describe('updateFrequencySection', () => {
  it.each(UPDATE_FREQUENCIES)('takes %s with its details', (updateFrequency) => {
    expect(section.schema.parse({ updateFrequency, ...DETAILS })).toEqual({
      updateFrequency,
      ...DETAILS,
    });
  });

  it.each(['monthly', 'quarterly', 'annually'])(
    'asks for no details beside %s',
    (updateFrequency) => {
      expect(sectionFieldErrors(section, { updateFrequency, ...NO_DETAILS })).toBeUndefined();
    },
  );

  it('takes the details without their surrounding spaces', () => {
    expect(
      section.schema.parse({
        updateFrequency: 'no-fixed-frequency',
        updateFrequencyYears: ' 4 ',
        updateFrequencyText: ' Academic year\r\nPublished in winter. ',
        noFixedFrequencyReason: '  When the survey runs\r\n',
        noLongerUpdatedReason: '',
      }),
    ).toEqual({
      updateFrequency: 'no-fixed-frequency',
      updateFrequencyYears: '4',
      updateFrequencyText: 'Academic year\nPublished in winter.',
      noFixedFrequencyReason: 'When the survey runs',
      noLongerUpdatedReason: '',
    });
  });

  it.each(['2', '10', '99', ' 5 '])('takes %j years between updates', (updateFrequencyYears) => {
    expect(
      sectionFieldErrors(section, {
        updateFrequency: 'every-n-years',
        ...NO_DETAILS,
        updateFrequencyYears,
      }),
    ).toBeUndefined();
  });

  it.each([
    ['', 'Enter the number of years between updates'],
    [' ', 'Enter the number of years between updates'],
    ['1', 'Number of years must be a whole number of 2 or more'],
    ['0', 'Number of years must be a whole number of 2 or more'],
    ['2.5', 'Number of years must be a whole number of 2 or more'],
    ['-3', 'Number of years must be a whole number of 2 or more'],
    ['three', 'Number of years must be a whole number of 2 or more'],
    ['100', 'Number of years must be 99 or fewer'],
  ])('refuses %j years between updates', (updateFrequencyYears, message) => {
    expect(
      sectionFieldErrors(section, {
        updateFrequency: 'every-n-years',
        ...NO_DETAILS,
        updateFrequencyYears,
      }),
    ).toEqual({ updateFrequencyYears: message });
  });

  it('asks for a description beside other', () => {
    expect(
      sectionFieldErrors(section, {
        updateFrequency: 'other',
        ...NO_DETAILS,
        updateFrequencyText: ' \n ',
      }),
    ).toEqual({ updateFrequencyText: 'Enter how often this indicator will be updated' });
  });

  it.each([
    [
      'no-fixed-frequency',
      { ...DETAILS, noFixedFrequencyReason: ' \n' },
      { noFixedFrequencyReason: 'Enter the reason this indicator has no fixed update frequency' },
    ],
    [
      'no-longer-updated',
      { ...DETAILS, noLongerUpdatedReason: '' },
      { noLongerUpdatedReason: 'Enter the reason this indicator will no longer be updated' },
    ],
  ])('asks for the reason beside %s', (updateFrequency, details, errors) => {
    expect(sectionFieldErrors(section, { updateFrequency, ...details })).toEqual(errors);
  });

  it.each([
    { updateFrequency: '', ...NO_DETAILS },
    { ...NO_DETAILS },
    { updateFrequency: 'fortnightly', ...DETAILS },
    { updateFrequency: 'Annual', ...NO_DETAILS },
    { updateFrequency: 'every-2-years', ...NO_DETAILS },
    { updateFrequency: 12, ...NO_DETAILS },
  ])('asks how often it will be updated given %o', (body) => {
    expect(sectionFieldErrors(section, body)).toEqual({
      updateFrequency: 'Select how often this indicator will be updated',
    });
  });
});
