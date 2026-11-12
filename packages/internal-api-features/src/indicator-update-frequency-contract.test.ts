import { UPDATE_FREQUENCIES } from '@fphd/utils/update-frequency';
import { describe, expect, it } from 'vitest';

import { updateFrequencySection as section } from './indicator-update-frequency-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const NO_REASONS = { noFixedFrequencyReason: '', noLongerUpdatedReason: '' };
const REASONS = {
  noFixedFrequencyReason: 'Published when the survey runs.',
  noLongerUpdatedReason: 'The survey has ended.',
};

describe('updateFrequencySection', () => {
  it.each(UPDATE_FREQUENCIES)('takes %s with its reason', (updateFrequency) => {
    expect(section.schema.parse({ updateFrequency, ...REASONS })).toEqual({
      updateFrequency,
      ...REASONS,
    });
  });

  it.each(['monthly', 'quarterly', 'annually', 'every-2-years'])(
    'asks for no reason beside %s',
    (updateFrequency) => {
      expect(sectionFieldErrors(section, { updateFrequency, ...NO_REASONS })).toBeUndefined();
    },
  );

  it('takes the reasons without their surrounding spaces', () => {
    expect(
      section.schema.parse({
        updateFrequency: 'no-fixed-frequency',
        noFixedFrequencyReason: '  When the survey runs\r\n',
        noLongerUpdatedReason: '',
      }),
    ).toEqual({
      updateFrequency: 'no-fixed-frequency',
      noFixedFrequencyReason: 'When the survey runs',
      noLongerUpdatedReason: '',
    });
  });

  it.each([
    [
      'no-fixed-frequency',
      { noFixedFrequencyReason: ' \n', noLongerUpdatedReason: 'The survey has ended.' },
      { noFixedFrequencyReason: 'Enter the reason this indicator has no fixed update frequency' },
    ],
    [
      'no-longer-updated',
      { noFixedFrequencyReason: 'Published when the survey runs.', noLongerUpdatedReason: '' },
      { noLongerUpdatedReason: 'Enter the reason this indicator will no longer be updated' },
    ],
  ])('asks for the reason beside %s', (updateFrequency, reasons, errors) => {
    expect(sectionFieldErrors(section, { updateFrequency, ...reasons })).toEqual(errors);
  });

  it.each([
    { updateFrequency: '', ...NO_REASONS },
    { ...NO_REASONS },
    { updateFrequency: 'fortnightly', ...REASONS },
    { updateFrequency: 'Annual', ...NO_REASONS },
    { updateFrequency: 12, ...NO_REASONS },
  ])('asks how often it will be updated given %o', (body) => {
    expect(sectionFieldErrors(section, body)).toEqual({
      updateFrequency: 'Select how often this indicator will be updated',
    });
  });
});
