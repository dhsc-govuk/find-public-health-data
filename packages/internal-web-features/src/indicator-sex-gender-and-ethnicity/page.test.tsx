// @vitest-environment jsdom
import type { SexGenderAndEthnicityFormValues } from '@fphd/internal-api-features/contract';
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal } from '../testing.ts';
import { SexGenderAndEthnicityPage } from './page.tsx';

afterEach(cleanup);

const TITLE = 'Sex, gender and ethnicity';

const empty: SexGenderAndEthnicityFormValues = {
  demographics: [],
  sexes: [],
  genders: [],
  ethnicGroups: [],
};

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof SexGenderAndEthnicityPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <SexGenderAndEthnicityPage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function boxesIn(group: string) {
  return within(screen.getByRole('group', { name: group })).getAllByRole(
    'checkbox',
  ) as HTMLInputElement[];
}

function shown(boxes: HTMLInputElement[]) {
  return boxes.map((box) => [box.name, box.value, box.labels?.[0]?.textContent, box.checked]);
}

describe('SexGenderAndEthnicityPage', () => {
  it('heads the page with its title and asks each question as a group', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
    expect(
      screen.getByRole('heading', { level: 2, name: 'What was collected for this indicator?' }),
    ).toBeTruthy();
    for (const group of [
      'What was collected for this indicator?',
      'Select included sexes',
      'Select included genders',
      'Select included ethnic groups',
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
      ['Select included sexes', true],
      ['Select included genders', false],
      ['Select included ethnic groups', true],
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

    expect(shown(boxesIn('Select included sexes'))).toEqual([
      ['sexes', 'persons', 'Person', true],
      ['sexes', 'females', 'Female', false],
      ['sexes', 'males', 'Male', true],
    ]);
    expect(shown(boxesIn('Select included genders'))).toEqual([
      ['genders', 'persons', 'Person', false],
      ['genders', 'women-and-girls', 'Woman or girl', false],
      ['genders', 'men-and-boys', 'Man or boy', false],
      ['genders', 'non-binary', 'Non-binary', true],
      ['genders', 'other', 'Other', false],
      ['genders', 'prefer-not-to-say', 'Prefer not to say', false],
    ]);
    expect(shown(boxesIn('Select included ethnic groups'))).toEqual([
      ['ethnicGroups', 'asian', 'Asian, Asian British or Asian Welsh', false],
      ['ethnicGroups', 'black', 'Black, Black British, Black Welsh, Caribbean or African', true],
      ['ethnicGroups', 'mixed', 'Mixed or Multiple ethnic groups', false],
      ['ethnicGroups', 'white', 'White', false],
      ['ethnicGroups', 'other', 'Other ethnic group', true],
    ]);
  });

  it('links each refusal to its field, in the order the page asks', () => {
    renderPage({
      fieldErrors: {
        ethnicGroups: 'Select the ethnic groups included',
        sexes: 'Select the sexes included',
        demographics: 'Select what was collected for this indicator',
        genders: 'Select the genders included',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      [
        'Select what was collected for this indicator',
        `#${screen.getByRole('checkbox', { name: 'Sex' }).id}`,
      ],
      ['Select the sexes included', `#${boxesIn('Select included sexes')[0]?.id}`],
      ['Select the genders included', `#${boxesIn('Select included genders')[0]?.id}`],
      ['Select the ethnic groups included', `#${boxesIn('Select included ethnic groups')[0]?.id}`],
    ]);
  });
});
