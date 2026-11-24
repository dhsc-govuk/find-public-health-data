import { describe, expect, it } from 'vitest';

import { updateFrequencyLine } from './metadata-data.ts';

const NO_DETAILS = {
  updateFrequencyYears: null,
  updateFrequencyText: null,
  updateFrequencyReason: null,
};

describe('updateFrequencyLine', () => {
  it('gives the label of a frequency with no details', () => {
    expect(updateFrequencyLine({ updateFrequency: 'annually', ...NO_DETAILS })).toBe('Annually');
  });

  it('gives the number of years of a frequency of more than 1 year', () => {
    expect(
      updateFrequencyLine({
        updateFrequency: 'every-n-years',
        ...NO_DETAILS,
        updateFrequencyYears: 4,
      }),
    ).toBe('Every 4 years');
  });

  it("gives the publisher's own description of an other frequency", () => {
    expect(
      updateFrequencyLine({
        updateFrequency: 'other',
        ...NO_DETAILS,
        updateFrequencyText: 'Annual measurements during the academic year.\nPublished in winter.',
      }),
    ).toBe('Annual measurements during the academic year.\nPublished in winter.');
  });

  it('introduces the reason given, on the line above it', () => {
    expect(
      updateFrequencyLine({
        updateFrequency: 'no-longer-updated',
        ...NO_DETAILS,
        updateFrequencyReason: 'The survey has ended.',
      }),
    ).toBe(
      'This indicator will no longer be updated for the following reason:\nThe survey has ended.',
    );
  });

  it('gives the label alone for an indicator imported without a reason', () => {
    expect(updateFrequencyLine({ updateFrequency: 'no-fixed-frequency', ...NO_DETAILS })).toBe(
      'No fixed frequency',
    );
  });

  it('gives nothing for an indicator imported without a frequency', () => {
    expect(updateFrequencyLine({ updateFrequency: null, ...NO_DETAILS })).toBeNull();
  });
});
