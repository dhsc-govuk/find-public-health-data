import { isOneOf } from './is-one-of.ts';

/** The kinds of time period an indicator's data can have, in the order the page asks them. */
export const TIME_PERIODS = [
  'multiple-years',
  'single-years',
  'quarters',
  'months',
  'date-range',
] as const;

export type TimePeriod = (typeof TIME_PERIODS)[number];

export const TIME_PERIOD_LABELS: Readonly<Record<TimePeriod, string>> = {
  'multiple-years': 'Periods of more than 1 year',
  'single-years': 'Single years',
  quarters: 'Quarters',
  months: 'Months',
  'date-range': 'Specific date range',
};

/** The year that single years, or periods of more than 1 year, belong to. */
export const YEAR_TYPES = ['calendar', 'financial', 'academic', 'specified-end-date'] as const;

export type YearType = (typeof YEAR_TYPES)[number];

export const YEAR_TYPE_LABELS: Readonly<Record<YearType, string>> = {
  calendar: 'Calendar',
  financial: 'Financial',
  academic: 'Academic',
  'specified-end-date': 'Ending a specified date',
};

/** The year types named for the dates they run between. */
export type NamedYearType = Exclude<YearType, 'specified-end-date'>;

/** The dates each named year type runs between, shown beside its name. */
export const YEAR_TYPE_DATES: Readonly<Record<NamedYearType, string>> = {
  calendar: '1 January to 31 December',
  financial: '1 April to 31 March',
  academic: '1 September to 31 August',
};

/** How often rolling time periods move on. */
export const ROLLING_FREQUENCIES = ['years', 'quarters', 'months'] as const;

export type RollingFrequency = (typeof ROLLING_FREQUENCIES)[number];

export const ROLLING_FREQUENCY_LABELS: Readonly<Record<RollingFrequency, string>> = {
  years: 'Years',
  quarters: 'Quarters',
  months: 'Months',
};

/**
 * The year types the public reads an indicator's periods by: a stored year type, or rolling for
 * an indicator whose time periods roll.
 */
export const PUBLIC_YEAR_TYPES = [
  'calendar',
  'financial',
  'academic',
  'rolling',
  'specified-end-date',
] as const;

export type PublicYearTypeValue = (typeof PUBLIC_YEAR_TYPES)[number];

