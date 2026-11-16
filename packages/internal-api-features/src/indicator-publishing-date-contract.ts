import { z } from '@fphd/config/zod';
import { isDayOfMonth } from '@fphd/utils/period-type';
import { ukDateTime } from '@fphd/utils/uk-time';

import {
  type DetailedQuestion,
  type IndicatorSection,
  isSmallNumber,
  requireDetails,
  textSection,
} from './indicator-section-contract.ts';
import { longText } from './text-contract.ts';

/** The date and time, which the publisher's page and the admin's confirmation both ask. */
export const publishingDateTimeFields = z.enum([
  'publishingDateDay',
  'publishingDateMonth',
  'publishingDateYear',
  'publishingTimeHour',
  'publishingTimeMinute',
]);

export type PublishingDateTimeField = z.infer<typeof publishingDateTimeFields>;

// The publisher's page asks whether the indicator needs to be fast-tracked between the date and
// the time.
const fields = z.enum([
  'publishingDateDay',
  'publishingDateMonth',
  'publishingDateYear',
  'fastTracked',
  'fastTrackReason',
  'publishingTimeHour',
  'publishingTimeMinute',
]);

export type PublishingDateField = z.infer<typeof fields>;

/** The time the form offers until the publisher answers: 09:30 UK time. */
export const DEFAULT_PUBLISHING_TIME = {
  publishingTimeHour: '09',
  publishingTimeMinute: '30',
} as const;

type Answers = Record<PublishingDateTimeField, string>;
type Problems = Partial<Answers>;

const DATE_PARTS = [
  ['publishingDateDay', 'day'],
  ['publishingDateMonth', 'month'],
  ['publishingDateYear', 'year'],
] as const;

/** The date's fields, which a message about the whole date is given on. */
export const PUBLISHING_DATE_FIELDS: readonly PublishingDateTimeField[] = DATE_PARTS.map(
  ([field]) => field,
);

const TIME_PARTS = [
  ['publishingTimeHour', 'an hour'],
  ['publishingTimeMinute', 'a minute'],
] as const;

/**
 * How many weeks after today's date in the UK a publishing date must be, at least, unless the
 * indicator is fast-tracked. The notice gives IMRG time to review the indicator.
 */
export const PUBLISHING_NOTICE_WEEKS = 8;

/** The notice in days, which the API counts as whole UK calendar days. */
export const PUBLISHING_NOTICE_DAYS = PUBLISHING_NOTICE_WEEKS * 7;

// Given when a fast-tracked date, or a date the admin confirms, has already passed.
export const FUTURE_PUBLISHING_DATE = 'Publishing date and time must be in the future';

const REAL_DATE = 'Publishing date must be a real date';
// Also given by the API for a time the spring clock change skips.
export const REAL_PUBLISHING_TIME = 'Publishing time must be a real time';

const listWithAnd = new Intl.ListFormat('en-GB', { type: 'conjunction' });

/** Gives `message` on each of `fields`, as a check after the form's schema refuses them. */
export function addIssues(
  ctx: z.RefinementCtx,
  fields: readonly PublishingDateField[],
  message: string,
): void {
  for (const field of fields) ctx.addIssue({ code: 'custom', path: [field], message });
}

/** The date and time an instant falls on in the UK, as the form shows them. */
export function publishingDateValues(instant: Date): Answers {
  const { year, month, day, hour, minute } = ukDateTime(instant);
  const twoDigits = (value: number) => String(value).padStart(2, '0');

  // Day and month as the hint's example gives them; hour and minute as the clock shows them.
  return {
    publishingDateDay: String(day),
    publishingDateMonth: String(month),
    publishingDateYear: String(year),
    publishingTimeHour: twoDigits(hour),
    publishingTimeMinute: twoDigits(minute),
  };
}

function each(parts: readonly PublishingDateTimeField[], message: string): Problems {
  return Object.fromEntries(parts.map((part) => [part, message]));
}

function unless(ok: boolean, field: PublishingDateTimeField, message: string): Problems {
  return ok ? {} : { [field]: message };
}

