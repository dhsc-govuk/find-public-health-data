import { describe, expect, it } from 'vitest';

import { updateFrequencyText } from './metadata-data.ts';

describe('updateFrequencyText', () => {
  it('gives the label of a frequency with no reason', () => {
    expect(updateFrequencyText({ updateFrequency: 'annually', updateFrequencyReason: null })).toBe(
      'Annually',
    );
  });

  it('introduces the reason given, on the line above it', () => {
    expect(
      updateFrequencyText({
        updateFrequency: 'no-longer-updated',
        updateFrequencyReason: 'The survey has ended.',
      }),
    ).toBe(
      'This indicator will no longer be updated for the following reason:\nThe survey has ended.',
    );
  });

  it('gives the label alone for an indicator imported without a reason', () => {
    expect(
      updateFrequencyText({ updateFrequency: 'no-fixed-frequency', updateFrequencyReason: null }),
    ).toBe('No fixed frequency');
  });
});
