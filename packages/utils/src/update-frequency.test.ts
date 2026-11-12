import { describe, expect, it } from 'vitest';

import { hasUpdateFrequencyReason, UPDATE_FREQUENCIES } from './update-frequency.ts';

describe('hasUpdateFrequencyReason', () => {
  it('names the two answers a publisher gives a reason for', () => {
    expect(UPDATE_FREQUENCIES.filter(hasUpdateFrequencyReason)).toEqual([
      'no-fixed-frequency',
      'no-longer-updated',
    ]);
    expect(hasUpdateFrequencyReason(null)).toBe(false);
  });
});