/** What is wrong with the date, on each part the publisher should correct. */
function dateProblems(answers: Answers): Problems {
  const missing = DATE_PARTS.filter(([field]) => answers[field] === '');

  if (missing.length === DATE_PARTS.length) {
    return each(
      DATE_PARTS.map(([field]) => field),
      'Enter the publishing date',
    );
  }

  if (missing.length > 0) {
    const parts = listWithAnd.format(missing.map(([, part]) => part));
    return each(
      missing.map(([field]) => field),
      `Publishing date must include a ${parts}`,
    );
  }

  const { publishingDateDay: day, publishingDateMonth: month, publishingDateYear: year } = answers;
  const problems = {
    ...unless(isSmallNumber(day, 1, 31), 'publishingDateDay', REAL_DATE),
    ...unless(isSmallNumber(month, 1, 12), 'publishingDateMonth', REAL_DATE),
    ...unless(/^\d{4}$/.test(year), 'publishingDateYear', 'Year must include 4 numbers'),
  };

  if (Object.keys(problems).length > 0) return problems;

  // A year below 1000 is not a four-digit year, and the database refuses year 0 outright.
  if (Number(year) < 1000) return { publishingDateYear: REAL_DATE };

  return unless(
    isDayOfMonth(Number(day), Number(month), Number(year)),
    'publishingDateDay',
    REAL_DATE,
  );
}

/** What is wrong with the time, on each part the publisher should correct. */
function timeProblems(answers: Answers): Problems {
  const missing = TIME_PARTS.filter(([field]) => answers[field] === '');

  if (missing.length === TIME_PARTS.length) {
    return each(
      TIME_PARTS.map(([field]) => field),
      'Enter the publishing time',
    );
  }

  if (missing.length > 0) {
    return Object.fromEntries(
      missing.map(([field, part]) => [field, `Publishing time must include ${part}`]),
    );
  }

  return {
    ...unless(
      isSmallNumber(answers.publishingTimeHour, 0, 23),
      'publishingTimeHour',
      REAL_PUBLISHING_TIME,
    ),
    ...unless(
      isSmallNumber(answers.publishingTimeMinute, 0, 59),
      'publishingTimeMinute',
      REAL_PUBLISHING_TIME,
    ),
  };
}

const dateTimeShape = {
  publishingDateDay: z.string().trim(),
  publishingDateMonth: z.string().trim(),
  publishingDateYear: z.string().trim(),
  publishingTimeHour: z.string().trim(),
  publishingTimeMinute: z.string().trim(),
};

/** Gives each message about the date and time on the part it names. */
function addDateTimeIssues(answers: Answers, ctx: z.RefinementCtx): void {
  const problems = { ...dateProblems(answers), ...timeProblems(answers) };

  for (const [field, message] of Object.entries(problems)) {
    ctx.addIssue({ code: 'custom', path: [field], message });
  }
}

/**
 * A real date and a real 24-hour time, in UK local time. A message about the whole date or
 * time is given on each of its parts, so the page marks every part to correct.
 */
export const publishingDateTimeSchema = z.object(dateTimeShape).superRefine(addDateTimeIssues);

/** The reason a fast-tracked indicator needs, which the checkbox reveals. */
const FAST_TRACK_REASON = [
  {
    answer: 'fastTracked',
    detail: 'fastTrackReason',
    detailRequired: 'Enter the reason for fast-tracking',
  },
] as const satisfies readonly DetailedQuestion<'fastTracked', 'fastTrackReason'>[];

/**
 * The date and time, and whether the indicator is fast-tracked, with the reason why. The
 * checkbox sends "yes" when it is ticked and nothing otherwise.
 */
const schema = requireDetails(
  z.object({
    ...dateTimeShape,
    fastTracked: z.enum(['', 'yes']),
    fastTrackReason: longText('Reason for fast-tracking'),
  }),
  FAST_TRACK_REASON,
).superRefine(addDateTimeIssues);

export type PublishingDate = z.infer<typeof schema>;

export const publishingDateSection: IndicatorSection<PublishingDateField, PublishingDate> =
  textSection({ key: 'publishing-date', fields, schema });
