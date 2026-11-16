import { TZDate } from '@date-fns/tz';
import { addHours, differenceInCalendarDays } from 'date-fns';

const UK_TIME_ZONE = 'Europe/London';

/** A date and time on the UK's clocks, GMT or BST as the date has it; the month counts from 1. */
export interface UkDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export type UkDate = Pick<UkDateTime, 'year' | 'month' | 'day'>;

const PARTS = ['year', 'month', 'day', 'hour', 'minute'] as const;

function inUk(instant: Date): TZDate {
  return new TZDate(instant, UK_TIME_ZONE);
}

/** The UK date and time `instant` falls on. */
export function ukDateTime(instant: Date): UkDateTime {
  const uk = inUk(instant);

  return {
    year: uk.getFullYear(),
    month: uk.getMonth() + 1,
    day: uk.getDate(),
    hour: uk.getHours(),
    minute: uk.getMinutes(),
  };
}

/**
 * The instant a UK date and time names, or null where the clocks never show it, as for a time
 * the spring change skips. A time the autumn change repeats is its second, GMT, occurrence.
 */
export function ukInstant(dateTime: UkDateTime): Date | null {
  const { year, month, day, hour, minute } = dateTime;
  // TZDate takes the first, BST, occurrence of a repeated time and moves a skipped one on.
  const first = new TZDate(year, month - 1, day, hour, minute, UK_TIME_ZONE);
  const instant = [addHours(first, 1), first].find((candidate) => {
    const shown = ukDateTime(candidate);
    return PARTS.every((part) => shown[part] === dateTime[part]);
  });

  return instant === undefined ? null : new Date(instant.getTime());
}

/** Calendar days from the UK date `instant` falls on until `date`, negative for one before. */
export function ukDaysUntil(instant: Date, { year, month, day }: UkDate): number {
  return differenceInCalendarDays(new TZDate(year, month - 1, day, UK_TIME_ZONE), inUk(instant));
}
