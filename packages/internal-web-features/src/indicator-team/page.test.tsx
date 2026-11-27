// @vitest-environment jsdom
import { TEAM_IDS } from '@fphd/auth';
import { firstRadioId, serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { IndicatorTeamPage } from './page.tsx';

afterEach(cleanup);

const QUESTION = 'Which of your teams should own this indicator?';

const teams = [
  { id: TEAM_IDS.teamA, name: 'Team A' },
  { id: TEAM_IDS.teamB, name: 'Team B' },
];

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof IndicatorTeamPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <IndicatorTeamPage teams={teams} {...props} />
    </MemoryRouter>,
  );
}

describe('IndicatorTeamPage', () => {
  it('asks the question as the page heading, which also names the group of options', () => {
    renderPage();

    const heading = screen.getByRole('heading', { level: 1, name: QUESTION });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading.closest('legend')).not.toBeNull();
    expect(screen.getByRole('group', { name: QUESTION })).toBeTruthy();
    expect(document.title).toBe(`${QUESTION} - ${serviceName} - GOV.UK`);
  });

  it('offers each team by name, none chosen, and posts back to its own page', () => {
    const { container } = renderPage();

    const radios = within(screen.getByRole('group')).getAllByRole('radio') as HTMLInputElement[];

    expect(radios.map((radio) => radio.labels?.[0]?.textContent)).toEqual(['Team A', 'Team B']);
    expect(radios.map((radio) => radio.value)).toEqual([TEAM_IDS.teamA, TEAM_IDS.teamB]);
    expect(radios.some((radio) => radio.checked)).toBe(false);
    expect(container.querySelector('form')?.getAttribute('method')).toBe('post');
    expect(container.querySelector('form')?.getAttribute('action')).toBe('/');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('asks for a team in the summary, linked to the first option, and against the question', () => {
    renderPage({ fieldErrors: { team: 'Select which team should own this indicator' } });

    const summary = screen.getByRole('alert');

    expect(document.title).toBe(`Error: ${QUESTION} - ${serviceName} - GOV.UK`);
    expect(
      within(summary)
        .getByRole('link', { name: 'Select which team should own this indicator' })
        .getAttribute('href'),
    ).toBe(`#${firstRadioId('team')}`);
    expect(
      within(screen.getByRole('group')).getByText('Select which team should own this indicator'),
    ).toBeTruthy();
  });
});
