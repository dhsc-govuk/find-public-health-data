import { z } from '@fphd/config/zod';
import { isDayOfMonth, isYearType, PERIOD_TYPES } from '@fphd/utils/period-type';

import { type IndicatorSection, isSmallNumber, textSection } from './indicator-section-contract.ts';

const fields = z.enum(['periodType', 'yearType', 'yearEndDay', 'yearEndMonth', 'publishedFrom']);

export type PeriodTypeField = z.infer<typeof fields>;

const REAL_DATE = 'Date must be a real date';

/** What is wrong with the date the year ends on, on each part the publisher should correct. */
function yearEndProblems(day: string, month: string): Partial<Record<PeriodTypeField, string>> {
  if (day === '' && month === '') {
    return { yearEndDay: 'Enter the date', yearEndMonth: 'Enter the date' };
  }
  if (day === '') return { yearEndDay: 'Date must include a day' };
  if (month === '') return { yearEndMonth: 'Date must include a month' };

  const problems = {
    ...(isSmallNumber(day, 1, 31) ? {} : { yearEndDay: REAL_DATE }),
    ...(isSmallNumber(month, 1, 12) ? {} : { yearEndMonth: REAL_DATE }),
  };

  if (Object.keys(problems).length > 0) return problems;

  return isDayOfMonth(Number(day), Number(month)) ? {} : { yearEndDay: REAL_DATE };
}

/**
 * Years and quarters ask which year they belong to, and a year ending on a specified date asks
 * for the day and month it ends, which may be any day of that month in some year, 29 February
 * included. Months ask nothing more. Answers a choice does not ask for are dropped when saved.
 */
const schema = z
  .object({
    publishedFrom: z
      .string()
      .trim()
      .pipe(
        z.union([
          z.literal(''),
          z.iso.date({ error: 'Enter a real date in the format YYYY-MM-DD' }),
        ]),
      ),
    periodType: z.enum(PERIOD_TYPES, { error: 'Select the period type' }),
    yearType: z.string(),
    yearEndDay: z.string().trim(),
    yearEndMonth: z.string().trim(),
  })
  .superRefine(({ periodType, yearType, yearEndDay, yearEndMonth }, ctx) => {
    if (periodType === 'months') return;

    if (!isYearType(yearType)) {
      ctx.addIssue({ code: 'custom', path: ['yearType'], message: 'Select the year type' });
      return;
    }

    if (yearType !== 'specified-end-date') return;

    for (const [field, message] of Object.entries(yearEndProblems(yearEndDay, yearEndMonth))) {
      ctx.addIssue({ code: 'custom', path: [field], message });
    }
  });

export type PeriodType = z.infer<typeof schema>;

export const periodTypeSection: IndicatorSection<PeriodTypeField, PeriodType> = textSection({
  key: 'period-type',
  fields,
  schema,
});
