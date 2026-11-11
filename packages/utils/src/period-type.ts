import { isOneOf } from './is-one-of.ts';

/** How long each of an indicator's periods is. */
export const PERIOD_TYPES = ['years', 'quarters', 'months'] as const;

export type PeriodType = (typeof PERIOD_TYPES)[number];

export const PERIOD_TYPE_LABELS: Readonly<Record<PeriodType, string>> = {
  years: 'Years',
  quarters: 'Quarters',
  months: 'Months',
};

/** The period types whose periods belong to a year type; months belong to none. */
export const PERIOD_TYPES_WITH_YEAR_TYPE = [
  'years',
  'quarters',
] as const satisfies readonly PeriodType[];

/** The year an indicator's years or quarters belong to. */
export const YEAR_TYPES = [
  'calendar',
  'financial',
  'academic',
  'rolling',
  'specified-end-date',
] as const;

export type YearType = (typeof YEAR_TYPES)[number];

export const YEAR_TYPE_LABELS: Readonly<Record<YearType, string>> = {
  calendar: 'Calendar',
  financial: 'Financial',
  academic: 'Academic',
  rolling: 'Rolling',
  'specified-end-date': 'Ending a specified date',
};

export function isYearType(value: string): value is YearType {
  return isOneOf(YEAR_TYPES, value);
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Whether a day falls in a month of `year`, a four-digit year, or of some year when none is
 * given; 29 February does in a leap year.
 */
export function isDayOfMonth(day: number, month: number, year = 2000): boolean {
  return (
    Number.isInteger(year) &&
    year >= 1000 &&
    year <= 9999 &&
    Number.isInteger(day) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    new Date(Date.UTC(year, month - 1, day)).getUTCDate() === day
  );
}

export interface YearEnd {
  day: number;
  month: number;
}

/** A month's name, from its number (1 for January). */
export function monthName(month: number): string {
  const name = MONTH_NAMES[month - 1];
  if (name === undefined) throw new Error(`Not a month: ${month}`);
  return name;
}

/** The last day of each named year type's year; a year ending on one is that year type. */
const NAMED_YEAR_ENDS: readonly (YearEnd & { yearType: YearType })[] = [
  { day: 31, month: 12, yearType: 'calendar' },
  { day: 31, month: 3, yearType: 'financial' },
  // The UK school year runs from 1 September to 31 August.
  { day: 31, month: 8, yearType: 'academic' },
];

function sameYearEnd(a: YearEnd, b: YearEnd): boolean {
  return a.day === b.day && a.month === b.month;
}

/** The months a year ending on a month's last day runs between, or else the date it ends. */
function yearEndLabel({ day, month }: YearEnd): string {
  // 28 February ends the month in three years out of four, and is taken to mean its end.
  const endsMonth = !isDayOfMonth(day + 1, month) || (month === 2 && day === 28);

  return endsMonth
    ? `${monthName((month % 12) + 1)} to ${monthName(month)}`
    : `Year ending ${day} ${monthName(month)}`;
}

/** A year type as the public reads it; the value is the named year type's where one is folded in. */
export interface PublicYearType {
  value: YearType;
  label: string;
}

/**
 * A version's year type as the public reads it. A year ending on a specified date is the named
 * year type ending on that date if there is one, and is otherwise named by the months it runs
 * between ("August to July") when it ends on a month's last day, and by its date otherwise.
 */
export function publicYearType(yearType: YearType, yearEnd: YearEnd | null): PublicYearType {
  if (yearType === 'specified-end-date' && yearEnd !== null) {
    const named = NAMED_YEAR_ENDS.find((end) => sameYearEnd(end, yearEnd));
    return named
      ? { value: named.yearType, label: YEAR_TYPE_LABELS[named.yearType] }
      : { value: yearType, label: yearEndLabel(yearEnd) };
  }
  return { value: yearType, label: YEAR_TYPE_LABELS[yearType] };
}

/** A stored year type and year end, as a search matches versions by. */
export interface YearTypeValues {
  yearType: YearType;
  yearEnd: YearEnd | null;
}

/** Every year type and year end a version can hold, by the label the public reads it by. */
function yearTypeValuesByLabel(): Map<string, YearTypeValues[]> {
  const named = YEAR_TYPES.filter((yearType) => yearType !== 'specified-end-date').map(
    (yearType): YearTypeValues => ({ yearType, yearEnd: null }),
  );
  // Every day of a leap year, so 29 February is among them.
  const dates = Array.from({ length: 366 }, (_, index) => {
    const date = new Date(Date.UTC(2000, 0, 1 + index));
    return {
      yearType: 'specified-end-date' as const,
      yearEnd: { day: date.getUTCDate(), month: date.getUTCMonth() + 1 },
    };
  });
  const byLabel = new Map<string, YearTypeValues[]>();
  for (const values of [...named, ...dates]) {
    const { label } = publicYearType(values.yearType, values.yearEnd);
    byLabel.set(label, [...(byLabel.get(label) ?? []), values]);
  }
  return byLabel;
}

const YEAR_TYPE_VALUES_BY_LABEL = yearTypeValuesByLabel();

/**
 * The year types and year ends the public reads by a label, for a search by it. The months a
 * named year type runs between ("April to March") are read as that year type.
 */
export function yearTypeValuesLabelled(label: string): YearTypeValues[] {
  const named = NAMED_YEAR_ENDS.find((end) => yearEndLabel(end) === label);
  return YEAR_TYPE_VALUES_BY_LABEL.get(named ? YEAR_TYPE_LABELS[named.yearType] : label) ?? [];
}
