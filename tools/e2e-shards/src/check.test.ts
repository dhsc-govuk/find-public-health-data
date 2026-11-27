import { describe, expect, it } from 'vitest';

import {
  findMisplacedFiles,
  findShardProblems,
  findUnmatchedTimings,
  readShardTotal,
} from './check.ts';

const matrix = (...suites: string[]) =>
  `      matrix:\n        include:\n${suites.map((suite) => `          - suite: ${suite}\n            report: x\n`).join('')}`;

describe('readShardTotal', () => {
  it('reads the total from the numbered shards, ignoring the publishing entry', () => {
    expect(readShardTotal(matrix('1/4', '2/4', '3/4', '4/4', 'publishing'))).toBe(4);
  });

  it('refuses a matrix with no numbered shards', () => {
    expect(() => readShardTotal(matrix('publishing'))).toThrow(/no e2e matrix entry/);
  });

  it('refuses shards that disagree on their total', () => {
    expect(() => readShardTotal(matrix('1/2', '2/3'))).toThrow(/disagree on their total: 2, 3/);
  });

  it('refuses a missing or repeated shard', () => {
    expect(() => readShardTotal(matrix('1/3', '3/3'))).toThrow(
      /are 1\/3, 3\/3; they must be 1\/3, 2\/3, 3\/3/,
    );
    expect(() => readShardTotal(matrix('1/2', '1/2', '2/2'))).toThrow(/must be 1\/2, 2\/2/);
  });
});

const test = (id: string, file = 'a.spec.ts') => ({ id, label: `test ${id}`, file, seconds: 0 });

describe('findShardProblems', () => {
  it('finds nothing when every test runs in exactly one shard', () => {
    expect(findShardProblems([test('1'), test('2')], [[test('2')], [test('1')], []])).toEqual([]);
  });

  it('names a test no shard runs, a test two shards run and a test the suite does not have', () => {
    expect(
      findShardProblems(
        [test('1'), test('2'), test('3')],
        [
          [test('1'), test('2')],
          [test('2'), test('4')],
        ],
      ),
    ).toEqual([
      'No shard runs test 3',
      'Shards 1 and 2 each run test 2',
      "Shard 2 runs test 4, which the whole suite doesn't have",
    ]);
  });
});

describe('findMisplacedFiles', () => {
  const expected = [
    { files: ['a.spec.ts'], seconds: 5 },
    { files: ['b.spec.ts', 'c.spec.ts'], seconds: 5 },
  ];

  it('finds nothing when every shard runs the files the timings give it', () => {
    const shards = [[test('1', 'a.spec.ts')], [test('2', 'c.spec.ts'), test('3', 'b.spec.ts')]];

    expect(findMisplacedFiles(expected, shards)).toEqual([]);
  });

  it('names the files a shard runs that the timings put elsewhere, and those it should run', () => {
    const shards = [[test('1', 'a.spec.ts'), test('2', 'b.spec.ts')], [test('3', 'c.spec.ts')]];

    expect(findMisplacedFiles(expected, shards)).toEqual([
      'Shard 1 runs b.spec.ts, which the timings put elsewhere',
      "Shard 2 should run b.spec.ts but doesn't",
    ]);
  });
});

describe('findUnmatchedTimings', () => {
  it('finds nothing when at least one listed spec file has a timing', () => {
    expect(findUnmatchedTimings(['a.spec.ts', 'new.spec.ts'], { 'a.spec.ts': 2 })).toEqual([]);
  });

  it('finds nothing when the timings file is empty', () => {
    expect(findUnmatchedTimings(['a.spec.ts'], {})).toEqual([]);
  });

  it('names the problem when no listed spec file has a timing', () => {
    expect(
      findUnmatchedTimings(['public/a.spec.ts'], { 'tests/public/a.spec.ts': 2, 'b.spec.ts': 1 }),
    ).toEqual(['None of the 2 files in e2e/shard-timings.json is a listed spec file']);
  });
});
