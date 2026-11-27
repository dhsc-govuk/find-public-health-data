import type { PeriodTypeFormValues } from '@fphd/internal-api-features/contract';

/** The name a date input called `name` posts a part under, as `datePartName` in `@fphd/ui` writes it. */
function datePart(name: string, part: 'day' | 'month'): string {
  return `${name}[${part}]`;
}

/** The control's answer as typed; one the browser did not send, such as an unchosen radio, is empty. */
function typed(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * The kinds of time period ticked, and each other answer as typed. Without JavaScript every
 * reveal shows, so each year type and date has a control of its own.
 */
export function readPeriodTypeForm(formData: FormData): PeriodTypeFormValues {
  return {
    timePeriods: formData.getAll('timePeriods').filter((value) => typeof value === 'string'),
    multipleYearsCount: typed(formData, 'multipleYearsCount'),
    multipleYearsYearType: typed(formData, 'multipleYearsYearType'),
    multipleYearsEndDay: typed(formData, datePart('multipleYearsEnd', 'day')),
    multipleYearsEndMonth: typed(formData, datePart('multipleYearsEnd', 'month')),
    yearType: typed(formData, 'yearType'),
    yearEndDay: typed(formData, datePart('yearEnd', 'day')),
    yearEndMonth: typed(formData, datePart('yearEnd', 'month')),
    dateRangeStartDay: typed(formData, datePart('dateRangeStart', 'day')),
    dateRangeStartMonth: typed(formData, datePart('dateRangeStart', 'month')),
    dateRangeEndDay: typed(formData, datePart('dateRangeEnd', 'day')),
    dateRangeEndMonth: typed(formData, datePart('dateRangeEnd', 'month')),
    periodsRolling: typed(formData, 'periodsRolling'),
    rollingFrequency: typed(formData, 'rollingFrequency'),
    valuesCumulative: typed(formData, 'valuesCumulative'),
    publishedFrom: typed(formData, 'publishedFrom'),
  };
}
