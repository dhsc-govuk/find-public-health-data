import { z } from '@fphd/config/zod';
import {
  isDayOfMonth,
  isYearType,
  ROLLING_FREQUENCIES,
  TIME_PERIODS,
  type TimePeriod,
} from '@fphd/utils/period-type';

import { type IndicatorSection, isSmallNumber, yesNoSchema } from './indicator-section-contract.ts';

const fields = z.enum([
  'timePeriods',
  'multipleYearsCount',
  'multipleYearsYearType',
  'multipleYearsEndDay',
  'multipleYearsEndMonth',
  'yearType',
  'yearEndDay',
  'yearEndMonth',
  'dateRangeStartDay',
  'dateRangeStartMonth',
  'dateRangeEndDay',
  'dateRangeEndMonth',
  'periodsRolling',
  'rollingFrequency',
  'valuesCumulative',
  'publishedFrom',
]);

export type PeriodTypeField = z.infer<typeof fields>;

/** The fields answered as text; the kinds of time period are the boxes ticked. */
type PeriodTypeTextField = Exclude<PeriodTypeField, 'timePeriods'>;

/** The answers as the form holds them: the kinds of time period ticked, and the rest as text. */
export type PeriodTypeFormValues = Record<PeriodTypeTextField, string> & {
  timePeriods: string[];
};

/** The fields answered as text, in the order the page asks them. */
const TEXT_FIELDS = fields.options.filter(
  (field): field is PeriodTypeTextField => field !== 'timePeriods',
);

const nullableText = z.string().nullable();

/** The draft's answers: no kinds of time period, and every other field null, until answered. */
export const periodTypeAnswersSchema = z.object({
  timePeriods: z.array(z.enum(TIME_PERIODS)),
  multipleYearsCount: nullableText,
  multipleYearsYearType: nullableText,
  multipleYearsEndDay: nullableText,
  multipleYearsEndMonth: nullableText,
  yearType: nullableText,
  yearEndDay: nullableText,
  yearEndMonth: nullableText,
  dateRangeStartDay: nullableText,
  dateRangeStartMonth: nullableText,
  dateRangeEndDay: nullableText,
  dateRangeEndMonth: nullableText,
  periodsRolling: nullableText,
  rollingFrequency: nullableText,
  valuesCumulative: nullableText,
  publishedFrom: nullableText,
}) satisfies z.ZodType<Record<PeriodTypeTextField, string | null> & { timePeriods: TimePeriod[] }>;

export type PeriodTypeAnswers = z.infer<typeof periodTypeAnswersSchema>;

const SELECT_TIME_PERIODS = 'Select the time periods included in this indicator';
const REAL_DATE = 'Date must be a real date';

/** The fields of a day and month, with the message for both being blank. */
interface DayAndMonth {
  day: PeriodTypeTextField;
  month: PeriodTypeTextField;
  missing: string;
}

const MULTIPLE_YEARS_END: DayAndMonth = {
  day: 'multipleYearsEndDay',
  month: 'multipleYearsEndMonth',
  missing: 'Enter the date',
};

const YEAR_END: DayAndMonth = {
  day: 'yearEndDay',
  month: 'yearEndMonth',
  missing: 'Enter the date',
};

const DATE_RANGE_START: DayAndMonth = {
  day: 'dateRangeStartDay',
  month: 'dateRangeStartMonth',
  missing: 'Enter the start date',
};

const DATE_RANGE_END: DayAndMonth = {
  day: 'dateRangeEndDay',
  month: 'dateRangeEndMonth',
  missing: 'Enter the end date',
};

/**
 * What is wrong with a day and month, on each part the publisher should correct. The date may
 * be any day of that month in some year, 29 February included.
 */
function dayAndMonthProblems(
  { day: dayField, month: monthField, missing }: DayAndMonth,
  day: string,
  month: string,
): Partial<Record<PeriodTypeTextField, string>> {
  if (day === '' && month === '') return { [dayField]: missing, [monthField]: missing };
  if (day === '') return { [dayField]: 'Date must include a day' };
  if (month === '') return { [monthField]: 'Date must include a month' };

  const problems = {
    ...(isSmallNumber(day, 1, 31) ? {} : { [dayField]: REAL_DATE }),
    ...(isSmallNumber(month, 1, 12) ? {} : { [monthField]: REAL_DATE }),
  };

  if (Object.keys(problems).length > 0) return problems;

  return isDayOfMonth(Number(day), Number(month)) ? {} : { [dayField]: REAL_DATE };
}

/** What is wrong with the number of years in periods of more than 1 year. */
function multipleYearsCountProblem(count: string): string | undefined {
  if (count === '') return 'Enter the number of years';
  if (!/^\d{1,2}$/.test(count)) return 'Number of years must be 1 or 2 digits';
  return Number(count) < 2 ? 'Number of years must be 2 or more' : undefined;
}

