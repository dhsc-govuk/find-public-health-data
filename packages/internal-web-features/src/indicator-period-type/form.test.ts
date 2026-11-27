import { describe, expect, it } from 'vitest';

import { readPeriodTypeForm } from './form.ts';

function formData(fields: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of fields) data.append(name, value);
  return data;
}

describe('readPeriodTypeForm', () => {
  it('reads every box ticked, and each date from its own day and month controls', () => {
    expect(
      readPeriodTypeForm(
        formData([
          ['timePeriods', 'multiple-years'],
          ['timePeriods', 'single-years'],
          ['multipleYearsCount', '3'],
          ['multipleYearsYearType', 'specified-end-date'],
          ['multipleYearsEnd[day]', '31'],
          ['multipleYearsEnd[month]', '7'],
          ['yearType', 'specified-end-date'],
          ['yearEnd[day]', '30'],
          ['yearEnd[month]', '6'],
          ['dateRangeStart[day]', '1'],
          ['dateRangeStart[month]', '10'],
          ['dateRangeEnd[day]', '31'],
          ['dateRangeEnd[month]', '3'],
          ['periodsRolling', 'yes'],
          ['rollingFrequency', 'years'],
          ['valuesCumulative', 'no'],
          ['publishedFrom', '2020-04-01'],
        ]),
      ),
    ).toEqual({
      timePeriods: ['multiple-years', 'single-years'],
      multipleYearsCount: '3',
      multipleYearsYearType: 'specified-end-date',
      multipleYearsEndDay: '31',
      multipleYearsEndMonth: '7',
      yearType: 'specified-end-date',
      yearEndDay: '30',
      yearEndMonth: '6',
      dateRangeStartDay: '1',
      dateRangeStartMonth: '10',
      dateRangeEndDay: '31',
      dateRangeEndMonth: '3',
      periodsRolling: 'yes',
      rollingFrequency: 'years',
      valuesCumulative: 'no',
      publishedFrom: '2020-04-01',
    });
  });

  it('reads controls the browser did not send as empty', () => {
    expect(readPeriodTypeForm(new FormData())).toMatchObject({
      timePeriods: [],
      yearType: '',
      periodsRolling: '',
    });
  });
});
