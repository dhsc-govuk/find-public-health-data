import { describe, expect, it } from 'vitest';

import { countIsNumerator, standardisationOf, VALUE_TYPE_IDS } from './value-type-and-unit.ts';

describe('standardisationOf', () => {
  it.each([
    ['a directly standardised rate', VALUE_TYPE_IDS.directlyStandardisedRate, 'direct'],
    [
      'an indirectly standardised proportion',
      VALUE_TYPE_IDS.indirectlyStandardisedProportion,
      'indirect',
    ],
    ['an indirectly standardised rate', VALUE_TYPE_IDS.indirectlyStandardisedRate, 'indirect'],
    ['an indirectly standardised ratio', VALUE_TYPE_IDS.indirectlyStandardisedRatio, 'indirect'],
    ['any other value type', VALUE_TYPE_IDS.crudeRate, null],
  ])('reads %s as %s', (_, id, standardisation) => {
    expect(standardisationOf(id)).toBe(standardisation);
  });

  it('reads no standardisation from no value type', () => {
    expect(standardisationOf('')).toBeNull();
  });
});

describe('countIsNumerator', () => {
  it("reads a proportion's Fingertips count as its numerator", () => {
    expect(countIsNumerator(VALUE_TYPE_IDS.proportion, 241)).toBe(true);
  });

  it("reads an indirectly standardised rate's Fingertips count as its numerator", () => {
    expect(countIsNumerator(VALUE_TYPE_IDS.indirectlyStandardisedRate, 241)).toBe(true);
  });

  it('keeps the count of a count', () => {
    expect(countIsNumerator(VALUE_TYPE_IDS.count, 93014)).toBe(false);
  });

  it('keeps the count of an indicator with no value type', () => {
    expect(countIsNumerator(null, 241)).toBe(false);
  });

  it('keeps the estimated count of a survey proportion', () => {
    expect(countIsNumerator(VALUE_TYPE_IDS.proportion, 92443)).toBe(false);
  });
});
