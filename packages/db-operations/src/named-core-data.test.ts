import { readFileSync } from 'node:fs';

import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';

import { type NamedRecord, parseNamedRecordsFile } from './named-core-data.ts';

const count: NamedRecord = { id: '01a0d8a5-3ca2-7315-bfca-96c7324d4347', name: 'Count' };
const mean: NamedRecord = { id: '01a0d8a5-3ca2-7315-bfca-96cff286704d', name: 'Mean' };

function committed(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf-8'));
}

const valueTypes = parseNamedRecordsFile('value types', committed('value-types.json'));

describe('parseNamedRecordsFile', () => {
  it('accepts a well-formed file', () => {
    expect(parseNamedRecordsFile('value types', [count, mean])).toEqual([count, mean]);
  });

  it('rejects an id that is not UUIDv7 or a blank name', () => {
    expect(() =>
      parseNamedRecordsFile('value types', [
        { ...count, id: '8b7e4a52-9c1d-4f6e-8a3b-2d5c9e7f1a04' },
      ]),
    ).toThrow(/Invalid value types file/);
    expect(() => parseNamedRecordsFile('value types', [{ ...count, name: ' ' }])).toThrow(
      /Invalid/,
    );
  });

  it('rejects a repeated id or name', () => {
    expect(() => parseNamedRecordsFile('value types', [count, { ...count, name: 'Mean' }])).toThrow(
      /duplicate id/,
    );
    expect(() => parseNamedRecordsFile('value types', [count, { ...mean, name: 'Count' }])).toThrow(
      /duplicate name/,
    );
  });

  it('accepts the committed files', () => {
    expect(() =>
      parseNamedRecordsFile('comparator methods', committed('comparator-methods.json')),
    ).not.toThrow();
    expect(valueTypes.length).toBeGreaterThan(0);
  });
});

describe('the committed value types', () => {
  it('hold every value type the code behaves on', () => {
    expect(valueTypes.map(({ id }) => id)).toEqual(
      expect.arrayContaining(Object.values(VALUE_TYPE_IDS)),
    );
  });
});
