import {
  type RollingFrequency,
  TIME_PERIODS,
  type TimePeriod,
  type YearType,
} from '@fphd/utils/period-type';

/** A day and month, as a year end or either end of a date range holds it. */
interface DayAndMonth {
  day: number;
  month: number;
}

/**
 * What a Fingertips year type says about an indicator's time periods. Its yearly periods are
 * years of a year type, or a window of the year that recurs every year. Rolling years roll on by
 * the quarter or the month, and cumulative quarters add up across the year.
 */
export interface FingertipsYearType {
  yearly:
    | { kind: 'years'; yearType: YearType; yearEnd: DayAndMonth | null }
    | { kind: 'date-range'; start: DayAndMonth; end: DayAndMonth };
  rolling: RollingFrequency | null;
  cumulative: boolean;
}

function years(yearType: YearType, yearEnd: DayAndMonth | null = null): FingertipsYearType {
  return { yearly: { kind: 'years', yearType, yearEnd }, rolling: null, cumulative: false };
}

function endingOn(day: number, month: number): FingertipsYearType {
  return years('specified-end-date', { day, month });
}

function rolling(yearType: YearType, frequency: RollingFrequency): FingertipsYearType {
  return { ...years(yearType), rolling: frequency };
}

function window(start: DayAndMonth, end: DayAndMonth): FingertipsYearType {
  return { yearly: { kind: 'date-range', start, end }, rolling: null, cumulative: false };
}

const CUMULATIVE_QUARTERS: FingertipsYearType = { ...years('financial'), cumulative: true };

export const YEAR_TYPES: Readonly<Record<string, FingertipsYearType>> = {
  Calendar: years('calendar'),
  Financial: years('financial'),
  Academic: years('academic'),
  'August-July': endingOn(31, 7),
  'July-June': endingOn(30, 6),
  'October-September': endingOn(30, 9),
  'March-February': endingOn(28, 2),
  // The Active Lives survey year runs from mid-November.
  'November-November': endingOn(15, 11),
  // These run from 1 September to the end of January or February, part of a year, every year.
  'September-January': window({ day: 1, month: 9 }, { day: 31, month: 1 }),
  'September-February': window({ day: 1, month: 9 }, { day: 28, month: 2 }),
  'Calendar rolling year - monthly': rolling('calendar', 'months'),
  'Calendar rolling year - quarterly': rolling('calendar', 'quarters'),
  'Financial rolling year - monthly': rolling('financial', 'months'),
  'Financial rolling year - quarterly': rolling('financial', 'quarters'),
  'Financial single year cumulative quarters': CUMULATIVE_QUARTERS,
  'Financial multi year cumulative quarters': CUMULATIVE_QUARTERS,
  // Each value is a count on 31 March, read as a year ending that day.
  'Financial year end point': endingOn(31, 3),
};

export function yearTypeValues(name: string): FingertipsYearType {
  const entry = YEAR_TYPES[name];
  if (entry === undefined)
    throw new Error(`No year type value for the Fingertips year type ${JSON.stringify(name)}`);
  return entry;
}

/**
 * One shape of period in an indicator's data, as Fingertips holds it: the series it belongs to,
 * such as one sex and age, the year it starts in, the number of years it spans, and whether it is
 * a quarter or a month of that year.
 */
export interface FingertipsPeriod {
  series: string;
  year: number;
  yearRange: number;
  quarter: boolean;
  month: boolean;
}

/** The time periods columns of indicator_version. */
export interface TimePeriodColumns {
  time_periods: string | null;
  multiple_years_count: number | null;
  multiple_years_year_type: YearType | null;
  multiple_years_end_day: number | null;
  multiple_years_end_month: number | null;
  year_type: YearType | null;
  year_end_day: number | null;
  year_end_month: number | null;
  date_range_start_day: number | null;
  date_range_start_month: number | null;
  date_range_end_day: number | null;
  date_range_end_month: number | null;
  periods_rolling: boolean | null;
  rolling_frequency: RollingFrequency | null;
  values_cumulative: boolean | null;
}

export const NO_TIME_PERIODS: TimePeriodColumns = {
  time_periods: null,
  multiple_years_count: null,
  multiple_years_year_type: null,
  multiple_years_end_day: null,
  multiple_years_end_month: null,
  year_type: null,
  year_end_day: null,
  year_end_month: null,
  date_range_start_day: null,
  date_range_start_month: null,
  date_range_end_day: null,
  date_range_end_month: null,
  periods_rolling: null,
  rolling_frequency: null,
  values_cumulative: null,
};

/**
 * The shapes of period an indicator's data has, kept only as far as judging its time periods
 * needs: the lengths of its yearly periods, whether it has quarters or months, and the years its
 * periods of more than one year start in, for each length and series. Its rows are added one at
 * a time, so the data can be read as it streams.
 */
export class PeriodShapes {
  readonly #yearlyRanges = new Set<number>();
  #quarters = false;
  #months = false;
  readonly #starts = new Map<number, Map<string, Set<number>>>();

