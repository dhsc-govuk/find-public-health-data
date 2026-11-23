// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal } from '../testing.ts';
import { PeriodTypePage, periodTypeControlNames } from './page.tsx';

afterEach(cleanup);

const TITLE = 'What is the period type in this indicator?';

const unanswered = {
  periodType: '',
  yearType: '',
  yearEndDay: '',
  yearEndMonth: '',
  publishedFrom: '',
};

const quartersEndingOn = {
  publishedFrom: '',
  periodType: 'quarters',
  yearType: 'specified-end-date',
  yearEndDay: '30',
  yearEndMonth: '9',
};

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof PeriodTypePage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PeriodTypePage {...noRefusal} values={unanswered} {...props} />
    </MemoryRouter>,
  );
}

function radiosNamed(name: string) {
  return [...document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${name}"]`)];
}

function labelsOf(radios: HTMLInputElement[]) {
  return radios.map((radio) => radio.labels?.[0]?.textContent);
}

describe('PeriodTypePage', () => {
  it('titles the page with the question and names the period type options', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Select period type' })).toBeTruthy();
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
    expect(labelsOf(radiosNamed('periodType'))).toEqual(['Years', 'Quarters', 'Months']);
    expect(radiosNamed('periodType').map(({ value }) => value)).toEqual([
      'years',
      'quarters',
      'months',
    ]);
  });

  it('asks the year type under both years and quarters, each under names of its own', () => {
    renderPage();

    const yearTypes = ['Calendar', 'Financial', 'Academic', 'Rolling', 'Ending a specified date'];

    expect(labelsOf(radiosNamed('yearsYearType'))).toEqual(yearTypes);
    expect(labelsOf(radiosNamed('quartersYearType'))).toEqual(yearTypes);
    expect(screen.getAllByRole('group', { name: 'Select year type' })).toHaveLength(2);
    expect(document.getElementsByName('yearsYearEnd[day]')).toHaveLength(1);
    expect(document.getElementsByName('quartersYearEnd[month]')).toHaveLength(1);
  });

  it('shows the answers under the chosen period type only', () => {
    renderPage({ values: quartersEndingOn });

    const [years, quarters] = screen.getAllByRole('group', { name: 'Select year type' });
    const checked = (group: HTMLElement | undefined) =>
      within(group as HTMLElement)
        .getAllByRole('radio')
        .filter((radio) => (radio as HTMLInputElement).checked);

    expect(checked(years)).toEqual([]);
    expect(labelsOf(checked(quarters) as HTMLInputElement[])).toEqual(['Ending a specified date']);
    expect((document.getElementsByName('quartersYearEnd[day]')[0] as HTMLInputElement).value).toBe(
      '30',
    );
    expect((document.getElementsByName('yearsYearEnd[day]')[0] as HTMLInputElement).value).toBe('');
  });

  // The date is given a message for each part, both missing while nothing is wrong. An absent
  // message must not read as an empty one and mark the date as refused.
  it('marks nothing on the date while no part of it is refused', () => {
    renderPage({ values: quartersEndingOn });

    expect(document.querySelectorAll('.govuk-input--error')).toHaveLength(0);
    expect(document.querySelectorAll('.govuk-error-message')).toHaveLength(0);
  });

  it('links each refusal to the control under the chosen period type', () => {
    renderPage({
      values: quartersEndingOn,
      fieldErrors: { yearEndDay: 'Date must be a real date' },
    });

    const link = within(screen.getByRole('alert')).getByRole('link');

    expect(link.getAttribute('href')).toBe('#quartersYearEnd-day');
    expect(document.querySelectorAll('.govuk-input--error')).toHaveLength(1);
  });

  it('links a missing year type to the first year type under the chosen period type', () => {
    renderPage({
      values: { ...unanswered, periodType: 'years' },
      fieldErrors: { yearType: 'Select the year type' },
    });

    expect(within(screen.getByRole('alert')).getByRole('link').getAttribute('href')).toBe(
      '#yearsYearType-radio-0',
    );
  });
});

describe('periodTypeControlNames', () => {
  function formData(entries: Record<string, string>) {
    const data = new FormData();
    for (const [name, value] of Object.entries(entries)) data.set(name, value);
    return data;
  }

  it.each([
    ['years', 'years'],
    ['quarters', 'quarters'],
  ])('reads the year type from the controls under %s', (set, periodType) => {
    expect(periodTypeControlNames(formData({ periodType }))).toEqual({
      yearType: `${set}YearType`,
      yearEndDay: `${set}YearEnd[day]`,
      yearEndMonth: `${set}YearEnd[month]`,
    });
  });

  it.each([
    ['months', 'months'],
    ['no period type', ''],
  ])('reads no year type for %s', (_, periodType) => {
    expect(periodTypeControlNames(formData({ periodType }))).toEqual({});
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
