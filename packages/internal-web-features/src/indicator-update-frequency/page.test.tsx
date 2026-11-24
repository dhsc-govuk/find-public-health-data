// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { UpdateFrequencyPage } from './page.tsx';

afterEach(cleanup);

const QUESTION = 'How often will this indicator be updated?';
const NO_FIXED = 'No fixed frequency';
const NO_LONGER_UPDATED = 'This indicator will no longer be updated';
const NO_FIXED_ERROR = 'Enter the reason this indicator has no fixed update frequency';

const MORE_THAN_1_YEAR = 'Frequency of more than 1 year';
const YEARS_ERROR = 'Number of years must be a whole number of 2 or more';

const empty = {
  updateFrequency: '',
  updateFrequencyYears: '',
  updateFrequencyText: '',
  noFixedFrequencyReason: '',
  noLongerUpdatedReason: '',
};

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof UpdateFrequencyPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <UpdateFrequencyPage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function option(label: string) {
  return screen.getByLabelText(label, { exact: true }) as HTMLInputElement;
}

/** The box the named answer reveals for its details, and the reveal that holds it. */
function reason(answer: string) {
  const reveal = document.getElementById(option(answer).getAttribute('aria-controls') ?? '');
  const field = reveal?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  if (!reveal || !field) throw new Error(`"${answer}" reveals no details`);
  return { reveal, field };
}

