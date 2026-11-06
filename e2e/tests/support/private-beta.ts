import { join } from 'node:path';

import { expect, type Page } from '@playwright/test';

/** The invitee in `.env.example` and CI's e2e stack. */
export const INVITEE_EMAIL = 'developer@example.com';

/** The browser state of the invitee's access, which private-beta.setup.ts saves once a run. */
export const INVITEE_STORAGE_STATE = join(
  import.meta.dirname,
  '..',
  '..',
  '.auth',
  'private-beta.json',
);

/** Nobody signed in, for a test of what the private beta shows everyone else. */
export const NO_ACCESS = { cookies: [], origins: [] };

/** Asks for a sign-in link on the page already on screen. */
export async function requestLink(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
}

/** Follows the link the page shows in place of an email, as it does with no email service. */
export async function followShownLink(page: Page) {
  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/private-beta'));
}
