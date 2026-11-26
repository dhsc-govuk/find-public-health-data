import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';

import { standardMethodUsed } from './standard-method.ts';

describe('standardMethodUsed', () => {
  it("keeps a Fingertips methodology under No, as the indicator's own", () => {
    expect(standardMethodUsed(VALUE_TYPE_IDS.proportion, 'Our own')).toBe(false);
  });

  it('does not ask a value type with no standard method', () => {
    expect(standardMethodUsed(VALUE_TYPE_IDS.score, 'Scored')).toBeNull();
  });

  it.each([null, ''])('leaves an indicator with a methodology of %o unanswered', (methodology) => {
    expect(standardMethodUsed(VALUE_TYPE_IDS.proportion, methodology)).toBeNull();
  });

  it('leaves an indicator with no value type unanswered', () => {
    expect(standardMethodUsed(null, 'Our own')).toBeNull();
  });
});
