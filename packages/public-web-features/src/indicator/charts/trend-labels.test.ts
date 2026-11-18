import { expect, it } from 'vitest';
import { declutterLabels } from './trend-labels.tsx';

it('spreads each cluster around its own natural mean and leaves clear labels alone', () => {
  const result = declutterLabels([0, 2, 4, 50, 90, 92].map((pointY) => ({ pointY })));
  expect(result.map(({ y }) => y)).toEqual([-18, 2, 22, 50, 81, 101]);
  expect(result[3]).toEqual({ pointY: 50, y: 50 });
});

it('pushes on a label that a spread cluster reaches', () => {
  expect(declutterLabels([0, 2, 4, 26].map((pointY) => ({ pointY }))).map(({ y }) => y)).toEqual([
    -18, 2, 22, 42,
  ]);
});

it('keeps a cluster moved inside the plot clear of the next cluster', () => {
  expect(
    declutterLabels(
      [10, 12, 14, 35, 37, 39].map((pointY) => ({ pointY })),
      20,
      [0, 100],
    ).map(({ y }) => y),
  ).toEqual([0, 20, 40, 60, 80, 100]);
});

it('keeps labels at the collision threshold unchanged and sorts by natural position', () => {
  expect(
    declutterLabels([{ pointY: 40 }, { pointY: 0 }, { pointY: 20 }]).map(({ y }) => y),
  ).toEqual([0, 20, 40]);
});

it('separates identical endpoints and preserves their input order', () => {
  const result = declutterLabels(
    ['first', 'second', 'third'].map((name) => ({ name, pointY: 100 })),
  );
  expect(result.map(({ name, y }) => [name, y])).toEqual([
    ['first', 80],
    ['second', 100],
    ['third', 120],
  ]);
});

it('keeps spread clusters inside the plot', () => {
  expect(
    declutterLabels(
      [0, 2, 4, 96, 98].map((pointY) => ({ pointY })),
      20,
      [0, 100],
    ).map(({ y }) => y),
  ).toEqual([0, 20, 40, 80, 100]);
});
