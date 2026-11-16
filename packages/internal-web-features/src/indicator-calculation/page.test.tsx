// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { CalculationPage } from './page.tsx';

afterEach(cleanup);

const empty = { methodology: '', calculatedBy: '', calculatedByDetail: '' };

const detailsError = 'Enter details of the other organisation or organisations';

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof CalculationPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <CalculationPage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function methodologyField() {
  return screen.getByLabelText('Enter methodology') as HTMLTextAreaElement;
}

function detailsField() {
  return screen.getByLabelText(
    'Enter details of the other organisation or organisations',
  ) as HTMLTextAreaElement;
}

function option(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function otherOption() {
  return option('Other organisation or organisations');
}

/** The block the "Other" radio reveals, which holds the details field. */
function conditional() {
  const reveal = detailsField().closest('.govuk-radios__conditional');
  if (reveal === null) throw new Error('the details field is not in a conditional reveal');
  return reveal;
}

describe('CalculationPage', () => {
  it('links to its part of the publisher guidance', () => {
    renderPage();

    expect(screen.getByRole('link', { name: RELATED_GUIDANCE_LINK }).getAttribute('href')).toBe(
      '/publish/guidance#non-standard-calculation-method',
    );
  });

  it('asks for the methodology and who calculated the indicator under the page heading', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'How was the indicator calculated?' }),
    ).toBeTruthy();
    expect(methodologyField().getAttribute('name')).toBe('methodology');
    expect(methodologyField().getAttribute('rows')).toBe('5');

    const group = screen.getByRole('group', { name: 'Who calculated the indicator?' });
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[];

    expect(radios.map((radio) => [radio.name, radio.value])).toEqual([
      ['calculatedBy', 'ohid'],
      ['calculatedBy', 'dhsc'],
      ['calculatedBy', 'other'],
    ]);
    expect(option('Office for Health Improvement and Disparities').value).toBe('ohid');
    expect(option('Department of Health and Social Care').value).toBe('dhsc');
    expect(otherOption().value).toBe('other');
  });

  it('heads the radios with a medium second-level heading inside their legend', () => {
    const { container } = renderPage();

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Who calculated the indicator?',
    });

    expect(heading.parentElement?.tagName).toBe('LEGEND');
    expect(heading.parentElement?.className).toContain('govuk-fieldset__legend--m');
    expect(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(3);
  });

  it('asks for the other organisations inside the reveal that "Other" controls', () => {
    renderPage();

    expect(detailsField().getAttribute('name')).toBe('calculatedByDetail');
    expect(detailsField().getAttribute('rows')).toBe('3');
    expect(otherOption().getAttribute('aria-controls')).toBe(conditional().id);
  });

  it('marks the reveal hidden while "Other" is not chosen, which hides it only with JavaScript', () => {
    renderPage({ values: { ...empty, calculatedBy: 'ohid' } });

    expect(conditional().className).toContain('govuk-radios__conditional--hidden');
    expect(otherOption().getAttribute('aria-expanded')).toBe('false');
  });

  it('reveals the details when "Other" is chosen', () => {
    renderPage();

    fireEvent.click(otherOption());

    expect(conditional().className).not.toContain('govuk-radios__conditional--hidden');
    expect(otherOption().getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({
      values: { methodology: 'A method', calculatedBy: 'other', calculatedByDetail: 'ONS' },
    });

    expect(methodologyField().value).toBe('A method');
    expect(otherOption().checked).toBe(true);
    expect(detailsField().value).toBe('ONS');
    expect(conditional().className).not.toContain('govuk-radios__conditional--hidden');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.title).toBe(`How was the indicator calculated? - ${serviceName} - GOV.UK`);
  });

  it('chooses nothing while who calculated the indicator is unanswered', () => {
    renderPage();

    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false,
    );
  });

  it('links each refusal to its control, in the order the form asks', () => {
    renderPage({
      fieldErrors: {
        calculatedBy: 'Select who calculated the indicator',
        methodology: 'Enter the methodology',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Enter the methodology',
      'Select who calculated the indicator',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `#${methodologyField().id}`,
      `#${option('Office for Health Improvement and Disparities').id}`,
    ]);
  });

  it('marks the radios as refused when no one is chosen', () => {
    const { container } = renderPage({
      fieldErrors: { calculatedBy: 'Select who calculated the indicator' },
    });

    const group = screen.getByRole('group', { name: /Who calculated the indicator\?/ });

    expect(group.closest('.govuk-form-group--error')).not.toBeNull();
    expect(group.textContent).toContain('Select who calculated the indicator');
    expect(container.querySelectorAll('.govuk-form-group--error')).toHaveLength(1);
  });

  it('shows the details error inside the open reveal, linked from the summary', () => {
    renderPage({
      fieldErrors: { calculatedByDetail: detailsError },
      values: { methodology: 'A method', calculatedBy: 'other', calculatedByDetail: '' },
    });

    const link = within(screen.getByRole('alert')).getByRole('link', { name: detailsError });
    const error = conditional().querySelector('.govuk-error-message');

    expect(link.getAttribute('href')).toBe(`#${detailsField().id}`);
    expect(conditional().className).not.toContain('govuk-radios__conditional--hidden');
    expect(error?.textContent).toContain(detailsError);
    expect(detailsField().className).toContain('govuk-textarea--error');
    expect(detailsField().getAttribute('aria-describedby')).toBe(error?.id);
    expect(methodologyField().className).not.toContain('govuk-textarea--error');
  });

  it('keeps what was typed after a refusal', () => {
    renderPage({
      fieldErrors: { methodology: 'Enter the methodology' },
      values: { methodology: '', calculatedBy: 'other', calculatedByDetail: 'ONS' },
    });

    expect(otherOption().checked).toBe(true);
    expect(detailsField().value).toBe('ONS');
    expect(methodologyField().className).toContain('govuk-textarea--error');
  });
});
