// @vitest-environment jsdom
import { firstRadioId, Radios, serviceName, Textarea } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { IndicatorSectionForm } from './indicator-section-form.tsx';
import type { GuidanceAnchor } from './publisher-guidance/paths.ts';
import { RELATED_GUIDANCE_LINK, SHOWN_VERSION } from './testing.ts';

afterEach(cleanup);

type Field = 'answer' | 'choice';

type FormProps = {
  fieldErrors?: Partial<Record<Field, string>>;
  formError?: string;
  continueOnEnter?: boolean;
  intro?: ReactNode;
  submitLabel?: string;
  version?: string;
} & ({ guidance?: GuidanceAnchor; questionIsHeading?: false } | { questionIsHeading: true });

// Radios as well as a textarea, because GOV.UK links a radios error to its first option.
function renderForm(
  { fieldErrors = {}, formError, version, ...props }: FormProps = {},
  at = '/publish/indicators/1/a-section',
) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <IndicatorSectionForm
        fieldIds={{ choice: firstRadioId('choice') }}
        form={{ fieldErrors, formError, version }}
        section={{ fields: { options: ['answer', 'choice'] } }}
        title="A section"
        {...props}
      >
        <Textarea error={fieldErrors.answer} label="An answer" name="answer" />
        <Radios
          error={fieldErrors.choice}
          label="A choice"
          name="choice"
          options={[
            { label: 'One', value: 'one' },
            { label: 'Two', value: 'two' },
          ]}
        />
      </IndicatorSectionForm>
    </MemoryRouter>,
  );
}

