// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal } from '../testing.ts';
import { UpdateFrequencyPage } from './page.tsx';

afterEach(cleanup);

const QUESTION = 'How often will this indicator be updated?';
const NO_FIXED = 'No fixed frequency';
const NO_LONGER_UPDATED = 'This indicator will no longer be updated';
const NO_FIXED_ERROR = 'Enter the reason this indicator has no fixed update frequency';

const empty = { updateFrequency: '', noFixedFrequencyReason: '', noLongerUpdatedReason: '' };

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

/** The reason box the named answer reveals, and the reveal that holds it. */
function reason(answer: string) {
  const reveal = document.getElementById(option(answer).getAttribute('aria-controls') ?? '');
  const field = reveal?.querySelector('textarea');
  if (!reveal || !field) throw new Error(`"${answer}" reveals no reason`);
  return { reveal, field };
}

describe('UpdateFrequencyPage', () => {
  it('asks the question as the page heading, which also names the group of options', () => {
    renderPage();

    const heading = screen.getByRole('heading', { level: 1, name: QUESTION });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading.closest('legend')).not.toBeNull();
    expect(screen.getByRole('group', { name: QUESTION })).toBeTruthy();
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
      'Every 2 years',
      'No fixed frequency',
      'This indicator will no longer be updated',
    ]);
    expect(radios.map((radio) => radio.value)).toEqual([
      'monthly',
      'quarterly',
      'annually',
      'every-2-years',
      'no-fixed-frequency',
      'no-longer-updated',
    ]);
    expect(radios.every((radio) => radio.name === 'updateFrequency' && !radio.checked)).toBe(true);
    // "No fixed frequency" is followed by its reveal, then the divider.
    expect(items[6]?.className).toBe('govuk-radios__divider');
    expect(items[6]?.textContent).toBe('or');
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
    [NO_FIXED, 'noFixedFrequencyReason'],
    [NO_LONGER_UPDATED, 'noLongerUpdatedReason'],
  ])('asks for a reason inside the reveal that "%s" controls', (answer, name) => {
    renderPage();

    const { field, reveal } = reason(answer);

    expect(field.name).toBe(name);
    expect(field.getAttribute('rows')).toBe('3');
    expect(field.labels?.[0]?.textContent).toBe('Enter reason');
    expect(reveal.className).toContain('govuk-radios__conditional--hidden');
  });

  it('reveals no reason under the other answers', () => {
    renderPage();

    for (const answer of ['Monthly', 'Quarterly', 'Annually', 'Every 2 years']) {
      expect(option(answer).getAttribute('aria-controls')).toBeNull();
    }
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
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
