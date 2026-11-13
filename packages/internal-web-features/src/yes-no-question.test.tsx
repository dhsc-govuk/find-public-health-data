// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { YesNoQuestion } from './yes-no-question.tsx';

afterEach(cleanup);

type Field = 'answer' | 'detail' | 'reason';

const LEGEND = 'Are there any caveats needed?';

function renderQuestion(props: Partial<ComponentProps<typeof YesNoQuestion<Field>>> = {}) {
  return render(
    <YesNoQuestion<Field>
      answer="answer"
      detail="detail"
      detailLabel="Provide details"
      detailRows={3}
      fieldErrors={{}}
      legend={LEGEND}
      values={{ answer: '', detail: '', reason: '' }}
      {...props}
    />,
  );
}

function group() {
  return screen.getByRole('group', { name: /Are there any caveats needed\?/ });
}

function option(label: string) {
  return within(group()).getByLabelText(label) as HTMLInputElement;
}

function detailsField() {
  return within(group()).getByLabelText('Provide details') as HTMLTextAreaElement;
}

function conditional(field = detailsField()) {
  const reveal = field.closest('.govuk-radios__conditional');
  if (reveal === null) throw new Error('the details field is not in a conditional reveal');
  return reveal;
}

const NO_DETAIL = { name: 'reason', label: 'Enter reasons why not' } as const;

function reasonField() {
  return within(group()).getByLabelText('Enter reasons why not') as HTMLTextAreaElement;
}

describe('YesNoQuestion', () => {
  it('asks the question as a medium heading in its legend', () => {
    renderQuestion();

    const heading = screen.getByRole('heading', { level: 2, name: LEGEND });

    expect(heading.parentElement?.tagName).toBe('LEGEND');
    expect(heading.parentElement?.className).toContain('govuk-fieldset__legend--m');
  });

  it('describes the question with its hint', () => {
    renderQuestion({ hint: 'The default is "© Crown copyright"' });

    const hint = within(group()).getByText('The default is "© Crown copyright"');

    expect(hint.className).toContain('govuk-hint');
    expect(group().getAttribute('aria-describedby')).toContain(hint.id);
  });

  it('answers with Yes and No under its answer field, then any further answers', () => {
    renderQuestion({ moreOptions: [{ value: 'not-applicable', label: 'Not applicable' }] });

    const radios = within(group()).getAllByRole('radio') as HTMLInputElement[];

    expect(radios.map((radio) => [radio.name, radio.value])).toEqual([
      ['answer', 'yes'],
      ['answer', 'no'],
      ['answer', 'not-applicable'],
    ]);
    expect(radios.some((radio) => radio.checked)).toBe(false);
  });

  it('asks for the details inside the reveal Yes controls', () => {
    renderQuestion();

    expect(detailsField().getAttribute('name')).toBe('detail');
    expect(detailsField().getAttribute('rows')).toBe('3');
    expect(option('Yes').getAttribute('aria-controls')).toBe(conditional().id);
  });

  it('marks the reveal hidden while Yes is not chosen, which hides it only with JavaScript', () => {
    renderQuestion({ values: { answer: 'no', detail: '', reason: '' } });

    expect(conditional().className).toContain('govuk-radios__conditional--hidden');
  });

  it('reveals the details when Yes is chosen', () => {
    renderQuestion();

    fireEvent.click(option('Yes'));

    expect(conditional().className).not.toContain('govuk-radios__conditional--hidden');
    expect(option('Yes').getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the answer and details it is given', () => {
    renderQuestion({ values: { answer: 'yes', detail: 'Survey data.', reason: '' } });

    expect(option('Yes').checked).toBe(true);
    expect(detailsField().value).toBe('Survey data.');
  });

  it('reveals nothing under No unless it is given details for No', () => {
    renderQuestion();

    expect(option('No').hasAttribute('aria-controls')).toBe(false);
    expect(group().querySelectorAll('textarea')).toHaveLength(1);
  });

  it('asks for the details for No inside the reveal No controls', () => {
    renderQuestion({ noDetail: NO_DETAIL });

    expect(reasonField().getAttribute('name')).toBe('reason');
    expect(reasonField().getAttribute('rows')).toBe('3');
    expect(option('No').getAttribute('aria-controls')).toBe(conditional(reasonField()).id);
    expect(conditional(reasonField()).className).toContain('govuk-radios__conditional--hidden');
  });

  it('shows the answer No and its details open', () => {
    renderQuestion({
      noDetail: NO_DETAIL,
      values: { answer: 'no', detail: '', reason: 'No tool reads this source.' },
    });

    expect(option('No').checked).toBe(true);
    expect(reasonField().value).toBe('No tool reads this source.');
    expect(conditional(reasonField()).className).not.toContain('govuk-radios__conditional--hidden');
    expect(conditional().className).toContain('govuk-radios__conditional--hidden');
  });

  it('marks an unanswered question as refused', () => {
    const { container } = renderQuestion({ fieldErrors: { answer: 'Select an answer' } });

    expect(group().closest('.govuk-form-group--error')).not.toBeNull();
    expect(group().textContent).toContain('Select an answer');
    expect(container.querySelectorAll('.govuk-form-group--error')).toHaveLength(1);
  });

  it('shows a details error inside the open reveal', () => {
    renderQuestion({
      fieldErrors: { detail: 'Provide details of the caveats' },
      values: { answer: 'yes', detail: '', reason: '' },
    });

    const error = conditional().querySelector('.govuk-error-message');

    expect(conditional().className).not.toContain('govuk-radios__conditional--hidden');
    expect(error?.textContent).toContain('Provide details of the caveats');
    expect(detailsField().className).toContain('govuk-textarea--error');
    expect(detailsField().getAttribute('aria-describedby')).toBe(error?.id);
  });
});
