import { describe, expect, it } from 'vitest';

import {
  COMPOUND_AGE_IDS,
  computeCiPair,
  computeDenominator2,
  dedupKey,
  nullIfSentinel,
} from './observations.ts';

describe('nullIfSentinel', () => {
  it('returns null for -1', () => expect(nullIfSentinel(-1)).toBeNull());
  it('returns null for null input', () => expect(nullIfSentinel(null)).toBeNull());
  it('passes through 0', () => expect(nullIfSentinel(0)).toBe(0));
  it('passes through positive number', () => expect(nullIfSentinel(42.5)).toBe(42.5));
  it('passes through negative numbers other than -1', () => expect(nullIfSentinel(-2)).toBe(-2));
});

describe('computeDenominator2', () => {
  it('returns null when same as denominator (no distinct value)', () =>
    expect(computeDenominator2(100, 100)).toBeNull());
  it('returns null when null input', () => expect(computeDenominator2(null, 100)).toBeNull());
  it('returns null when denominator_2 is sentinel -1 and differs from denominator', () =>
    expect(computeDenominator2(-1, 100)).toBeNull());
  it('returns value when different from denominator', () =>
    expect(computeDenominator2(200, 100)).toBe(200));
  it('both -1: same value → null', () => expect(computeDenominator2(-1, -1)).toBeNull());
});

describe('computeCiPair', () => {
  it('value=-1 nulls both CIs', () => {
    expect(computeCiPair(-1, 1.0, 2.0)).toEqual({ lower: null, upper: null });
  });
  it('value=-1 nulls even when CIs are valid numbers', () => {
    expect(computeCiPair(-1, 0.5, 0.8)).toEqual({ lower: null, upper: null });
  });
  it('value present, normal order → NULLIF each', () => {
    expect(computeCiPair(5.0, 4.0, 6.0)).toEqual({ lower: 4.0, upper: 6.0 });
  });
  it('rejects inverted limits instead of inventing corrected bounds', () => {
    expect(() => computeCiPair(5.0, 6.0, 4.0)).toThrow('inverted confidence limits');
    expect(() => computeCiPair(90.85, 89.89, 0)).toThrow('source correction required');
  });
  it('discards limits for a null estimate', () => {
    expect(computeCiPair(null, 4, 6)).toEqual({ lower: null, upper: null });
  });
  it('value present, lower is sentinel -1: no swap, lower → null', () => {
    expect(computeCiPair(5.0, -1, 6.0)).toEqual({ lower: null, upper: 6.0 });
  });
  it('value present, upper is sentinel -1: no swap, upper → null', () => {
    expect(computeCiPair(5.0, 4.0, -1)).toEqual({ lower: 4.0, upper: null });
  });
  it('both sentinels -1: both → null, no swap', () => {
    expect(computeCiPair(5.0, -1, -1)).toEqual({ lower: null, upper: null });
  });
  it('inverted but one is -1: no swap (condition requires both != -1)', () => {
    // lower=6 > upper=-1, but upper==-1 so condition false → no swap
    expect(computeCiPair(5.0, 6.0, -1)).toEqual({ lower: 6.0, upper: null });
  });
  it('null inputs treated as -1', () => {
    expect(computeCiPair(5.0, null, null)).toEqual({ lower: null, upper: null });
  });
});

describe('COMPOUND_AGE_IDS', () => {
  it('contains 209, 212, 274', () => {
    expect(COMPOUND_AGE_IDS.has(209)).toBe(true);
    expect(COMPOUND_AGE_IDS.has(212)).toBe(true);
    expect(COMPOUND_AGE_IDS.has(274)).toBe(true);
  });
  it('does not contain other AgeIDs', () => {
    expect(COMPOUND_AGE_IDS.has(1)).toBe(false);
    expect(COMPOUND_AGE_IDS.has(303)).toBe(false);
  });
});

describe('dedupKey', () => {
  it('produces the same key for identical inputs', () => {
    const k1 = dedupKey(108, 1234, '2020-04-01', '2021-03-31', 108, []);
    const k2 = dedupKey(108, 1234, '2020-04-01', '2021-03-31', 108, []);
    expect(k1).toBe(k2);
  });
  it('differs by indicatorId', () => {
    const k1 = dedupKey(108, 1234, '2020-04-01', '2021-03-31', 108, []);
    const k2 = dedupKey(109, 1234, '2020-04-01', '2021-03-31', 109, []);
    expect(k1).not.toBe(k2);
  });
  it('differs by areaId', () => {
    const k1 = dedupKey(108, 1234, '2020-04-01', '2021-03-31', 108, []);
    const k2 = dedupKey(108, 9999, '2020-04-01', '2021-03-31', 108, []);
    expect(k1).not.toBe(k2);
  });
  it('sortedDimValueIds encoded as comma-joined', () => {
    const k = dedupKey(1, 1, '2020-01-01', '2020-12-31', 1, [100, 200, 300]);
    expect(k.endsWith('|100,200,300')).toBe(true);
  });
  it('empty dims encoded as empty suffix', () => {
    const k = dedupKey(1, 1, '2020-01-01', '2020-12-31', 1, []);
    expect(k.endsWith('|')).toBe(true);
  });
});
