// @vitest-environment jsdom
import {
  type BenchmarkingFormValues,
  MAX_POLICY_GOALS,
  type PolicyGoalFormValues,
  policyGoalFieldName,
} from '@fphd/internal-api-features/contract';
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { BenchmarkingPage } from './page.tsx';

afterEach(cleanup);

const blank: PolicyGoalFormValues = {
  lowerComparison: '',
  lowerValue: '',
  upperComparison: '',
  upperValue: '',
  polarity: '',
  detail: '',
};

const target: PolicyGoalFormValues = {
  lowerComparison: 'less-than-or-equal',
  lowerValue: '90',
  upperComparison: 'more-than',
  upperValue: '95',
  polarity: 'lower-is-better',
  detail: 'The national target.',
};

const empty: BenchmarkingFormValues = { hasGoalBenchmark: '', goals: [blank] };

const TITLE = 'Are there any policy goal benchmarks for this indicator?';
const LOWER = 'Enter lower goal value';
const UPPER = 'Enter upper goal value';
const POLARITY = 'Select polarity of goal';
const DETAIL = 'Provide detail about the policy goal';

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof BenchmarkingPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <BenchmarkingPage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function field(label: string) {
  return screen.getByLabelText(label, { exact: true }) as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement;
}

function group(name: string) {
  return within(screen.getByRole('group', { name }));
}

function buttons(name: string | RegExp) {
  return screen.queryAllByRole('button', { name }) as HTMLButtonElement[];
}

