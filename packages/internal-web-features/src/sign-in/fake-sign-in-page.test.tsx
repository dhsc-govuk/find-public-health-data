// @vitest-environment jsdom
import { FAKE_USER_IDS, fakeUsers, findFakeUser } from '@fphd/auth';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { fakeUserAccess, SignInPage } from './fake-sign-in-page.tsx';

afterEach(cleanup);

function access(id: string): string {
  const user = findFakeUser(id);
  if (user === undefined) throw new Error(`Missing fake user ${id}`);
  return fakeUserAccess(user);
}

describe('fakeUserAccess', () => {
  it.each([
    [FAKE_USER_IDS.publisherTeamA, 'Publisher in Team A.'],
    [FAKE_USER_IDS.publisherTeamsAAndB, 'Publisher in Team A and Team B.'],
    [FAKE_USER_IDS.publisherAndReviewer, 'Publisher in Team C. IMRG reviewer.'],
    [FAKE_USER_IDS.imrgManager, 'IMRG manager.'],
    [FAKE_USER_IDS.admin, 'Admin.'],
  ])('states the roles and teams of %s', (id, expected) => {
    expect(access(id)).toBe(expected);
  });
});

describe('SignInPage', () => {
  it("shows each fake user's roles and teams beside their name", () => {
    render(
      <MemoryRouter>
        <SignInPage returnTo="/" users={fakeUsers} />
      </MemoryRouter>,
    );

    const item = screen.getByRole('radio', { name: 'Casey Patel' }).closest('.govuk-radios__item');

    expect(item?.querySelector('.govuk-radios__hint')?.textContent).toBe(
      'Publisher in Team A and Team B.',
    );
    expect(screen.getByText('IMRG is the Indicator Methodology Review Group.')).toBeTruthy();
  });
});
