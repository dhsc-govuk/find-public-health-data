import { type Browser, expect, type Page } from '@playwright/test';

import { approvedIndicator, asUser } from './review-response.ts';
import { ADMIN } from './sign-in.ts';
import { ukDateTime } from './uk-date-time.ts';
import { PUBLIC_WEB_URL } from './web-urls.ts';

export const MINUTE = 60_000;

// The confirm publication date page refuses a time that is not in the future. A test leaves
// itself at least 15 seconds to fill in and submit that form before the publication time arrives.
const LEAST_NOTICE = 15_000;

/** The first whole minute after `now` that is at least `LEAST_NOTICE` away, in milliseconds. */
export function nextPublicationTime(now: number) {
  const next = (Math.floor(now / MINUTE) + 1) * MINUTE;
  return next - now < LEAST_NOTICE ? next + MINUTE : next;
}

/**
 * Confirms the indicator's publication date and time as `at`, through the confirm publication
 * date form an admin uses. The form takes the date and time in UK time.
 */
export async function confirmPublicationAt(page: Page, id: string, at: number) {
  const { day, month, year, hour, minute } = ukDateTime(new Date(at));
  const field = (group: 'Date' | 'Time', label: string) =>
    page.getByRole('group', { name: group }).getByLabel(label, { exact: true });

  await page.goto(`/dashboard/indicators/${id}`);
  await page.getByRole('button', { name: 'Confirm publication date' }).click();
  await field('Date', 'Day').fill(day);
  await field('Date', 'Month').fill(month);
  await field('Date', 'Year').fill(year);
  await field('Time', 'Hour').fill(hour);
  await field('Time', 'Minute').fill(minute);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
}

/** The public page of an indicator named `name`, at the slug its name gives it. */
export function publicIndicatorUrl(name: string) {
  return `${PUBLIC_WEB_URL}/indicator/${name.toLowerCase().replaceAll(' ', '-')}`;
}

/**
 * Waits for the indicator's public page to answer, which it does once the internal worker has
 * published it. The worker sweeps one second past each minute, so it should publish the
 * indicator about a second after `publishAt`. Waiting 65 seconds also covers the following
 * sweep, in case the first one misses the indicator.
 */
export async function waitForPublication(page: Page, name: string, publishAt: number) {
  await expect
    .poll(async () => (await page.request.get(publicIndicatorUrl(name))).status(), {
      timeout: publishAt + 65_000 - Date.now(),
      intervals: [1_000],
    })
    .toBe(200);
}

/**
 * A new indicator in the publisher's team that the internal worker has published, for specs
 * that start from a live indicator. It is approved, then the admin confirms its publication for
 * the next whole minute. Only the publishing project may use it, with the worker running, and it
 * takes up to about two and a half minutes.
 */
export async function publishedIndicator(browser: Browser, label: string) {
  const indicator = await approvedIndicator(browser, label);
  const publishAt = nextPublicationTime(Date.now());

  await asUser(browser, ADMIN, async (page) => {
    await confirmPublicationAt(page, indicator.id, publishAt);
    await waitForPublication(page, indicator.name, publishAt);
  });

  return indicator;
}
