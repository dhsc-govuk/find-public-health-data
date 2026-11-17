import { describe, expect, it } from 'vitest';

import { updateFrequencyLine } from './metadata-data.ts';

describe('updateFrequencyLine', () => {
  it('gives the label of a frequency with no reason', () => {
    expect(
      updateFrequencyLine({
        updateFrequency: 'annually',
        updateFrequencyText: null,
        updateFrequencyReason: null,
      }),
    ).toBe('Annually');
  });

  it('introduces the reason given, on the line above it', () => {
    expect(
      updateFrequencyLine({
        updateFrequency: 'no-longer-updated',
        updateFrequencyReason: 'The survey has ended.',
        updateFrequencyText: null,
      }),
    ).toBe(
      'This indicator will no longer be updated for the following reason:\nThe survey has ended.',
    );
  });

  it('gives the label alone for an indicator imported without a reason', () => {
    expect(
      updateFrequencyLine({
        updateFrequency: 'no-fixed-frequency',
        updateFrequencyText: null,
        updateFrequencyReason: null,
      }),
    ).toBe('No fixed frequency');
  });

  it.each(['annually', 'no-fixed-frequency', null] as const)(
    'uses the original text in place of %s when there is no reason',
    (updateFrequency) => {
      expect(
        updateFrequencyLine({
          updateFrequency,
          updateFrequencyReason: null,
          updateFrequencyText:
            'Annual measurements during the academic year.\nPublished in winter.',
        }),
      ).toBe('Annual measurements during the academic year.\nPublished in winter.');
    },
  );

  it('keeps the reason given after the original text', () => {
    expect(
      updateFrequencyLine({
        updateFrequency: 'no-longer-updated',
        updateFrequencyReason: 'The survey has ended.',
        updateFrequencyText: 'Annual measurements during the academic year.',
      }),
    ).toBe(
      'Annual measurements during the academic year.\nThis indicator will no longer be updated for the following reason:\nThe survey has ended.',
    );
  });

  it('gives nothing for an indicator imported without a frequency', () => {
    expect(
      updateFrequencyLine({
        updateFrequency: null,
        updateFrequencyText: null,
        updateFrequencyReason: null,
      }),
    ).toBeNull();
  });
});
