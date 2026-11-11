import { describe, expect, it } from 'vitest';
import { isOneOf } from './is-one-of.ts';

describe('isOneOf', () => {
  const levels = ['95', '99.8'] as const;

  it('accepts a value in the list', () => {
    expect(isOneOf(levels, '99.8')).toBe(true);
  });

  it('rejects a value outside the list, null and a value of another type', () => {
    expect(isOneOf(levels, '90')).toBe(false);
    expect(isOneOf(levels, null)).toBe(false);
    expect(isOneOf(levels, 95)).toBe(false);
  });
});
