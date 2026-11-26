import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { STANDARD_CONFIDENCE_INTERVAL_METHODS } from '@fphd/utils/standard-methods';
import { describe, expect, it } from 'vitest';

import { type CiMethodRecord, parseCiMethodsFile } from './ci-method-core-data.ts';

const byars: CiMethodRecord = {
  id: '019fa38f-073f-764e-9ac6-1c4d03b1cb92',
  name: "Byar's method",
  kind: 'standard',
};

const committedFile = fileURLToPath(new URL('../data/ci-methods.json', import.meta.url));

describe('parseCiMethodsFile', () => {
  it('accepts a well-formed file', () => {
    const other = { ...byars, id: '019fa38f-0746-7e1c-8826-0ee5d2b83fef', name: 'Other method' };
    const methods = [byars, { ...other, kind: 'other' }];

    expect(parseCiMethodsFile(methods)).toEqual(methods);
  });

  it('rejects a kind the publisher form does not know', () => {
    expect(() => parseCiMethodsFile([{ ...byars, kind: 'strange' }])).toThrow(/Invalid/);
  });

  it('rejects an id that is not UUIDv7', () => {
    expect(() =>
      parseCiMethodsFile([{ ...byars, id: '8b7e4a52-9c1d-4f6e-8a3b-2d5c9e7f1a04' }]),
    ).toThrow(/Invalid/);
  });

  it('rejects a repeated id or name', () => {
    expect(() => parseCiMethodsFile([byars, { ...byars, name: 'Another' }])).toThrow(
      /duplicate id/,
    );
    expect(() =>
      parseCiMethodsFile([byars, { ...byars, id: '019fa38f-0740-7aaa-a695-ca2615bea066' }]),
    ).toThrow(/duplicate name/);
  });

  it('accepts the committed file', () => {
    expect(() =>
      parseCiMethodsFile(JSON.parse(readFileSync(committedFile, 'utf-8'))),
    ).not.toThrow();
  });
});

describe('the committed confidence interval methods', () => {
  it('match the standard methods one for one by name, so every method finds its description', () => {
    const methods = parseCiMethodsFile(JSON.parse(readFileSync(committedFile, 'utf-8')));

    expect(methods.map(({ name }) => name).sort()).toEqual(
      STANDARD_CONFIDENCE_INTERVAL_METHODS.map(({ name }) => name).sort(),
    );
  });
});
