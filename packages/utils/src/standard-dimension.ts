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

export const STANDARD_DIMENSION_LABELS: Readonly<Record<StandardDimension, string>> = {
  sex: 'Sex',
  age: 'Age',
  deprivation: 'Deprivation',
  ethnicity: 'Ethnicity',
  'socioeconomic-group': 'Socioeconomic group',
  religion: 'Religion',
  sexuality: 'Sexuality',
};

/** The standard dimensions with no classification scheme. */
export const SCHEMELESS_DIMENSIONS: readonly StandardDimension[] = ['sex', 'age'];

/** The units an age band's ends are written in, as ISO 8601 duration designators. */
export const AGE_UNITS = ['year', 'month', 'week', 'day'] as const;

export type AgeUnit = (typeof AGE_UNITS)[number];

export const AGE_UNIT_DESIGNATORS: Readonly<Record<AgeUnit, string>> = {
  year: 'Y',
  month: 'M',
  week: 'W',
  day: 'D',
};

/** An age band's end as an ISO 8601 duration, such as `P5Y` or `P28D`. */
export function isoDuration(value: number, unit: AgeUnit): string {
  return `P${value}${AGE_UNIT_DESIGNATORS[unit]}`;
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

/** A duration `isoDuration` writes, capturing its value and designator. */
export const ISO_AGE_DURATION = /^P(\d+)([YMWD])$/;

/** The length in days of a duration `isoDuration` writes, or undefined for any other string. */
export function isoDurationDays(duration: string): number | undefined {
  const [, value, designator] = ISO_AGE_DURATION.exec(duration) ?? [];
  const unit = AGE_UNITS.find((unit) => AGE_UNIT_DESIGNATORS[unit] === designator);
  return unit === undefined ? undefined : durationDays(Number(value), unit);
}
