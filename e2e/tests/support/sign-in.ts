import { join } from 'node:path';

import type { Page } from '@playwright/test';

const SESSIONS_DIR = join(import.meta.dirname, '..', '..', '.auth');

/**
 * An internal user and the browser state of their session, which sign-in.setup.ts saves once a
 * run for specs to start from with `test.use({ storageState })`. Every spec shares the session, so
 * a test that signs out signs in for itself first.
 */
type SignedInUser = { name: string; storageState: string };

export const PUBLISHER: SignedInUser = {
  name: 'Sam Taylor',
  storageState: join(SESSIONS_DIR, 'publisher.json'),
};

/** A publisher in Team B, which holds none of the seeded indicators. */
export const TEAM_B_PUBLISHER: SignedInUser = {
  name: 'Jordan Lee',
  storageState: join(SESSIONS_DIR, 'team-b-publisher.json'),
};

/** A publisher in Teams A and B, who chooses a new indicator's team. */
export const TEAMS_A_AND_B_PUBLISHER: SignedInUser = {
  name: 'Casey Patel',
  storageState: join(SESSIONS_DIR, 'teams-a-and-b-publisher.json'),
};

export const IMRG_MANAGER: SignedInUser = {
  name: 'Avery Clarke',
  storageState: join(SESSIONS_DIR, 'imrg-manager.json'),
};

/** An IMRG reviewer who does not publish. */
export const IMRG_REVIEWER: SignedInUser = {
  name: 'Jamie Evans',
  storageState: join(SESSIONS_DIR, 'imrg-reviewer.json'),
};

/** An IMRG reviewer who also publishes, in Team C. */
export const PUBLISHER_AND_REVIEWER: SignedInUser = {
  name: 'Morgan Hughes',
  storageState: join(SESSIONS_DIR, 'publisher-and-reviewer.json'),
};

export const ADMIN: SignedInUser = {
  name: 'Riley Singh',
  storageState: join(SESSIONS_DIR, 'admin.json'),
};

/** Submits the fake sign-in form already on screen and waits for the redirect away from it. */
export async function submitSignIn(page: Page, name: string) {
  await page.getByRole('radio', { name }).check();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname !== '/sign-in');
}

/** Signs in from the sign-in page; where the app sends the user next is the app's business. */
export async function signInAs(page: Page, name: string) {
  await page.goto('/sign-in');
  await submitSignIn(page, name);
}