describe('UpdateFrequencyPage', () => {
  it('links to its part of the publisher guidance between the heading and the options', () => {
    renderPage();
    const link = screen.getByRole('link', { name: RELATED_GUIDANCE_LINK });

    expect(link.getAttribute('href')).toBe('/publish/guidance#update-frequency');
    expect(
      screen.getByRole('heading', { level: 1 }).compareDocumentPosition(link) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      link.compareDocumentPosition(screen.getByRole('group', { name: QUESTION })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('asks the question as the page heading, and names the group of options with it', () => {
    renderPage();

    const heading = screen.getByRole('heading', { level: 1, name: QUESTION });
    const legend = screen.getByRole('group', { name: QUESTION }).querySelector('legend');

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading.closest('legend')).toBeNull();
    expect(legend?.querySelector('.govuk-visually-hidden')?.textContent).toBe(QUESTION);
    expect(document.title).toBe(`${QUESTION} - ${serviceName} - GOV.UK`);
  });

  it('offers the frequencies, then "or", then that the indicator will no longer be updated', () => {
    const { container } = renderPage();

    const radios = within(screen.getByRole('group')).getAllByRole('radio') as HTMLInputElement[];
    const items = [...container.querySelectorAll('.govuk-radios > *')];

    expect(radios.map((radio) => radio.labels?.[0]?.textContent)).toEqual([
      'Monthly',
      'Quarterly',
      'Annually',
      'Frequency of more than 1 year',
      'Other',
      'No fixed frequency',
      'This indicator will no longer be updated',
    ]);
    expect(radios.map((radio) => radio.value)).toEqual([
      'monthly',
      'quarterly',
      'annually',
      'every-n-years',
      'other',
      'no-fixed-frequency',
      'no-longer-updated',
    ]);
    expect(radios.every((radio) => radio.name === 'updateFrequency' && !radio.checked)).toBe(true);
    // The last three frequencies are each followed by their reveal, then the divider.
    expect(items[9]?.className).toBe('govuk-radios__divider');
    expect(items[9]?.textContent).toBe('or');
  });

  it('shows the frequency it is given, so a draft can be revisited', () => {
    renderPage({
      values: { ...empty, updateFrequency: 'no-longer-updated', noLongerUpdatedReason: 'Ended' },
    });

    expect(option(NO_LONGER_UPDATED).checked).toBe(true);
    expect(option('Monthly').checked).toBe(false);
    expect(reason(NO_LONGER_UPDATED).field.value).toBe('Ended');
    expect(reason(NO_LONGER_UPDATED).reveal.className).not.toContain(
      'govuk-radios__conditional--hidden',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    [NO_FIXED, 'noFixedFrequencyReason', 'Enter reason'],
    [NO_LONGER_UPDATED, 'noLongerUpdatedReason', 'Enter reason'],
    ['Other', 'updateFrequencyText', 'Enter frequency'],
  ])('asks for details inside the reveal that "%s" controls', (answer, name, label) => {
    renderPage();

    const { field, reveal } = reason(answer);

    expect(field.tagName).toBe('TEXTAREA');
    expect(field.name).toBe(name);
    expect(field.getAttribute('rows')).toBe('3');
    expect(field.labels?.[0]?.textContent).toBe(label);
    expect(reveal.className).toContain('govuk-radios__conditional--hidden');
  });

  it('asks for the number of years inside the reveal that "Frequency of more than 1 year" controls', () => {
    renderPage();

    const { field, reveal } = reason(MORE_THAN_1_YEAR);

    expect(field.tagName).toBe('INPUT');
    expect(field.name).toBe('updateFrequencyYears');
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field.className).toContain('govuk-input--width-3');
    expect(field.labels?.[0]?.textContent).toBe('Enter number of years');
    expect(reveal.className).toContain('govuk-radios__conditional--hidden');
  });

  it('reveals nothing under monthly, quarterly and annually', () => {
    renderPage();

    for (const answer of ['Monthly', 'Quarterly', 'Annually']) {
      expect(option(answer).getAttribute('aria-controls')).toBeNull();
    }
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
  });

  it.each([
    [{ updateFrequency: 'every-n-years', updateFrequencyYears: '3' }, MORE_THAN_1_YEAR, '3'],
    [
      { updateFrequency: 'other', updateFrequencyText: 'Academic year.' },
      'Other',
      'Academic year.',
    ],
  ])('shows the details it is given under their answer %o', (values, answer, shown) => {
    renderPage({ values: { ...empty, ...values } });

    expect(option(answer).checked).toBe(true);
    expect(reason(answer).field.value).toBe(shown);
    expect(reason(answer).reveal.className).not.toContain('govuk-radios__conditional--hidden');
  });

  it('reveals the reason when its answer is chosen', () => {
    renderPage();

    fireEvent.click(option(NO_FIXED));

    expect(reason(NO_FIXED).reveal.className).not.toContain('govuk-radios__conditional--hidden');
    expect(option(NO_FIXED).getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the reason error inside the open reveal, linked from the summary', () => {
    renderPage({
      fieldErrors: { noFixedFrequencyReason: NO_FIXED_ERROR },
      values: { ...empty, updateFrequency: 'no-fixed-frequency' },
    });

    const link = within(screen.getByRole('alert')).getByRole('link', { name: NO_FIXED_ERROR });
    const { field, reveal } = reason(NO_FIXED);
    const error = reveal.querySelector('.govuk-error-message');

    expect(link.getAttribute('href')).toBe(`#${field.id}`);
    expect(error?.textContent).toContain(NO_FIXED_ERROR);
    expect(field.className).toContain('govuk-textarea--error');
    expect(field.getAttribute('aria-describedby')).toBe(error?.id);
    expect(reason(NO_LONGER_UPDATED).field.className).not.toContain('govuk-textarea--error');
  });

  it('shows the number of years error inside the open reveal, linked from the summary', () => {
    renderPage({
      fieldErrors: { updateFrequencyYears: YEARS_ERROR },
      values: { ...empty, updateFrequency: 'every-n-years', updateFrequencyYears: '1' },
    });

    const link = within(screen.getByRole('alert')).getByRole('link', { name: YEARS_ERROR });
    const { field, reveal } = reason(MORE_THAN_1_YEAR);
    const error = reveal.querySelector('.govuk-error-message');

    expect(link.getAttribute('href')).toBe(`#${field.id}`);
    expect(error?.textContent).toContain(YEARS_ERROR);
    expect(field.className).toContain('govuk-input--error');
    expect(field.value).toBe('1');
  });

  it('links the refusal to the first option and describes the options with it', () => {
    const { container } = renderPage({
      fieldErrors: { updateFrequency: 'Select how often this indicator will be updated' },
    });

    const link = within(screen.getByRole('alert')).getByRole('link');
    const error = container.querySelector('.govuk-error-message');

    expect(link.textContent).toBe('Select how often this indicator will be updated');
    expect(link.getAttribute('href')).toBe(`#${option('Monthly').id}`);
    expect(screen.getByRole('group').getAttribute('aria-describedby')).toBe(error?.id);
    expect(container.querySelectorAll('.govuk-form-group--error')).toHaveLength(1);
  });
});
