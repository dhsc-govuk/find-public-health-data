import { describe, expect, it } from 'vitest';

import { DERIVED_ID_TIMESTAMP_MS, uuid7 } from './uuid7.ts';

describe('uuid7', () => {
  it('places the timestamp, version, tag, variant and suffix in their fields', () => {
    expect(uuid7(DERIVED_ID_TIMESTAMP_MS, 15, 216n)).toBe('019de0d5-c800-700f-8000-0000000000d8');
    expect(uuid7(0n, 0xfff, (1n << 62n) - 1n)).toBe('00000000-0000-7fff-bfff-ffffffffffff');
  });

  it('refuses values that do not fit their fields', () => {
    expect(() => uuid7(1n << 48n, 1, 1n)).toThrow('timestamp is outside 48 bits');
    expect(() => uuid7(DERIVED_ID_TIMESTAMP_MS, 1 << 12, 1n)).toThrow('tag is outside 12 bits');
    expect(() => uuid7(DERIVED_ID_TIMESTAMP_MS, -1, 1n)).toThrow('tag is outside 12 bits');
    expect(() => uuid7(DERIVED_ID_TIMESTAMP_MS, 1, 1n << 62n)).toThrow('suffix is outside 62 bits');
    expect(() => uuid7(DERIVED_ID_TIMESTAMP_MS, 1, -1n)).toThrow('suffix is outside 62 bits');
  });
});
