import { describe, expect, it } from 'vitest';

import {
  hasUpdateFrequencyReason,
  publicUpdateFrequency,
  UPDATE_FREQUENCIES,
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
  it.each([
    ['no-fixed-frequency', 'No fixed frequency, for the following reason:'],
    ['no-longer-updated', 'This indicator will no longer be updated for the following reason:'],
  ] as const)('introduces the reason given for %s', (frequency, text) => {
    expect(publicUpdateFrequency(frequency, 'The survey has ended.')).toEqual({
      text,
      reason: 'The survey has ended.',
    });
  });

  it.each([
    ['no-fixed-frequency', 'No fixed frequency'],
    ['no-longer-updated', 'This indicator will no longer be updated'],
  ] as const)('gives the label of %s alone when there is no reason', (frequency, text) => {
    expect(publicUpdateFrequency(frequency, null)).toEqual({ text, reason: null });
  });

  it('gives the label of any other frequency, never a reason', () => {
    expect(publicUpdateFrequency('annually', 'A stray reason')).toEqual({
      text: 'Annually',
      reason: null,
    });
  });
});
