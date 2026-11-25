import { expect, it } from 'vitest';
import { displayConfidenceLimit, formatConfidenceLimit } from './confidence-interval.ts';
import { confidenceInterval } from './data.ts';
import { observation } from './view.testing.ts';

const proportion = { valueType: 'Proportion' };

it.each([
  [null, null],
  [-2, -2],
  [0, 0],
  [1.2, 1.2],
  [99.94, 99.94],
  [99.95, 100],
  [100, 100],
  [100.00000000000003, 100],
  [120.4115, 100],
  [72042.0954, 100],
  [72939.9819, 100],
])('displays the Proportion limit %s as %s', (value, expected) => {
  expect(displayConfidenceLimit(value, proportion)).toBe(expected);
});

it.each(['%', 'per 100', null])('does not infer a different cap from the unit %s', (unit) => {
  const indicator = { ...proportion, unit };
  expect(displayConfidenceLimit(120.4115, indicator)).toBe(100);
  expect(displayConfidenceLimit(1.2, indicator)).toBe(1.2);
  expect(displayConfidenceLimit(-2, indicator)).toBe(-2);
});

it.each(['Crude rate', 'Ratio', 'Indirectly standardised proportion', 'Percentage point', null])(
  'does not cap %s',
  (valueType) => {
    expect(displayConfidenceLimit(120.4115, { valueType })).toBe(120.4115);
  },
);

it.each([0.9, 1, 9.999])('preserves the low-maximum formatter exception at %s', (maximum) => {
  expect(
    displayConfidenceLimit(120.4115, {
      ...proportion,
      fingertipsFormatting: { maximum, decimalPlaces: null },
    }),
  ).toBe(120.4115);
});

it.each([0, 1, 2])('preserves a fixed-decimal override of %s places', (decimalPlaces) => {
  expect(
    displayConfidenceLimit(120.4115, {
      ...proportion,
      fingertipsFormatting: { maximum: 100, decimalPlaces },
    }),
  ).toBe(120.4115);
});

it.each([null, 10, 100])('caps when the source maximum is %s with no fixed override', (maximum) => {
  expect(
    displayConfidenceLimit(120.4115, {
      ...proportion,
      fingertipsFormatting: { maximum, decimalPlaces: -1 },
    }),
  ).toBe(100);
});

it.each(['95', '99.8'] as const)(
  'caps both %s bounds without altering the observation',
  (level) => {
    const point = Object.freeze({
      ...observation(72.49),
      lowerCi95: 72042.0954,
      upperCi95: 72939.9819,
      lowerCi998: 72042.0954,
      upperCi998: 72939.9819,
    });
    expect(confidenceInterval(point, level, proportion)).toBe('100 to 100');
    expect(point.lowerCi95).toBe(72042.0954);
    expect(point.upperCi998).toBe(72939.9819);
  },
);

it.each([
  [120.4115, null, null, '100'],
  [4.0368, 100, null, '4.0'],
  [120.4115, 100, 2, '120.41'],
  [120.4115, 9.99, null, '120.41'],
  [120.4115, 0.99, null, '120.412'],
  [100, 0.99, null, '100.000'],
  [100, 100, 2, '100.00'],
  [100, 100, null, '100'],
])(
  'formats %s with maximum %s and override %s as %s',
  (value, maximum, decimalPlaces, expected) => {
    expect(
      formatConfidenceLimit(
        value,
        { ...proportion, fingertipsFormatting: { maximum, decimalPlaces } },
        String,
      ),
    ).toBe(expected);
  },
);
