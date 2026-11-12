// @vitest-environment jsdom
import {
  type AgeRangeFormValues,
  ageRangeFieldName,
  MAX_AGE_RANGES,
  type SexAndAgesFormValues,
} from '@fphd/internal-api-features/contract';
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal } from '../testing.ts';
import { SexAndAgesPage } from './page.tsx';

afterEach(cleanup);

const TITLE = 'Sex, gender and ethnicity';

const blank: AgeRangeFormValues = {
  lowerLimit: '',
  lowerLimitUnit: '',
  upperLimit: '',
  upperLimitUnit: '',
};
const sixteenPlus = { ...blank, lowerLimit: '16', lowerLimitUnit: 'years' };
const underFive = { ...blank, upperLimit: '4', upperLimitUnit: 'months' };

const empty: SexAndAgesFormValues = {
  demographics: [],
  sexes: [],
  genders: [],
  ethnicGroups: [],
  ageType: '',
  ageRanges: [blank],
  specificAge: '',
  specificAgeUnit: '',
  ageDetail: '',
};

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof SexAndAgesPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <SexAndAgesPage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function field(label: string) {
  return screen.getByLabelText(label, { exact: true }) as HTMLInputElement | HTMLSelectElement;
}

function boxesIn(group: string) {
  return within(screen.getByRole('group', { name: group })).getAllByRole(
    'checkbox',
  ) as HTMLInputElement[];
}

function shown(boxes: HTMLInputElement[]) {
  return boxes.map((box) => [box.name, box.value, box.labels?.[0]?.textContent, box.checked]);
}

function buttons(name: string | RegExp) {
  return screen.queryAllByRole('button', { name }) as HTMLButtonElement[];
}

describe('SexAndAgesPage', () => {
  it('heads the page with its title and asks each question as a group', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
    expect(
      screen.getByRole('heading', { level: 2, name: 'What was collected for this indicator?' }),
    ).toBeTruthy();
    for (const group of [
      'What was collected for this indicator?',
      'Enter included sexes',
      'Enter included genders',
      'Enter included ethnic groups',
      'Select age type',
    ]) {
      expect(screen.getByRole('group', { name: group })).toBeTruthy();
    }
  });

  it('asks what was collected, ticking those answered', () => {
    renderPage({ values: { ...empty, demographics: ['sex', 'ethnicity'] } });

    const group = screen.getByRole('group', { name: 'What was collected for this indicator?' });

    expect(within(group).getByText('Select all that apply')).toBeTruthy();
    expect(
      shown(boxesIn('What was collected for this indicator?')).filter(
        ([name]) => name === 'demographics',
      ),
    ).toEqual([
      ['demographics', 'sex', 'Sex', true],
      ['demographics', 'gender', 'Gender', false],
      ['demographics', 'ethnicity', 'Ethnicity', true],
    ]);
  });

  it('reveals the list of those included under each demographic', () => {
    renderPage({ values: { ...empty, demographics: ['gender'] } });

    // Hidden only once JavaScript runs, so a form without it shows every list.
    const reveals = ['Sex', 'Gender', 'Ethnicity'].map((name) => {
      const box = screen.getByRole('checkbox', { name });
      const reveal = document.getElementById(box.getAttribute('aria-controls') ?? '');
      return [reveal?.querySelector('legend')?.textContent, reveal?.className.includes('hidden')];
    });

    expect(reveals).toEqual([
      ['Enter included sexes', true],
      ['Enter included genders', false],
      ['Enter included ethnic groups', true],
    ]);
  });

  it('offers each sex, gender and ethnic group, ticking those answered', () => {
    renderPage({
      values: {
        ...empty,
        sexes: ['persons', 'males'],
        genders: ['non-binary'],
        ethnicGroups: ['black', 'other'],
      },
    });

    expect(shown(boxesIn('Enter included sexes'))).toEqual([
      ['sexes', 'persons', 'Person', true],
      ['sexes', 'females', 'Female', false],
      ['sexes', 'males', 'Male', true],
    ]);
    expect(shown(boxesIn('Enter included genders'))).toEqual([
      ['genders', 'persons', 'Person', false],
      ['genders', 'women-and-girls', 'Woman or girl', false],
      ['genders', 'men-and-boys', 'Man or boy', false],
      ['genders', 'non-binary', 'Non-binary', true],
      ['genders', 'other', 'Other', false],
      ['genders', 'prefer-not-to-say', 'Prefer not to say', false],
    ]);
    expect(shown(boxesIn('Enter included ethnic groups'))).toEqual([
      ['ethnicGroups', 'asian', 'Asian, Asian British or Asian Welsh', false],
      ['ethnicGroups', 'black', 'Black, Black British, Black Welsh, Caribbean or African', true],
      ['ethnicGroups', 'mixed', 'Mixed or Multiple ethnic groups', false],
      ['ethnicGroups', 'white', 'White', false],
      ['ethnicGroups', 'other', 'Other ethnic group', true],
    ]);
  });

  it('offers each age type, choosing the one answered', () => {
    renderPage({ values: { ...empty, ageType: 'specific' } });

    const radios = within(screen.getByRole('group', { name: 'Select age type' })).getAllByRole(
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

  it('numbers the limits from the second range, which alone can be removed', () => {
    renderPage({ values: { ...empty, ageType: 'range', ageRanges: [sixteenPlus, underFive] } });

    expect(field('Upper limit 2').value).toBe('4');
    expect(field('Periods for upper limit 2').value).toBe('months');
    expect(buttons(/^Remove range/).map((button) => [button.textContent, button.value])).toEqual([
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
        ethnicGroups: 'Select the ethnic groups included',
        sexes: 'Select the sexes included',
        demographics: 'Select what was collected for this indicator',
        genders: 'Select the genders included',
        [ageRangeFieldName(0, 'upperLimitUnit')]: 'Select the periods for the upper limit',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      [
        'Select what was collected for this indicator',
        `#${screen.getByRole('checkbox', { name: 'Sex' }).id}`,
      ],
      ['Select the sexes included', `#${boxesIn('Enter included sexes')[0]?.id}`],
      ['Select the genders included', `#${boxesIn('Enter included genders')[0]?.id}`],
      ['Select the ethnic groups included', `#${boxesIn('Enter included ethnic groups')[0]?.id}`],
      ['Select the periods for the upper limit', `#${field('Periods for upper limit').id}`],
      [
        'You must enter at least a lower or upper limit for range 2',
        `#${field('Lower limit 2').id}`,
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
