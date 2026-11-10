import { monthName, type PublicYearType } from './period-type.ts';

/** A period as observations store it: ISO dates, both inclusive. */
export interface Period {
  fromDate: string;
  toDate: string;
}

interface Day {
  year: number;
  month: number;
  day: number;
}

function dayOf(date: string): Day {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = date.split('-').map(Number);
  return { year, month, day };
}

function nextDay({ year, month, day }: Day): Day {
  // Date.UTC reads years 0 to 99 as 1900 to 1999; setUTCFullYear takes them as written.
  const next = new Date(0);
  next.setUTCFullYear(year, month - 1, day + 1);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/** The number of whole years the period covers, or 0 if it doesn't cover whole years. */
function wholeYears(from: Day, to: Day): number {
  const after = nextDay(to);
  return after.month === from.month && after.day === from.day ? after.year - from.year : 0;
}

function dayLabel({ year, month, day }: Day): string {
  return `${day} ${monthName(month)} ${year}`;
}

/** A year starting 1 January is written 2023; one starting on any other date is 2022/23. */
function yearLabel(start: Day): string {
  return start.month === 1 && start.day === 1
    ? String(start.year)
    : `${start.year}/${String(start.year + 1).slice(-2)}`;
}

function monthsLabel(from: Day, to: Day): string {
  if (from.year !== to.year) {
    return `${monthName(from.month)} ${from.year} to ${monthName(to.month)} ${to.year}`;
  }
  return from.month === to.month
    ? `${monthName(to.month)} ${to.year}`
    : `${monthName(from.month)} to ${monthName(to.month)} ${to.year}`;
}

/**
 * Labels a period from its dates: a day, a month or several months ("January to March 2023"), a
 * year (2023, or 2022/23 if it doesn't start on 1 January), several years ("2020/21 to 2022/23"),
 * or otherwise both dates in full. A rolling year can start in any month, so one that spans two
 * calendar years is labelled by its months ("May 2022 to April 2023"); otherwise the twelve
 * rolling years starting in 2022 would all be labelled 2022/23.
 */
export function periodLabel(
  { fromDate, toDate }: Period,
  yearType?: PublicYearType | null,
): string {
  const from = dayOf(fromDate);
  const to = dayOf(toDate);

  if (fromDate === toDate) return dayLabel(from);

  const years = wholeYears(from, to);
  const calendarYears = from.month === 1 && from.day === 1;
  if (years > 0 && (calendarYears || yearType?.value !== 'rolling')) {
    const last = yearLabel({ ...from, year: from.year + years - 1 });
    return years === 1 ? last : `${yearLabel(from)} to ${last}`;
  }

  if (from.day === 1 && nextDay(to).day === 1) return monthsLabel(from, to);

  return `${dayLabel(from)} to ${dayLabel(to)}`;
}

export function shortPeriodLabel(period: Period, yearType?: PublicYearType | null): string {
  return periodLabel(period, yearType).replace(
    /^(\d+) to (\d+)$/,
    (_, from, to) => `${from}-${from.slice(0, -2) === to.slice(0, -2) ? to.slice(-2) : to}`,
  );
}
