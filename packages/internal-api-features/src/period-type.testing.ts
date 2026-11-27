import type { PeriodType } from './indicator-period-type-contract.ts';

/**
 * Time periods answers the section accepts: single calendar years that neither roll nor add up,
 * unless `answers` say otherwise.
 */
export function periodTypeAnswers(answers: Partial<PeriodType> = {}): PeriodType {
  return {
    timePeriods: ['single-years'],
    multipleYearsCount: '',
    multipleYearsYearType: '',
    multipleYearsEndDay: '',
    multipleYearsEndMonth: '',
    yearType: 'calendar',
    yearEndDay: '',
    yearEndMonth: '',
    dateRangeStartDay: '',
    dateRangeStartMonth: '',
    dateRangeEndDay: '',
    dateRangeEndMonth: '',
    periodsRolling: 'no',
    rollingFrequency: '',
    valuesCumulative: 'no',
    publishedFrom: '',
    ...answers,
  };
}
