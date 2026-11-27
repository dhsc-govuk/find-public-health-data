import { describe, expect, it } from 'vitest';

import { packFiles } from './pack.ts';

const filesOf = (shards: ReturnType<typeof packFiles>) => shards.map((shard) => shard.files);

describe('packFiles', () => {
  it('gives each file to the shard with the least time so far, heaviest file first', () => {
    const timings = { 'a.spec.ts': 10, 'b.spec.ts': 6, 'c.spec.ts': 3, 'd.spec.ts': 1 };

    expect(packFiles(Object.keys(timings), timings, 2)).toEqual([
      { files: ['a.spec.ts'], seconds: 10 },
      { files: ['b.spec.ts', 'c.spec.ts', 'd.spec.ts'], seconds: 10 },
    ]);
  });

  it('packs the same way whatever order the files arrive in', () => {
    const timings = { 'a.spec.ts': 3, 'b.spec.ts': 3, 'c.spec.ts': 3, 'd.spec.ts': 1 };
    const files = Object.keys(timings);

    expect(packFiles([...files].reverse(), timings, 3)).toEqual(packFiles(files, timings, 3));
    expect(filesOf(packFiles(files, timings, 3))).toEqual([
      ['a.spec.ts', 'd.spec.ts'],
      ['b.spec.ts'],
      ['c.spec.ts'],
    ]);
  });

  it('weighs a new file at the median of the measured files', () => {
    const timings = { 'a.spec.ts': 9, 'b.spec.ts': 3, 'c.spec.ts': 1 };

    const shards = packFiles(['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'new.spec.ts'], timings, 2);

    expect(shards).toEqual([
      { files: ['a.spec.ts'], seconds: 9 },
      { files: ['b.spec.ts', 'c.spec.ts', 'new.spec.ts'], seconds: 7 },
    ]);
  });

  it('ignores the timing of a file that no longer exists', () => {
    const timings = { 'a.spec.ts': 2, 'b.spec.ts': 2, 'removed.spec.ts': 100 };

    const shards = packFiles(['a.spec.ts', 'b.spec.ts', 'new.spec.ts'], timings, 2);

    expect(shards).toEqual([
      { files: ['a.spec.ts', 'new.spec.ts'], seconds: 4 },
      { files: ['b.spec.ts'], seconds: 2 },
    ]);
  });

  it('spreads the files by count, in path order, when there are no timings', () => {
    const shards = packFiles(
      ['c.spec.ts', 'a.spec.ts', 'e.spec.ts', 'b.spec.ts', 'd.spec.ts'],
      {},
      2,
    );

    expect(shards).toEqual([
      { files: ['a.spec.ts', 'c.spec.ts', 'e.spec.ts'], seconds: 3 },
      { files: ['b.spec.ts', 'd.spec.ts'], seconds: 2 },
    ]);
  });

  it('puts every file in exactly one shard, leaving shards empty when there are too few files', () => {
    const shards = packFiles(['a.spec.ts', 'b.spec.ts', 'a.spec.ts'], { 'a.spec.ts': 1 }, 4);

    expect(filesOf(shards)).toEqual([['a.spec.ts'], ['b.spec.ts'], [], []]);
  });

  it('refuses a shard total that is not a positive whole number', () => {
    expect(() => packFiles(['a.spec.ts'], {}, 0)).toThrow(/positive whole number/);
    expect(() => packFiles(['a.spec.ts'], {}, 1.5)).toThrow(/positive whole number/);
  });
});
