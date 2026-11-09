import { describe, expect, it } from 'vitest';

import { searchPattern } from './search-pattern.ts';

describe('searchPattern', () => {
  it('ignores surrounding spaces and treats punctuation as literal text', () => {
    const pattern = searchPattern('  (care)+  ');
    expect(pattern?.test('Health (CARE)+ services')).toBe(true);
    expect(pattern?.test('Health care services')).toBe(false);
  });

  it('collapses inner whitespace before matching', () => {
    const pattern = searchPattern('  mortality \t and\nlife\u00a0expectancy  ');
    expect(pattern?.test('Mortality and life expectancy')).toBe(true);
    expect(pattern?.test('Mortality and healthy life expectancy')).toBe(false);
  });

  it('matches long queries literally without truncating them', () => {
    const query = '(care)+ '.repeat(1000).trim();
    const pattern = searchPattern(query);
    expect(pattern?.test(query)).toBe(true);
    expect(pattern?.test(query.slice(0, -1))).toBe(false);
  });

  it.each([
    ['İ', 'i', false],
    ['İ', 'İ', true],
    ['K', 'k', true],
    ['ς', 'σ', true],
    ['𐐀', '𐐨', true],
    ['ß', 'ss', false],
    ['\uD800', '\uD800', true],
    ['\uDC00', '\uDC00', true],
  ])('matches %s against %s with simple Unicode case folding', (text, query, matches) => {
    expect(searchPattern(query)?.test(text)).toBe(matches);
  });

  it('returns no pattern for an empty or whitespace-only query', () => {
    expect(searchPattern('')).toBeUndefined();
    expect(searchPattern('  ')).toBeUndefined();
  });
});
