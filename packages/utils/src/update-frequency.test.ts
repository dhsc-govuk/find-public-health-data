import { describe, expect, it } from 'vitest';

import {
  hasUpdateFrequencyReason,
  publicUpdateFrequency,
  UPDATE_FREQUENCIES,
  type UpdateFrequency,
} from './update-frequency.ts';

describe('hasUpdateFrequencyReason', () => {
  it('names the two answers a publisher gives a reason for', () => {
    expect(UPDATE_FREQUENCIES.filter(hasUpdateFrequencyReason)).toEqual([
      'no-fixed-frequency',
      'no-longer-updated',
    ]);
    expect(hasUpdateFrequencyReason(null)).toBe(false);
  });
});

describe('publicUpdateFrequency', () => {
  const answer = (updateFrequency: UpdateFrequency, details = {}) => ({
    updateFrequency,
    updateFrequencyYears: null,
    updateFrequencyText: null,
    updateFrequencyReason: null,
    ...details,
  });

  it.each([
    ['no-fixed-frequency', 'No fixed frequency, for the following reason:'],
    ['no-longer-updated', 'This indicator will no longer be updated for the following reason:'],
  ] as const)('introduces the reason given for %s', (frequency, text) => {
    expect(
      publicUpdateFrequency(answer(frequency, { updateFrequencyReason: 'The survey has ended.' })),
    ).toEqual({ text, reason: 'The survey has ended.' });
  });

  it.each([
    ['no-fixed-frequency', 'No fixed frequency'],
    ['no-longer-updated', 'This indicator will no longer be updated'],
  ] as const)('gives the label of %s alone when there is no reason', (frequency, text) => {
    expect(publicUpdateFrequency(answer(frequency))).toEqual({ text, reason: null });
  });

  it('words a frequency of more than 1 year as its number of years', () => {
    expect(publicUpdateFrequency(answer('every-n-years', { updateFrequencyYears: 3 }))).toEqual({
      text: 'Every 3 years',
      reason: null,
    });
  });

  it("gives the publisher's own description of an other frequency", () => {
    const updateFrequencyText = 'Annual measurements during the academic year.';
    expect(publicUpdateFrequency(answer('other', { updateFrequencyText }))).toEqual({
      text: updateFrequencyText,
      reason: null,
    });
  });

  it('gives the label of any other frequency, never a reason, years or description', () => {
    expect(
      publicUpdateFrequency(
        answer('annually', {
          updateFrequencyReason: 'A stray reason',
          updateFrequencyYears: 3,
          updateFrequencyText: 'A stray description',
        }),
      ),
    ).toEqual({ text: 'Annually', reason: null });
  });
});
