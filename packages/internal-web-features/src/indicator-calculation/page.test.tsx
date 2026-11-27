// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { CalculationPage } from './page.tsx';

afterEach(cleanup);

const empty = { standardMethodUsed: '', methodology: '', calculatedBy: '', calculatedByDetail: '' };

const proportion = {
  name: 'Proportion',
  standardMethod: 'The numerator is divided by the denominator.',
};
const score = { name: 'Score', standardMethod: null };

const STANDARD_QUESTION = 'Was the standard calculation method used for this indicator?';
const detailsLabel = 'Enter details of the other organisation or organisations';
const organisationError = 'Enter the organisation name';

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof CalculationPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <CalculationPage {...noRefusal} values={empty} valueType={proportion} {...props} />
    </MemoryRouter>,
  );
}

function methodologyField() {
  return screen.getByLabelText('Enter methodology') as HTMLTextAreaElement;
}

function detailsField() {
  return screen.getByLabelText(detailsLabel) as HTMLTextAreaElement;
}

function option(label: string, group = 'Who calculated the indicator?') {
  return within(screen.getByRole('group', { name: group })).getByLabelText(
    label,
  ) as HTMLInputElement;
}

function otherOption() {
  return option('Other organisation or organisations');
}

function noOption() {
  return option('No', STANDARD_QUESTION);
}

/** The block a radio reveals, which holds the given field. */
function revealOf(field: HTMLElement) {
  const reveal = field.closest('.govuk-radios__conditional');
  if (reveal === null) throw new Error('the field is not in a conditional reveal');
  return reveal;
}

/** The summary list's rows, as their key and value text. */
function summaryRows() {
  return [...document.querySelectorAll('.govuk-summary-list__row')].map((row) => [
    row.querySelector('.govuk-summary-list__key')?.textContent,
    row.querySelector('.govuk-summary-list__value')?.textContent,
  ]);
}