const PUBLIC_YEAR_TYPE_LABELS: Readonly<Record<PublicYearTypeValue, string>> = {
  ...YEAR_TYPE_LABELS,
  rolling: 'Rolling',
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
const NAMED_YEAR_ENDS: readonly (YearEnd & { yearType: NamedYearType })[] = [
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
  value: PublicYearTypeValue;
  label: string;
}

/**
 * A version's year type as the public reads it. A year ending on a specified date is the named
 * year type ending on that date if there is one, and is otherwise named by the months it runs
 * between ("August to July") when it ends on a month's last day, and by its date otherwise.
 */
export function publicYearType(
  yearType: PublicYearTypeValue,
  yearEnd: YearEnd | null,
): PublicYearType {
  if (yearType === 'specified-end-date' && yearEnd !== null) {
    const named = NAMED_YEAR_ENDS.find((end) => sameYearEnd(end, yearEnd));
    return named
      ? { value: named.yearType, label: YEAR_TYPE_LABELS[named.yearType] }
      : { value: yearType, label: yearEndLabel(yearEnd) };
  }
  return { value: yearType, label: PUBLIC_YEAR_TYPE_LABELS[yearType] };
}

/** A stored year type and year end, as a search matches versions by. */
export interface YearTypeValues {
  yearType: PublicYearTypeValue;
  yearEnd: YearEnd | null;
}

/** Every year type and year end a version can hold, by the label the public reads it by. */
function yearTypeValuesByLabel(): Map<string, YearTypeValues[]> {
  const named = PUBLIC_YEAR_TYPES.filter((yearType) => yearType !== 'specified-end-date').map(
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

/** A version's answers about its time periods, as the draft stores them. */
export interface TimePeriodAnswers {
  timePeriods: readonly TimePeriod[] | null;
  multipleYearsCount: number | null;
  multipleYearsYearType: YearType | null;
  multipleYearsEndDay: number | null;
  multipleYearsEndMonth: number | null;
  yearType: YearType | null;
  yearEndDay: number | null;
  yearEndMonth: number | null;
  dateRangeStartDay: number | null;
  dateRangeStartMonth: number | null;
  dateRangeEndDay: number | null;
  dateRangeEndMonth: number | null;
  periodsRolling: boolean | null;
  rollingFrequency: RollingFrequency | null;
}

/** The day and month the stored numbers name, or null unless both are given. */
export function yearEndOf(day: number | null, month: number | null): YearEnd | null {
  return day === null || month === null ? null : { day, month };
}

/**
 * The year type the public reads a version's periods by: rolling where its time periods roll on
 * by the quarter or the month, otherwise the year type of its single years, or else that of its
 * periods of more than 1 year. Null when it has neither, as quarters and months have no year type
 * of their own. Periods that roll on by the year start on the same date each year, so they are
 * read by their year type like any other.
 */
export function shownYearType(
  answers: Pick<
    TimePeriodAnswers,
    | 'yearType'
    | 'yearEndDay'
    | 'yearEndMonth'
    | 'multipleYearsYearType'
    | 'multipleYearsEndDay'
    | 'multipleYearsEndMonth'
    | 'periodsRolling'
    | 'rollingFrequency'
  >,
): PublicYearType | null {
  if (answers.periodsRolling === true && answers.rollingFrequency !== 'years') {
    return publicYearType('rolling', null);
  }
  if (answers.yearType !== null) {
    return publicYearType(answers.yearType, yearEndOf(answers.yearEndDay, answers.yearEndMonth));
  }
  if (answers.multipleYearsYearType !== null) {
    return publicYearType(
      answers.multipleYearsYearType,
      yearEndOf(answers.multipleYearsEndDay, answers.multipleYearsEndMonth),
    );
  }
  return null;
}

function dayAndMonth({ day, month }: YearEnd): string {
  return `${day} ${monthName(month)}`;
}

/** Years of a year type: "Financial years (1 April to 31 March)", or "years ending 31 March". */
function yearsText(yearType: YearType | null, yearEnd: YearEnd | null): string {
  if (yearType === 'specified-end-date') {
    return yearEnd === null ? 'years' : `years ending ${dayAndMonth(yearEnd)}`;
  }
  return yearType === null
    ? 'years'
    : `${YEAR_TYPE_LABELS[yearType]} years (${YEAR_TYPE_DATES[yearType]})`;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Each kind of time period a version has, in words, joined in the order the page asks them:
 * "3-year Calendar years (1 January to 31 December)", "Years ending 31 March", "Quarters",
 * "Months" or a date range such as "1 October to 31 March". Null until they are answered.
 */
export function timePeriodsText(answers: TimePeriodAnswers): string | null {
  const { timePeriods } = answers;
  if (timePeriods === null || timePeriods.length === 0) return null;

  const parts = TIME_PERIODS.filter((period) => timePeriods.includes(period)).map((period) => {
    switch (period) {
      case 'multiple-years': {
        const years = yearsText(
          answers.multipleYearsYearType,
          yearEndOf(answers.multipleYearsEndDay, answers.multipleYearsEndMonth),
        );
        return answers.multipleYearsCount === null
          ? capitalised(years)
          : `${answers.multipleYearsCount}-year ${years}`;
      }
      case 'single-years':
        return capitalised(
          yearsText(answers.yearType, yearEndOf(answers.yearEndDay, answers.yearEndMonth)),
        );
      case 'date-range': {
        const start = yearEndOf(answers.dateRangeStartDay, answers.dateRangeStartMonth);
        const end = yearEndOf(answers.dateRangeEndDay, answers.dateRangeEndMonth);
        return start === null || end === null
          ? TIME_PERIOD_LABELS[period]
          : `${dayAndMonth(start)} to ${dayAndMonth(end)}`;
      }
      default:
        return TIME_PERIOD_LABELS[period];
    }
  });

  return parts.join(', ');
}