/** What is wrong with a year type and the date a year of it ends on, where it asks for one. */
function yearTypeProblems(
  yearType: string,
  yearTypeField: PeriodTypeTextField,
  end: DayAndMonth,
  day: string,
  month: string,
): Partial<Record<PeriodTypeTextField, string>> {
  if (!isYearType(yearType)) return { [yearTypeField]: 'Select the year type' };
  return yearType === 'specified-end-date' ? dayAndMonthProblems(end, day, month) : {};
}

/** The boxes ticked in the order the page lists them, once each, whatever order they came in. */
function inPageOrder(sent: readonly TimePeriod[]): TimePeriod[] {
  return TIME_PERIODS.filter((period) => sent.includes(period));
}

const text = z.string().trim();

/**
 * The kinds of time period used, each asking its own questions: periods of more than 1 year ask
 * how many years and their year type, single years their year type, and a specific date range
 * the day and month it starts and ends on. A year type ending on a specified date asks for that
 * day and month. Quarters and months ask nothing more. Rolling time periods ask how often they
 * roll. Answers a choice does not ask for are dropped when saved.
 */
const schema = z
  .object({
    timePeriods: z
      .array(z.enum(TIME_PERIODS, { error: SELECT_TIME_PERIODS }), { error: SELECT_TIME_PERIODS })
      .min(1, SELECT_TIME_PERIODS)
      .transform(inPageOrder),
    multipleYearsCount: text,
    multipleYearsYearType: z.string(),
    multipleYearsEndDay: text,
    multipleYearsEndMonth: text,
    yearType: z.string(),
    yearEndDay: text,
    yearEndMonth: text,
    dateRangeStartDay: text,
    dateRangeStartMonth: text,
    dateRangeEndDay: text,
    dateRangeEndMonth: text,
    periodsRolling: yesNoSchema('Select whether time periods are rolling'),
    rollingFrequency: z.string(),
    valuesCumulative: yesNoSchema('Select whether values are cumulative across time periods'),
    publishedFrom: text.pipe(
      z.union([z.literal(''), z.iso.date({ error: 'Enter a real date in the format YYYY-MM-DD' })]),
    ),
  })
  .superRefine(
    (answers, ctx) => {
      // A field that is itself refused, such as one not sent at all, is read as blank.
      const textOf = (field: PeriodTypeTextField): string => {
        const value: unknown = answers[field];
        return typeof value === 'string' ? value : '';
      };
      const ticked: readonly unknown[] = Array.isArray(answers.timePeriods)
        ? answers.timePeriods
        : [];
      const count = multipleYearsCountProblem(textOf('multipleYearsCount'));
      const problems: Partial<Record<PeriodTypeTextField, string>> = {
        ...(ticked.includes('multiple-years')
          ? {
              ...(count === undefined ? {} : { multipleYearsCount: count }),
              ...yearTypeProblems(
                textOf('multipleYearsYearType'),
                'multipleYearsYearType',
                MULTIPLE_YEARS_END,
                textOf('multipleYearsEndDay'),
                textOf('multipleYearsEndMonth'),
              ),
            }
          : {}),
        ...(ticked.includes('single-years')
          ? yearTypeProblems(
              textOf('yearType'),
              'yearType',
              YEAR_END,
              textOf('yearEndDay'),
              textOf('yearEndMonth'),
            )
          : {}),
        ...(ticked.includes('date-range')
          ? {
              ...dayAndMonthProblems(
                DATE_RANGE_START,
                textOf('dateRangeStartDay'),
                textOf('dateRangeStartMonth'),
              ),
              ...dayAndMonthProblems(
                DATE_RANGE_END,
                textOf('dateRangeEndDay'),
                textOf('dateRangeEndMonth'),
              ),
            }
          : {}),
        ...(answers.periodsRolling === 'yes' &&
        !ROLLING_FREQUENCIES.some((frequency) => frequency === textOf('rollingFrequency'))
          ? { rollingFrequency: 'Select the rolling frequency' }
          : {}),
      };

      for (const [field, message] of Object.entries(problems)) {
        ctx.addIssue({ code: 'custom', path: [field], message });
      }
    },
    // Also beside every other refusal, so they all show at once. An issue with no path refuses
    // the whole input, which then has nothing to read.
    { when: ({ issues }) => issues.every(({ path }) => path?.[0] !== undefined) },
  );

export type PeriodType = z.infer<typeof schema>;

export const periodTypeSection: IndicatorSection<
  PeriodTypeField,
  PeriodType,
  PeriodTypeFormValues,
  PeriodTypeField,
  PeriodTypeAnswers
> = {
  key: 'period-type',
  fields,
  schema,
  formValues: (answers) => ({
    timePeriods: answers.timePeriods,
    ...(Object.fromEntries(TEXT_FIELDS.map((field) => [field, answers[field] ?? ''])) as Record<
      PeriodTypeTextField,
      string
    >),
  }),
};
