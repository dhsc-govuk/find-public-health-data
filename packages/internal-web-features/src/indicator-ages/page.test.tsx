// @vitest-environment jsdom
import {
  type AgeRangeFormValues,
  type AgesFormValues,
  ageRangeFieldName,
  MAX_AGE_RANGES,
} from '@fphd/internal-api-features/contract';
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal } from '../testing.ts';
import { AgesPage } from './page.tsx';

afterEach(cleanup);

const TITLE = 'What ages are included in this indicator?';

const blank: AgeRangeFormValues = {
  lowerLimit: '',
  lowerLimitUnit: '',
  upperLimit: '',
  upperLimitUnit: '',
};
const sixteenPlus = { ...blank, lowerLimit: '16', lowerLimitUnit: 'years' };
const underFive = { ...blank, upperLimit: '4', upperLimitUnit: 'months' };

const empty: AgesFormValues = {
  ageType: '',
  ageRanges: [blank],
  specificAge: '',
  specificAgeUnit: '',
  ageDetail: '',
};

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof AgesPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <AgesPage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function field(label: string) {
  return screen.getByLabelText(label, { exact: true }) as HTMLInputElement | HTMLSelectElement;
}

function buttons(name: string | RegExp) {
  return screen.queryAllByRole('button', { name }) as HTMLButtonElement[];
}

describe('AgesPage', () => {
  it('asks the age type with the page heading as its question', () => {
    renderPage();

    const heading = screen.getByRole('heading', { level: 1, name: TITLE });

    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
    expect(heading.closest('legend')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('group', { name: TITLE })).toBeTruthy();
  });

  it('offers each age type, choosing the one answered', () => {
    renderPage({ values: { ...empty, ageType: 'specific' } });

    const radios = within(screen.getByRole('group', { name: TITLE })).getAllByRole(
      'radio',
    ) as HTMLInputElement[];

    expect(
      radios.map((radio) => [radio.value, radio.labels?.[0]?.textContent, radio.checked]),
    ).toEqual([
      ['all', 'All ages', false],
      ['range', 'Age range', false],
      ['specific', 'Specific age', true],
      ['other', 'Other', false],
    ]);
  });

  it('asks each limit as a number and a period, with the periods in order', () => {
    renderPage({ values: { ...empty, ageRanges: [sixteenPlus] } });

    const lower = field('Lower limit') as HTMLInputElement;
    const lowerPeriod = field('Periods for lower limit') as HTMLSelectElement;

    expect([lower.name, lower.value, lower.inputMode]).toEqual([
      ageRangeFieldName(0, 'lowerLimit'),
      '16',
      'numeric',
    ]);
    expect([lowerPeriod.name, lowerPeriod.value]).toEqual([
      ageRangeFieldName(0, 'lowerLimitUnit'),
      'years',
    ]);
    expect([...lowerPeriod.options].map((option) => [option.value, option.text])).toEqual([
      ['', 'Select'],
      ['days', 'days'],
      ['weeks', 'weeks'],
      ['months', 'months'],
      ['years', 'years'],
    ]);
    expect(field('Upper limit').name).toBe(ageRangeFieldName(0, 'upperLimit'));
    expect(field('Periods for upper limit').name).toBe(ageRangeFieldName(0, 'upperLimitUnit'));
  });

  it('heads each range, and offers no removal of a range alone', () => {
    renderPage();

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Age range 1']);
    expect(buttons(/^Remove range/)).toHaveLength(0);
  });

  it('labels every range alike, telling screen readers which range from the second on', () => {
    renderPage({ values: { ...empty, ageType: 'range', ageRanges: [sixteenPlus, underFive] } });

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Age range 1', 'Age range 2']);
    expect(field('Upper limit of range 2').value).toBe('4');
    expect(field('Periods for upper limit of range 2').value).toBe('months');
    // What a sighted user reads: the label's text without the part hidden off screen.
    expect(
      [...document.querySelectorAll<HTMLInputElement>('input[name^="ageRanges"]')].map(
        (input) => input.labels?.[0]?.firstChild?.textContent,
      ),
    ).toEqual(['Lower limit', 'Upper limit', 'Lower limit', 'Upper limit']);
  });

  it('offers the removal of every range once there are two', () => {
    renderPage({ values: { ...empty, ageType: 'range', ageRanges: [sixteenPlus, underFive] } });

    expect(buttons(/^Remove range/).map((button) => [button.textContent, button.value])).toEqual([
      ['Remove range 1', 'remove-0'],
      ['Remove range 2', 'remove-1'],
    ]);
  });

  it('offers another range until as many as a draft may hold', () => {
    renderPage();
    expect(buttons('Add another range').map((button) => [button.name, button.value])).toEqual([
      ['intent', 'add'],
    ]);
    cleanup();

    renderPage({
      values: { ...empty, ageRanges: Array.from({ length: MAX_AGE_RANGES }, () => sixteenPlus) },
    });
    expect(buttons('Add another range')).toHaveLength(0);
  });

  it('asks for a specific age and its period, and for other ages in words', () => {
    renderPage({
      values: { ...empty, specificAge: '5', specificAgeUnit: 'weeks', ageDetail: 'Year 6' },
    });

    expect(field('Age').value).toBe('5');
    expect(field('Periods for age').value).toBe('weeks');
    // Side by side, as the limits of a range are.
    expect(field('Age').closest('.fphd-field-row')).toBe(
      field('Periods for age').closest('.fphd-field-row'),
    );
    expect(screen.getByRole('textbox', { name: 'Other' })).toHaveProperty('value', 'Year 6');
  });

  it('lets Enter in a field continue rather than add or remove a range', () => {
    const { container } = renderPage({ values: { ...empty, ageRanges: [sixteenPlus, blank] } });

    const first = container.querySelector('form button');

    expect(first?.textContent).toBe('Continue');
    expect(first?.getAttribute('name')).toBeNull();
  });

  it('links each refusal to its field, in the order the page asks', () => {
    renderPage({
      values: { ...empty, ageType: 'range', ageRanges: [blank, blank] },
      fieldErrors: {
        ageDetail: 'Enter the ages included',
        [ageRangeFieldName(1, 'lowerLimit')]:
          'You must enter at least a lower or upper limit for range 2',
        ageType: 'Select the age type',
        [ageRangeFieldName(0, 'upperLimitUnit')]: 'Select the periods for the upper limit',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Select the age type', `#${screen.getByRole('radio', { name: 'All ages' }).id}`],
      ['Select the periods for the upper limit', `#${field('Periods for upper limit').id}`],
      [
        'You must enter at least a lower or upper limit for range 2',
        `#${field('Lower limit of range 2').id}`,
      ],
      ['Enter the ages included', `#${screen.getByRole('textbox', { name: 'Other' }).id}`],
    ]);
  });

  it('shows a refusal of the ranges as a whole at the first range', () => {
    renderPage({ fieldErrors: { ageRanges: 'You cannot add more than 20 ranges' } });

    const lower = field('Lower limit');

    expect(within(screen.getByRole('alert')).getByRole('link').getAttribute('href')).toBe(
      `#${lower.id}`,
    );
    expect(lower.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(lower.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('You cannot add more than 20 ranges');
  });
});
