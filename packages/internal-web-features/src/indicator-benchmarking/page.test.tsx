// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { BenchmarkingPage } from './page.tsx';

afterEach(cleanup);

const empty = {
  hasGoalBenchmark: '',
  goalLowerValue: '',
  goalUpperValue: '',
  goalPolarity: '',
  goalPolicyDetail: '',
};

const QUESTION = 'Are there any goal benchmarks for this indicator?';
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

function input(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function polarity() {
  return within(screen.getByRole('group', { name: POLARITY }));
}

function radioValues(group: ReturnType<typeof within>) {
  return (group.getAllByRole('radio') as HTMLInputElement[]).map((radio) => [
    radio.name,
    radio.value,
    radio.labels?.[0]?.textContent,
  ]);
}

describe('BenchmarkingPage', () => {
  it('links to its part of the publisher guidance', () => {
    renderPage();

    expect(screen.getByRole('link', { name: RELATED_GUIDANCE_LINK }).getAttribute('href')).toBe(
      '/publish/guidance#policy-goal',
    );
  });

  it('asks whether there are goal benchmarks, under the page heading', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Benchmarking' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: QUESTION })).toBeTruthy();
    const question = within(screen.getByRole('group', { name: QUESTION }));
    expect(
      [question.getByLabelText('Yes'), question.getByLabelText('No')].map(
        (radio) => (radio as HTMLInputElement).value,
      ),
    ).toEqual(['yes', 'no']);
  });

  it('asks the questions under Yes alike, each a level 3 heading', () => {
    renderPage();

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([LOWER, UPPER, POLARITY, DETAIL]);
  });

  it('asks for the goal under Yes', () => {
    renderPage();

    const conditional = input(LOWER).closest('.govuk-radios__conditional');

    expect(conditional?.id).toBe(screen.getByLabelText('Yes').getAttribute('aria-controls'));
    for (const field of [
      input(UPPER),
      screen.getByRole('group', { name: POLARITY }),
      input(DETAIL),
    ]) {
      expect(conditional?.contains(field)).toBe(true);
    }
  });

  // No decimal keypad: on iOS it has no minus key, and a goal can be negative.
  it('asks for the goal values in plain text inputs, each with its hint', () => {
    renderPage();

    expect(
      [input(LOWER), input(UPPER)].map((field) => [field.name, field.type, field.inputMode]),
    ).toEqual([
      ['goalLowerValue', 'text', ''],
      ['goalUpperValue', 'text', ''],
    ]);
    expect(input(LOWER).className).toContain('govuk-input--width-5');
    expect(
      document.getElementById(input(LOWER).getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe(
      'Value type must be the same as those used for data values in this indicator. You do not need to enter units.',
    );
    expect(
      document.getElementById(input(UPPER).getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Leave this blank if there is only a single goal value');
  });

  it('offers the goal polarities as small radios, then a textarea for the policy', () => {
    renderPage();

    expect(radioValues(polarity())).toEqual([
      ['goalPolarity', 'higher-is-better', 'High is good'],
      ['goalPolarity', 'lower-is-better', 'Low is good'],
    ]);
    expect(polarity().getByLabelText('High is good').closest('.govuk-radios')?.className).toContain(
      'govuk-radios--small',
    );
    expect((input(DETAIL) as unknown as HTMLTextAreaElement).name).toBe('goalPolicyDetail');
    expect(input(DETAIL).getAttribute('rows')).toBe('5');
  });

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({
      values: {
        hasGoalBenchmark: 'yes',
        goalLowerValue: '90',
        goalUpperValue: '95',
        goalPolarity: 'lower-is-better',
        goalPolicyDetail: 'The national target.',
      },
    });

    expect((screen.getByLabelText('Yes') as HTMLInputElement).checked).toBe(true);
    expect([input(LOWER).value, input(UPPER).value, input(DETAIL).value]).toEqual([
      '90',
      '95',
      'The national target.',
    ]);
    expect((polarity().getByLabelText('Low is good') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.title).toBe(`Benchmarking - ${serviceName} - GOV.UK`);
  });

  it('links each refusal to its control, in the order the form asks', () => {
    renderPage({
      fieldErrors: {
        goalPolarity: 'Select the polarity of the goal',
        goalUpperValue: 'Upper goal value must be higher than the lower goal value',
        goalLowerValue: 'Enter the lower goal value',
      },
      values: { ...empty, hasGoalBenchmark: 'yes' },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Enter the lower goal value', `#${input(LOWER).id}`],
      ['Upper goal value must be higher than the lower goal value', `#${input(UPPER).id}`],
      ['Select the polarity of the goal', `#${polarity().getByLabelText('High is good').id}`],
    ]);
    expect(input(LOWER).className).toContain('govuk-input--error');
  });

  it('links an unanswered question to its first radio', () => {
    renderPage({
      fieldErrors: {
        hasGoalBenchmark: 'Select whether there are any goal benchmarks for this indicator',
      },
    });

    expect(within(screen.getByRole('alert')).getByRole('link').getAttribute('href')).toBe(
      `#${screen.getByLabelText('Yes').id}`,
    );
  });
});
