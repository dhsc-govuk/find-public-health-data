// @vitest-environment jsdom
import type { PeriodTypeFormValues } from '@fphd/internal-api-features/contract';
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal } from '../testing.ts';
import { PeriodTypePage } from './page.tsx';

afterEach(cleanup);

const TITLE = 'Time periods';

const unanswered: PeriodTypeFormValues = {
  timePeriods: [],
  multipleYearsCount: '',
  multipleYearsYearType: '',
  multipleYearsEndDay: '',
  multipleYearsEndMonth: '',
  yearType: '',
  yearEndDay: '',
  yearEndMonth: '',
  dateRangeStartDay: '',
  dateRangeStartMonth: '',
  dateRangeEndDay: '',
  dateRangeEndMonth: '',
  periodsRolling: '',
  rollingFrequency: '',
  valuesCumulative: '',
  publishedFrom: '',
};

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof PeriodTypePage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PeriodTypePage {...noRefusal} values={unanswered} {...props} />
    </MemoryRouter>,
  );
}

function inputsNamed(name: string, type: 'radio' | 'checkbox' = 'radio') {
  return [...document.querySelectorAll<HTMLInputElement>(`input[type=${type}][name="${name}"]`)];
}

function labelsOf(inputs: HTMLInputElement[]) {
  return inputs.map((input) => input.labels?.[0]?.textContent);
}

function controlValue(name: string): string | undefined {
  return (document.getElementsByName(name)[0] as HTMLInputElement | undefined)?.value;
}

const YEAR_TYPES = [
  'Calendar (1 January to 31 December)',
  'Financial (1 April to 31 March)',
  'Academic (1 September to 31 August)',
  'Ending a specified date',
];

describe('PeriodTypePage', () => {
  it('titles the page and offers each kind of time period as a checkbox', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
    expect(
      screen.getByRole('group', { name: 'Select all time periods used in this indicator' }),
    ).toBeTruthy();
    expect(labelsOf(inputsNamed('timePeriods', 'checkbox'))).toEqual([
      'Periods of more than 1 year',
      'Single years',
      'Quarters',
      'Months',
      'Specific date range',
    ]);
  });

  it('asks periods of more than 1 year and single years each for a year type of their own', () => {
    renderPage();

    expect(screen.getByRole('textbox', { name: 'Enter number of years' })).toBeTruthy();
    expect(labelsOf(inputsNamed('multipleYearsYearType'))).toEqual(YEAR_TYPES);
    expect(labelsOf(inputsNamed('yearType'))).toEqual(YEAR_TYPES);
    expect(screen.getAllByRole('group', { name: 'Select year type' })).toHaveLength(2);
    expect(document.getElementsByName('multipleYearsEnd[day]')).toHaveLength(1);
    expect(document.getElementsByName('yearEnd[month]')).toHaveLength(1);
  });

  it('asks a specific date range for the day and month it starts and ends on, with no year', () => {
    renderPage();

    for (const name of ['Start date', 'End date']) {
      const group = screen.getByRole('group', { name });
      expect(
        within(group)
          .getAllByRole('textbox')
          .map((input) => input.getAttribute('name')),
      ).toHaveLength(2);
    }
    expect(document.getElementsByName('dateRangeStart[day]')).toHaveLength(1);
    expect(document.getElementsByName('dateRangeEnd[month]')).toHaveLength(1);
    expect(document.getElementsByName('dateRangeEnd[year]')).toHaveLength(0);
  });

  it('asks whether time periods roll, with their frequency under Yes, and whether values add up', () => {
    renderPage();

    expect(labelsOf(inputsNamed('periodsRolling'))).toEqual(['Yes', 'No']);
    expect(labelsOf(inputsNamed('rollingFrequency'))).toEqual(['Years', 'Quarters', 'Months']);
    expect(
      screen.getByRole('group', { name: 'Are values cumulative across time periods?' }),
    ).toBeTruthy();
    expect(labelsOf(inputsNamed('valuesCumulative'))).toEqual(['Yes', 'No']);
  });

  it("shows the draft's answers", () => {
    renderPage({
      values: {
        ...unanswered,
        timePeriods: ['multiple-years', 'date-range'],
        multipleYearsCount: '3',
        multipleYearsYearType: 'specified-end-date',
        multipleYearsEndDay: '31',
        multipleYearsEndMonth: '7',
        dateRangeStartDay: '1',
        dateRangeStartMonth: '10',
        dateRangeEndDay: '31',
        dateRangeEndMonth: '3',
        periodsRolling: 'yes',
        rollingFrequency: 'years',
        valuesCumulative: 'no',
      },
    });

    const checked = (inputs: HTMLInputElement[]) => inputs.filter(({ checked }) => checked);

    expect(labelsOf(checked(inputsNamed('timePeriods', 'checkbox')))).toEqual([
      'Periods of more than 1 year',
      'Specific date range',
    ]);
    expect(controlValue('multipleYearsCount')).toBe('3');
    expect(labelsOf(checked(inputsNamed('multipleYearsYearType')))).toEqual([
      'Ending a specified date',
    ]);
    expect(controlValue('multipleYearsEnd[day]')).toBe('31');
    expect(checked(inputsNamed('yearType'))).toEqual([]);
    expect(controlValue('dateRangeStart[month]')).toBe('10');
    expect(controlValue('dateRangeEnd[day]')).toBe('31');
    expect(labelsOf(checked(inputsNamed('rollingFrequency')))).toEqual(['Years']);
    expect(labelsOf(checked(inputsNamed('valuesCumulative')))).toEqual(['No']);
  });

  // The date is given a message for each part, both missing while nothing is wrong. An absent
  // message must not read as an empty one and mark the date as refused.
  it('marks nothing on the dates while no part of them is refused', () => {
    renderPage({ values: { ...unanswered, timePeriods: ['date-range'] } });

    expect(document.querySelectorAll('.govuk-input--error')).toHaveLength(0);
    expect(document.querySelectorAll('.govuk-error-message')).toHaveLength(0);
  });

  it.each([
    [
      'timePeriods',
      'Select the time periods included in this indicator',
      '#timePeriods-checkbox-0',
    ],
    ['multipleYearsCount', 'Enter the number of years', '#multipleYearsCount-input'],
    ['multipleYearsYearType', 'Select the year type', '#multipleYearsYearType-radio-0'],
    ['yearEndMonth', 'Date must include a month', '#yearEnd-month'],
    ['dateRangeStartDay', 'Enter the start date', '#dateRangeStart-day'],
    ['rollingFrequency', 'Select the rolling frequency', '#rollingFrequency-radio-0'],
    [
      'valuesCumulative',
      'Select whether values are cumulative across time periods',
      '#valuesCumulative-radio-0',
    ],
  ] as const)('links a refusal of %s to its control', (field, message, href) => {
    renderPage({ fieldErrors: { [field]: message } });

    expect(within(screen.getByRole('alert')).getByRole('link').getAttribute('href')).toBe(href);
  });
});

it('edits the optional publication start date and links its validation error', () => {
  renderPage({
    values: { ...unanswered, publishedFrom: '2024-02-29' },
    fieldErrors: { publishedFrom: 'Enter a real date in the format YYYY-MM-DD' },
  });
  const input = screen.getByRole('textbox', {
    name: 'Show data from (optional)',
  }) as HTMLInputElement;
  expect(input.value).toBe('2024-02-29');
  expect(input.name).toBe('publishedFrom');
  expect(screen.getByText(/Leave blank to show all periods/)).toBeTruthy();
  expect(within(screen.getByRole('alert')).getByRole('link').getAttribute('href')).toBe(
    `#${input.id}`,
  );
});