describe('CalculationPage', () => {
  it('links to its part of the publisher guidance', () => {
    renderPage();

    expect(screen.getByRole('link', { name: RELATED_GUIDANCE_LINK }).getAttribute('href')).toBe(
      '/publish/guidance#non-standard-calculation-method',
    );
  });

  it('shows the value type and its standard calculation method under the page heading', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'How the indicator was calculated' }),
    ).toBeTruthy();
    expect(summaryRows()).toEqual([
      ['Value type', 'Proportion'],
      ['Standard calculation method', 'The numerator is divided by the denominator.'],
    ]);
  });

  it('asks whether the standard method was used, and for the methodology under No', () => {
    renderPage();

    const group = screen.getByRole('group', { name: STANDARD_QUESTION });
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[];

    expect(radios.map((radio) => [radio.name, radio.value])).toEqual([
      ['standardMethodUsed', 'yes'],
      ['standardMethodUsed', 'no'],
    ]);
    expect(methodologyField().getAttribute('name')).toBe('methodology');
    expect(methodologyField().getAttribute('rows')).toBe('5');
    expect(noOption().getAttribute('aria-controls')).toBe(revealOf(methodologyField()).id);
  });

  it('reveals the methodology when No is chosen', () => {
    renderPage();

    expect(revealOf(methodologyField()).className).toContain('govuk-radios__conditional--hidden');

    fireEvent.click(noOption());

    expect(revealOf(methodologyField()).className).not.toContain(
      'govuk-radios__conditional--hidden',
    );
  });

  it('asks for the methodology alone, as a heading, for a value type with no standard method', () => {
    renderPage({ valueType: score });

    expect(summaryRows()).toEqual([
      ['Value type', 'Score'],
      ['Standard calculation method', 'No standard method available'],
    ]);
    expect(screen.queryByRole('group', { name: STANDARD_QUESTION })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Enter methodology' })).toBeTruthy();
    expect(methodologyField().closest('.govuk-radios__conditional')).toBeNull();
  });

  it('asks nothing about the method until a value type is chosen', () => {
    renderPage({ valueType: null });

    expect(summaryRows()).toEqual([
      ['Value type', 'Not selected yet'],
      ['Standard calculation method', 'Not possible to include yet'],
    ]);
    expect(
      screen.getByText(
        'You need to select the value type for this indicator before you can complete this page.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Enter methodology')).toBeNull();
    expect(screen.queryByRole('group', { name: STANDARD_QUESTION })).toBeNull();
    expect(screen.getByRole('group', { name: 'Who calculated the indicator?' })).toBeTruthy();
  });

  it('asks who calculated the indicator', () => {
    renderPage();

    const group = screen.getByRole('group', { name: 'Who calculated the indicator?' });
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[];

    expect(radios.map((radio) => [radio.name, radio.value])).toEqual([
      ['calculatedBy', 'ohid'],
      ['calculatedBy', 'dhsc'],
      ['calculatedBy', 'other'],
    ]);
    expect(option('Office for Health Improvement and Disparities').value).toBe('ohid');
    expect(option('Department of Health and Social Care').value).toBe('dhsc');
  });

  it('heads both questions with a medium second-level heading inside their legend', () => {
    const { container } = renderPage();

    for (const name of [STANDARD_QUESTION, 'Who calculated the indicator?']) {
      const heading = screen.getByRole('heading', { level: 2, name });

      expect(heading.parentElement?.tagName).toBe('LEGEND');
      expect(heading.parentElement?.className).toContain('govuk-fieldset__legend--m');
    }
    expect(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(3);
  });

  it('asks for the other organisations inside the reveal that "Other" controls', () => {
    renderPage();

    expect(detailsField().getAttribute('name')).toBe('calculatedByDetail');
    expect(detailsField().getAttribute('rows')).toBe('3');
    expect(otherOption().getAttribute('aria-controls')).toBe(revealOf(detailsField()).id);
  });

  it('marks the reveal hidden while "Other" is not chosen, which hides it only with JavaScript', () => {
    renderPage({ values: { ...empty, calculatedBy: 'ohid' } });

    expect(revealOf(detailsField()).className).toContain('govuk-radios__conditional--hidden');
    expect(otherOption().getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({
      values: {
        standardMethodUsed: 'no',
        methodology: 'A method',
        calculatedBy: 'other',
        calculatedByDetail: 'ONS',
      },
    });

    expect(noOption().checked).toBe(true);
    expect(methodologyField().value).toBe('A method');
    expect(otherOption().checked).toBe(true);
    expect(detailsField().value).toBe('ONS');
    expect(revealOf(detailsField()).className).not.toContain('govuk-radios__conditional--hidden');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.title).toBe(`How the indicator was calculated - ${serviceName} - GOV.UK`);
  });

  it('chooses nothing while the questions are unanswered', () => {
    renderPage();

    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false,
    );
  });

  it('links each refusal to its control, in the order the form asks', () => {
    renderPage({
      fieldErrors: {
        calculatedBy: 'Select who calculated the indicator',
        standardMethodUsed:
          'Select whether the described standard method was used for this indicator',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Select whether the described standard method was used for this indicator',
      'Select who calculated the indicator',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `#${option('Yes', STANDARD_QUESTION).id}`,
      `#${option('Office for Health Improvement and Disparities').id}`,
    ]);
  });

  it('shows the methodology error inside the open reveal, linked from the summary', () => {
    renderPage({
      fieldErrors: { methodology: 'Enter the methodology' },
      values: { ...empty, standardMethodUsed: 'no' },
    });

    const link = within(screen.getByRole('alert')).getByRole('link', {
      name: 'Enter the methodology',
    });

    expect(link.getAttribute('href')).toBe(`#${methodologyField().id}`);
    expect(revealOf(methodologyField()).className).not.toContain(
      'govuk-radios__conditional--hidden',
    );
    expect(methodologyField().className).toContain('govuk-textarea--error');
  });

  it('shows the organisation error inside the open reveal, linked from the summary', () => {
    renderPage({
      fieldErrors: { calculatedByDetail: organisationError },
      values: { ...empty, calculatedBy: 'other' },
    });

    const link = within(screen.getByRole('alert')).getByRole('link', { name: organisationError });
    const error = revealOf(detailsField()).querySelector('.govuk-error-message');

    expect(link.getAttribute('href')).toBe(`#${detailsField().id}`);
    expect(error?.textContent).toContain(organisationError);
    expect(detailsField().className).toContain('govuk-textarea--error');
    expect(detailsField().getAttribute('aria-describedby')).toBe(error?.id);
  });
});
