/** How an indicator's ages are given: all of them, as ranges, as one age, or described in words. */
export const AGE_TYPES = ['all', 'range', 'specific', 'other'] as const;

export type AgeType = (typeof AGE_TYPES)[number];

/** The highest age, in any unit, a limit or a specific age may be. */
export const MAX_AGE = 999;

/**
 * Each unit an age is given in, and its length in days, which is how two ages are compared.
 * A year is 365.25 days and a month a twelfth of one, so 12 months is the same age as 1 year.
 */
export const AGE_UNIT_DAYS = { days: 1, weeks: 7, months: 30.4375, years: 365.25 } as const;

export type AgeUnit = keyof typeof AGE_UNIT_DAYS;

export const AGE_UNITS = Object.keys(AGE_UNIT_DAYS) as [AgeUnit, ...AgeUnit[]];
