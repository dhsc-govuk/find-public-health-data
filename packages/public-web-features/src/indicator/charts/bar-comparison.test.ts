import { expect, it } from 'vitest';
import { observation } from '../view.testing.ts';
import { barComparison, barComparisonText, barMean, barPalettes } from './bar-comparison.ts';

it('derives the mean from the plotted values, including zero and excluding missing bars', () => {
  expect(barMean([0, 5, 10, null, undefined])).toBe(5);
  expect(barMean([null, undefined])).toBeNull();
});

it.each([
  [9.499, 'lower'],
  [9.5, 'similar'],
  [10, 'similar'],
  [10.5, 'similar'],
  [10.501, 'higher'],
] as const)('compares %s with the inclusive half-point band as %s', (value, expected) => {
  expect(
    barComparison(
      {
        ...observation(value),
        lowerCi95: null,
        upperCi95: null,
        lowerCi998: null,
        upperCi998: null,
      },
      10,
    ),
  ).toBe(expected);
});

it('prefers the category confidence interval, including both boundaries', () => {
  const point = { ...observation(12), lowerCi95: 10, upperCi95: 14, lowerCi998: 8, upperCi998: 16 };
  expect(barComparison(point, 10)).toBe('similar');
  expect(barComparison(point, 14)).toBe('similar');
  expect(barComparison(point, 9.9)).toBe('higher');
  expect(barComparison(point, 14.1)).toBe('lower');
  expect(barComparison(point, 9.9, '99.8')).toBe('similar');
  expect(barComparison({ ...point, lowerCi95: null, upperCi95: null }, 9.9)).toBe('similar');
  expect(barComparison({ ...point, value: null }, 10)).toBeNull();
});

it('calls a bar within half a point similar even when its interval excludes the mean', () => {
  const point = { ...observation(10.4), lowerCi95: 10.2, upperCi95: 10.6 };
  expect(barComparison(point, 10)).toBe('similar');
  expect(barComparison({ ...point, value: 10.8, lowerCi95: 10.6, upperCi95: 11 }, 10)).toBe(
    'higher',
  );
});

it('uses the specified palettes and comparison wording in both modes', () => {
  expect(barPalettes.magnitude).toEqual({
    higher: '#f46a25',
    similar: '#ffc000',
    lower: '#12436d',
  });
  expect(barPalettes.rag).toEqual({ higher: '#8ed973', similar: '#ffc000', lower: '#c00000' });
  expect(
    ['higher', 'similar', 'lower'].map((value) =>
      barComparisonText(value as 'higher' | 'similar' | 'lower', 'magnitude'),
    ),
  ).toEqual(['Higher than average', 'Similar to average', 'Lower than average']);
  expect(
    ['higher', 'similar', 'lower'].map((value) =>
      barComparisonText(value as 'higher' | 'similar' | 'lower', 'rag'),
    ),
  ).toEqual(['Better than average', 'Similar to average', 'Worse than average']);
});