  add(period: FingertipsPeriod): void {
    if (period.quarter) {
      this.#quarters = true;
      return;
    }
    if (period.month) {
      this.#months = true;
      return;
    }
    this.#yearlyRanges.add(period.yearRange);
    if (period.yearRange <= 1) return;
    const bySeries = this.#starts.get(period.yearRange) ?? new Map<string, Set<number>>();
    const starts = bySeries.get(period.series) ?? new Set<number>();
    starts.add(period.year);
    bySeries.set(period.series, starts);
    this.#starts.set(period.yearRange, bySeries);
  }

  get isEmpty(): boolean {
    return this.#yearlyRanges.size === 0 && !this.#quarters && !this.#months;
  }

  get hasQuarters(): boolean {
    return this.#quarters;
  }

  get hasMonths(): boolean {
    return this.#months;
  }

  /** The number of years each yearly period spans, one for a year. */
  get yearlyRanges(): ReadonlySet<number> {
    return this.#yearlyRanges;
  }

  /**
   * Whether consecutive periods of `yearRange` years in any one series start less than that many
   * years apart. Periods of different series, such as two sexes, are not compared.
   */
  overlaps(yearRange: number): boolean {
    return [...(this.#starts.get(yearRange)?.values() ?? [])].some((series) => {
      const starts = [...series].sort((a, b) => a - b);
      return starts.some(
        (start, index) => index > 0 && start - (starts[index - 1] ?? start) < yearRange,
      );
    });
  }
}

/** The shapes of a list of periods, as an indicator's data might have them. */
export function periodShapesOf(periods: readonly FingertipsPeriod[]): PeriodShapes {
  const shapes = new PeriodShapes();
  for (const period of periods) shapes.add(period);
  return shapes;
}

/** The kinds of time period an indicator's shapes of period are, under a Fingertips year type. */
function kindsOf(shapes: PeriodShapes, yearType: FingertipsYearType): Set<TimePeriod> {
  // With no data, the year type's yearly periods are taken alone.
  const yearlyRanges = shapes.isEmpty ? new Set([1]) : shapes.yearlyRanges;
  // A rolling year is a year whether it rolls on by the quarter or the month.
  if (yearType.rolling !== null) return new Set(['single-years']);
  const yearly = [...yearlyRanges].map((range): TimePeriod => {
    if (yearType.yearly.kind === 'date-range') return 'date-range';
    return range > 1 ? 'multiple-years' : 'single-years';
  });
  return new Set([
    ...yearly,
    ...(shapes.hasQuarters ? ['quarters' as const] : []),
    ...(shapes.hasMonths ? ['months' as const] : []),
  ]);
}

/** A postgres array literal of the kinds of time period, in the order the page asks them. */
function arrayLiteral(kinds: ReadonlySet<TimePeriod>): string {
  return `{${TIME_PERIODS.filter((kind) => kinds.has(kind)).join(',')}}`;
}

/**
 * The time periods answers of an indicator, from its Fingertips year type and the shapes of
 * period its data has. Periods of more than one year are "Periods of more than 1 year" of that
 * many years; where they have several lengths, the shortest is taken. They roll on by the year
 * where consecutive periods of that length in one series overlap. With no data, the year type's
 * yearly periods are taken alone.
 */
export function timePeriodColumns(
  name: string,
  shapes: PeriodShapes = new PeriodShapes(),
): TimePeriodColumns {
  const yearType = yearTypeValues(name);
  const kinds = kindsOf(shapes, yearType);
  const multipleYearRanges = kinds.has('multiple-years')
    ? [...shapes.yearlyRanges].filter((range) => range > 1)
    : [];
  const multipleYearsCount = multipleYearRanges.length > 0 ? Math.min(...multipleYearRanges) : null;
  const rollsByYear = multipleYearsCount !== null && shapes.overlaps(multipleYearsCount);
  const { yearly } = yearType;
  const ofYears = yearly.kind === 'years' ? yearly : null;
  const dateRange = yearly.kind === 'date-range' && kinds.has('date-range') ? yearly : null;
  const singleYears = kinds.has('single-years') ? ofYears : null;
  const multipleYears = multipleYearsCount === null ? null : ofYears;
  const rollingFrequency = yearType.rolling ?? (rollsByYear ? 'years' : null);

  return {
    time_periods: arrayLiteral(kinds),
    multiple_years_count: multipleYearsCount,
    multiple_years_year_type: multipleYears?.yearType ?? null,
    multiple_years_end_day: multipleYears?.yearEnd?.day ?? null,
    multiple_years_end_month: multipleYears?.yearEnd?.month ?? null,
    year_type: singleYears?.yearType ?? null,
    year_end_day: singleYears?.yearEnd?.day ?? null,
    year_end_month: singleYears?.yearEnd?.month ?? null,
    date_range_start_day: dateRange?.start.day ?? null,
    date_range_start_month: dateRange?.start.month ?? null,
    date_range_end_day: dateRange?.end.day ?? null,
    date_range_end_month: dateRange?.end.month ?? null,
    periods_rolling: rollingFrequency !== null,
    rolling_frequency: rollingFrequency,
    values_cumulative: yearType.cumulative,
  };
}