describe('BenchmarkingPage', () => {
  it('asks whether there are policy goal benchmarks with the page heading as its question', () => {
    renderPage();

    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([TITLE]);
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
    expect(
      (group(TITLE).getAllByRole('radio') as HTMLInputElement[])
        .filter((radio) => radio.name === 'hasGoalBenchmark')
        .map((radio) => radio.value),
    ).toEqual(['yes', 'no']);
  });

  it('links to its part of the publisher guidance between the heading and the question', () => {
    renderPage();

    const link = screen.getByRole('link', { name: RELATED_GUIDANCE_LINK });
    const heading = screen.getByRole('heading', { level: 1 });
    const radios = screen.getByRole('group', { name: TITLE });

    expect(link.getAttribute('href')).toBe('/publish/guidance#policy-goal');
    expect(heading.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.compareDocumentPosition(radios) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('asks for each goal under Yes, under its own heading', () => {
    renderPage();

    const conditional = field('Lower goal value').closest('.govuk-radios__conditional');

    expect(conditional?.id).toBe(screen.getByLabelText('Yes').getAttribute('aria-controls'));
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Policy goal 1']);
    for (const control of [
      field('Upper goal value'),
      screen.getByRole('group', { name: POLARITY }),
      field(DETAIL),
    ]) {
      expect(conditional?.contains(control)).toBe(true);
    }
  });

  it('asks each goal value beside its comparison, under one legend with its hint', () => {
    renderPage({ values: { hasGoalBenchmark: 'yes', goals: [target] } });

    const lower = group(LOWER);
    const comparison = lower.getByLabelText(
      'Comparison for the lower goal value',
    ) as HTMLSelectElement;
    const value = lower.getByLabelText('Lower goal value') as HTMLInputElement;

    expect([comparison.name, comparison.value]).toEqual([
      policyGoalFieldName(0, 'lowerComparison'),
      'less-than-or-equal',
    ]);
    expect([...comparison.options].map((option) => [option.value, option.text])).toEqual([
      ['', 'Select'],
      ['less-than', 'Less than'],
      ['less-than-or-equal', 'Less than or equal to'],
    ]);
    expect([value.name, value.value, value.type, value.inputMode]).toEqual([
      policyGoalFieldName(0, 'lowerValue'),
      '90',
      'text',
      '',
    ]);
    expect(value.className).toContain('govuk-input--width-5');
    expect(comparison.closest('.fphd-field-row')).toBe(value.closest('.fphd-field-row'));
    const fieldset = screen.getByRole('group', { name: LOWER });
    expect(
      document.getElementById(fieldset.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe(
      'Values must be consistent with those used for data values in this indicator. You do not need to enter units.',
    );

    const upper = group(UPPER);
    const upperComparison = upper.getByLabelText(
      'Comparison for the upper goal value',
    ) as HTMLSelectElement;
    expect([...upperComparison.options].map((option) => option.text)).toEqual([
      'Select',
      'More than',
      'More than or equal to',
    ]);
    expect(upperComparison.value).toBe('more-than');
    expect((upper.getByLabelText('Upper goal value') as HTMLInputElement).value).toBe('95');
    expect(
      document.getElementById(
        screen.getByRole('group', { name: UPPER }).getAttribute('aria-describedby') ?? '',
      )?.textContent,
    ).toBe('Leave this blank if there is only a single goal value');
  });

  it('offers the goal polarities as small radios, then a textarea for the detail', () => {
    renderPage({ values: { hasGoalBenchmark: 'yes', goals: [target] } });

    const radios = group(POLARITY).getAllByRole('radio') as HTMLInputElement[];

    expect(
      radios.map((radio) => [
        radio.name,
        radio.value,
        radio.labels?.[0]?.textContent,
        radio.checked,
      ]),
    ).toEqual([
      [policyGoalFieldName(0, 'polarity'), 'higher-is-better', 'High is good', false],
      [policyGoalFieldName(0, 'polarity'), 'lower-is-better', 'Low is good', true],
    ]);
    expect(radios[0]?.closest('.govuk-radios')?.className).toContain('govuk-radios--small');
    expect([field(DETAIL).name, field(DETAIL).value, field(DETAIL).getAttribute('rows')]).toEqual([
      policyGoalFieldName(0, 'detail'),
      'The national target.',
      '5',
    ]);
  });

  it('offers no removal of a goal alone', () => {
    renderPage();

    expect(buttons(/^Remove policy goal/)).toHaveLength(0);
  });

  it('labels every goal alike, telling screen readers which goal from the second on', () => {
    renderPage({ values: { hasGoalBenchmark: 'yes', goals: [target, blank] } });

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Policy goal 1', 'Policy goal 2']);
    expect(field('Lower goal value for policy goal 2').name).toBe(
      policyGoalFieldName(1, 'lowerValue'),
    );
    expect(screen.getByRole('group', { name: `${POLARITY} for policy goal 2` })).toBeTruthy();
    expect(field(`${DETAIL} for policy goal 2`).name).toBe(policyGoalFieldName(1, 'detail'));
    // Each question a Yes reveals is a heading, as on the other section pages.
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([
      LOWER,
      UPPER,
      POLARITY,
      DETAIL,
      `${LOWER} for policy goal 2`,
      `${UPPER} for policy goal 2`,
      `${POLARITY} for policy goal 2`,
      `${DETAIL} for policy goal 2`,
    ]);
  });

  it('offers the removal of every goal once there are two', () => {
    renderPage({ values: { hasGoalBenchmark: 'yes', goals: [target, blank] } });

    expect(
      buttons(/^Remove policy goal/).map((button) => [button.textContent, button.value]),
    ).toEqual([
      ['Remove policy goal 1', 'remove-0'],
      ['Remove policy goal 2', 'remove-1'],
    ]);
  });

  it('offers another goal until as many as a draft may hold', () => {
    renderPage();
    expect(buttons('Add another policy goal').map((button) => [button.name, button.value])).toEqual(
      [['intent', 'add']],
    );
    cleanup();

    renderPage({
      values: {
        hasGoalBenchmark: 'yes',
        goals: Array.from({ length: MAX_POLICY_GOALS }, () => target),
      },
    });
    expect(buttons('Add another policy goal')).toHaveLength(0);
  });

  it('lets Enter in a field continue rather than add or remove a goal', () => {
    const { container } = renderPage({
      values: { hasGoalBenchmark: 'yes', goals: [target, blank] },
    });

    const first = container.querySelector('form button');

    expect(first?.textContent).toBe('Continue');
    expect(first?.getAttribute('name')).toBeNull();
  });

  it('links each refusal to its control, in the order the form asks', () => {
    renderPage({
      fieldErrors: {
        [policyGoalFieldName(1, 'polarity')]: 'Select the polarity of the goal for policy goal 2',
        [policyGoalFieldName(0, 'upperValue')]:
          'Upper goal value must be higher than the lower goal value',
        [policyGoalFieldName(0, 'lowerComparison')]:
          'Select the comparison for the lower goal value',
        hasGoalBenchmark: 'Select whether there are any goal benchmarks for this indicator',
      },
      values: { hasGoalBenchmark: 'yes', goals: [blank, blank] },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      [
        'Select whether there are any goal benchmarks for this indicator',
        `#${screen.getByLabelText('Yes').id}`,
      ],
      [
        'Select the comparison for the lower goal value',
        `#${field('Comparison for the lower goal value').id}`,
      ],
      [
        'Upper goal value must be higher than the lower goal value',
        `#${field('Upper goal value').id}`,
      ],
      [
        'Select the polarity of the goal for policy goal 2',
        `#${group(`${POLARITY} for policy goal 2`).getByLabelText('High is good').id}`,
      ],
    ]);
    expect(field('Upper goal value').className).toContain('govuk-input--error');
    expect(field('Comparison for the lower goal value').className).toContain('govuk-select--error');
    // Each goal value shows its refusal once, under its legend, not beside each control.
    expect(
      screen.getByRole('group', { name: UPPER }).querySelectorAll('.govuk-error-message'),
    ).toHaveLength(1);
  });

  it('shows a refusal of the goals as a whole at the first goal', () => {
    renderPage({
      values: { hasGoalBenchmark: 'yes', goals: [blank] },
      fieldErrors: { goals: 'You cannot add more than 10 policy goals' },
    });

    const lower = field('Lower goal value');

    expect(within(screen.getByRole('alert')).getByRole('link').getAttribute('href')).toBe(
      `#${lower.id}`,
    );
    const described = (
      screen.getByRole('group', { name: LOWER }).getAttribute('aria-describedby') ?? ''
    )
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ');
    expect(described).toContain('You cannot add more than 10 policy goals');
    expect(lower.className).toContain('govuk-input--error');
  });
});
