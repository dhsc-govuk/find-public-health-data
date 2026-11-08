/**
 * The dimensions the public API gives their own columns. Every other dimension is custom, in the
 * numbered `category` columns.
 */
export const STANDARD_DIMENSIONS = [
  'sex',
  'age',
  'deprivation',
  'ethnicity',
  'socioeconomic-group',
  'religion',
  'sexuality',
] as const;

export type StandardDimension = (typeof STANDARD_DIMENSIONS)[number];

/** The units an age band's ends are written in, as ISO 8601 duration designators. */
export const AGE_UNITS = ['year', 'month', 'week', 'day'] as const;

export type AgeUnit = (typeof AGE_UNITS)[number];

const DESIGNATORS: Readonly<Record<AgeUnit, string>> = {
  year: 'Y',
  month: 'M',
  week: 'W',
  day: 'D',
};

/** An age band's end as an ISO 8601 duration, such as `P5Y` or `P28D`. */
export function isoDuration(value: number, unit: AgeUnit): string {
  return `P${value}${DESIGNATORS[unit]}`;
}

/** Lengths in days, for comparing ends written in different units. */
const DAYS: Readonly<Record<AgeUnit, number>> = {
  year: 365.25,
  month: 365.25 / 12,
  week: 7,
  day: 1,
};

/** An end's length in days, so that `P6W` sorts below `P1Y`. */
export function durationDays(value: number, unit: AgeUnit): number {
  return value * DAYS[unit];
}