describe('IndicatorSectionForm', () => {
  it('heads the page with its title and names the document after it', () => {
    renderForm();

    expect(screen.getByRole('heading', { level: 1, name: 'A section' })).toBeTruthy();
    expect(document.title).toBe(`A section - ${serviceName} - GOV.UK`);
  });

  it('adds no heading when the question is the heading', () => {
    renderForm({ questionIsHeading: true });

    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.title).toBe(`A section - ${serviceName} - GOV.UK`);
  });

  it('links to its part of the publisher guidance under the heading, before the intro', () => {
    const { container } = renderForm({ guidance: 'caveats', intro: <p>An intro</p> });
    const link = screen.getByRole('link', { name: RELATED_GUIDANCE_LINK });

    expect(link.getAttribute('href')).toBe('/publish/guidance#caveats');
    expect([...container.querySelectorAll('h1, p')].map((element) => element.textContent)).toEqual([
      'A section',
      RELATED_GUIDANCE_LINK,
      'An intro',
    ]);
  });

  it('opens the guidance in a new tab, so answers not yet saved stay on the page', () => {
    renderForm({ guidance: 'caveats' });
    const link = screen.getByRole('link', { name: RELATED_GUIDANCE_LINK });

    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer noopener');
  });

  it('puts the guidance link before the form', () => {
    const { container } = renderForm({ guidance: 'caveats' });
    const link = screen.getByRole('link', { name: RELATED_GUIDANCE_LINK });

    expect(container.querySelector('form')?.contains(link)).toBe(false);
    expect(
      link.compareDocumentPosition(screen.getByLabelText('An answer')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('links to no guidance unless the page names its part', () => {
    renderForm();

    expect(screen.queryByRole('link', { name: RELATED_GUIDANCE_LINK })).toBeNull();
  });

  it('continues with a form that posts back to its own page', () => {
    const { container } = renderForm();
    const form = container.querySelector('form');

    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/publish/indicators/1/a-section');
    expect(within(form as HTMLElement).getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  // Following an error summary link without JavaScript leaves the field's fragment on the page.
  it('posts to its page without the fragment, which would win over the field it next focuses', () => {
    const { container } = renderForm({}, '/publish/indicators/1/a-section?from=summary#answer');

    expect(container.querySelector('form')?.getAttribute('action')).toBe(
      '/publish/indicators/1/a-section?from=summary',
    );
  });

  it('words its button as the page asks', () => {
    renderForm({ submitLabel: 'Submit' });

    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('sends back the version of the answers it was shown', () => {
    const { container } = renderForm({ version: SHOWN_VERSION });

    const hidden = container.querySelector<HTMLInputElement>('form input[type="hidden"]');

    expect([hidden?.name, hidden?.value]).toEqual(['version', SHOWN_VERSION]);
  });

  it('sends no version for a form that saves without one', () => {
    const { container } = renderForm();

    expect(container.querySelector('input[name="version"]')).toBeNull();
  });

  it('debounces Continue, so a double click submits the answers once', () => {
    const { container } = renderForm();
    const button = container.querySelector('form button');

    expect(button?.getAttribute('data-prevent-double-click')).toBe('true');
  });

  it('offers one Continue, which Enter in a field presses when no other button comes first', () => {
    const { container } = renderForm();
    const buttons = container.querySelectorAll('form button');

    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe('Continue');
  });

  it("puts a hidden Continue first when asked, for Enter to press in place of the form's own buttons", () => {
    const { container } = renderForm({ continueOnEnter: true });
    const [first, ...others] = container.querySelectorAll('form button');

    expect(first?.textContent).toBe('Continue');
    expect(first?.getAttribute('type')).toBe('submit');
    expect(first?.getAttribute('name')).toBeNull();
    expect(first?.getAttribute('tabindex')).toBe('-1');
    expect(first?.getAttribute('aria-hidden')).toBe('true');
    expect(first?.className).toContain('govuk-visually-hidden');
    // Enter presses this one, so two quick presses must send the answers once, as a double click does.
    expect(first?.getAttribute('data-prevent-double-click')).toBe('true');
    // Out of the accessibility tree, so the visible Continue is the only one announced.
    expect(screen.getAllByRole('button', { name: 'Continue' })).toEqual(
      others.filter((button) => button.textContent === 'Continue'),
    );
  });

  it('shows no summary and a plain title while nothing is refused', () => {
    renderForm();

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('summarises refusals in field order and starts the title with "Error: "', () => {
    renderForm({ fieldErrors: { choice: 'Choose one', answer: 'Enter an answer' } });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual(['Enter an answer', 'Choose one']);
    expect(document.title).toBe(`Error: A section - ${serviceName} - GOV.UK`);
  });

  it('summarises a refusal naming no field as an unlinked message, with an "Error: " title', () => {
    renderForm({ formError: 'Your answers could not be saved. Try again.' });

    const summary = within(screen.getByRole('alert'));

    expect(summary.getByText('Your answers could not be saved. Try again.')).toBeTruthy();
    expect(summary.queryAllByRole('link')).toEqual([]);
    expect(document.querySelector('.govuk-form-group--error')).toBeNull();
    expect(document.title).toBe(`Error: A section - ${serviceName} - GOV.UK`);
  });

  it('summarises a message given on several fields once, linking to the first', () => {
    renderForm({ fieldErrors: { answer: 'Answer both', choice: 'Answer both' } });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Answer both', '#answer-input'],
    ]);
  });

  it("links a field's error to its input, and a radios error to the first option", () => {
    renderForm({ fieldErrors: { answer: 'Enter an answer', choice: 'Choose one' } });

    const summary = within(screen.getByRole('alert'));
    const answer = screen.getByLabelText('An answer');
    const firstOption = screen.getByLabelText('One');

    expect(summary.getByRole('link', { name: 'Enter an answer' }).getAttribute('href')).toBe(
      `#${answer.id}`,
    );
    expect(summary.getByRole('link', { name: 'Choose one' }).getAttribute('href')).toBe(
      `#${firstOption.id}`,
    );
  });

  it("asks the fields it is given in place of its section's", () => {
    render(
      <MemoryRouter>
        <IndicatorSectionForm
          fields={['choice', 'answer']}
          form={{
            fieldErrors: { answer: 'Enter an answer', choice: 'Choose one' },
            formError: undefined,
          }}
          title="A section"
        >
          <Textarea label="An answer" name="answer" />
        </IndicatorSectionForm>
      </MemoryRouter>,
    );

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual(['Choose one', 'Enter an answer']);
  });
});
