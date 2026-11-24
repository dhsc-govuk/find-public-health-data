/**
 * The range of each age value, from Fingertips' MinYears and MaxYears, with a hand-written table
 * for bands under a year or not in whole years. The core reference export regenerates it whole.
 */

import type { AgeUnit } from '@fphd/utils/age-range';
import { AGE_DIMENSION_NAME } from '@fphd/utils/observation-series';

export interface DimensionTypeInput {
  id: string;
  name: string;
}

export interface DimensionValueInput {
  id: string;
  dimensionTypeId: string;
  code: string | null;
  isAggregate: boolean;
}

export interface DimensionValueAgeRange {
  id: string;
  ageFromValue: number;
  ageFromUnit: AgeUnit;
  ageUnderValue: number | null;
  ageUnderUnit: AgeUnit | null;
}

interface AgeRange {
  from: readonly [number, AgeUnit];
  under: readonly [number, AgeUnit] | null;
}

// Fingertips' bands under a year or not in whole years, keyed by AgeID, and those that aren't
// ranges at all (null). The rest come from MinYears and MaxYears.
const AGE_RANGES: ReadonlyMap<string, AgeRange | null> = new Map([
  ['24', { from: [0, 'day'], under: [7, 'day'] }],
  ['284', { from: [0, 'day'], under: [14, 'day'] }],
  ['301', { from: [0, 'day'], under: [31, 'day'] }],
  ['203', { from: [0, 'week'], under: [5, 'week'] }],
  ['336', { from: [30, 'day'], under: [31, 'day'] }],
  ['337', { from: [56, 'day'], under: [57, 'day'] }],
  ['338', { from: [457, 'day'], under: [458, 'day'] }],
  ['339', { from: [914, 'day'], under: [915, 'day'] }],
  ['23', { from: [0, 'day'], under: [28, 'day'] }],
  ['170', { from: [6, 'week'], under: [9, 'week'] }],
  ['326', { from: [8, 'month'], under: [9, 'month'] }],
  ['327', { from: [18, 'month'], under: [19, 'month'] }],
  ['295', { from: [28, 'day'], under: [1, 'year'] }],
  ['226', { from: [6, 'month'], under: [65, 'year'] }],
  // The health visitor review, done by the time a child turns 2½.
  ['241', { from: [2, 'year'], under: [30, 'month'] }],
  ['209M', { from: [16, 'year'], under: [65, 'year'] }],
  ['209F', { from: [16, 'year'], under: [60, 'year'] }],
  ['212M', { from: [65, 'year'], under: null }],
  ['212F', { from: [60, 'year'], under: null }],
  ['274F', { from: [16, 'year'], under: [62, 'year'] }],
  // Not age ranges, so they get no range: the indicator's population, such as Newborn,
  // gestational age, the NCMP band and school stages.
  ['309', null],
  ['235', null],
  ['329', null],
  ['334', null],
  ['215', null],
  ['216', null],
  ['217', null],
]);

/** Fingertips writes 150 for a band with no upper limit. */
const NO_UPPER_LIMIT = 150;

function ageRangeOf(
  code: string,
  yearsByCode: ReadonlyMap<string, { min: number; max: number }>,
): AgeRange | null {
  if (AGE_RANGES.has(code)) return AGE_RANGES.get(code) ?? null;
  const years = yearsByCode.get(code);
  if (years === undefined) return null;
  return {
    from: [years.min, 'year'],
    under: years.max >= NO_UPPER_LIMIT ? null : [years.max + 1, 'year'],
  };
}

/**
 * The range of every age value that is one. The aggregate All ages and the values that describe
 * a population rather than a range, such as School age, get none.
 */
export function ageRanges(
  types: readonly DimensionTypeInput[],
  values: readonly DimensionValueInput[],
  ageYearsByCode: ReadonlyMap<string, { min: number; max: number }>,
): DimensionValueAgeRange[] {
  const ageTypeIds = new Set(
    types.filter(({ name }) => name === AGE_DIMENSION_NAME).map(({ id }) => id),
  );
  return values.flatMap((value) => {
    if (!ageTypeIds.has(value.dimensionTypeId) || value.isAggregate) return [];
    const range = ageRangeOf(value.code ?? '', ageYearsByCode);
    if (range === null) return [];
    return [
      {
        id: value.id,
        ageFromValue: range.from[0],
        ageFromUnit: range.from[1],
        ageUnderValue: range.under?.[0] ?? null,
        ageUnderUnit: range.under?.[1] ?? null,
      },
    ];
  });
}
