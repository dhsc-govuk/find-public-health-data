import { expect, it } from 'vitest';
import { declutterLabels } from './trend-labels.tsx';

it('spreads each cluster around its own natural mean without moving isolated labels', () => {
  const result = declutterLabels([0, 2, 4, 26, 70, 72].map((pointY) => ({ pointY })));
  expect(result.map(({ y }) => y)).toEqual([-18, 2, 22, 26, 61, 81]);
  expect(result[3]).toEqual({ pointY: 26, y: 26 });
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
