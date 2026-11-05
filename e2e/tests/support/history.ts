import { expect, type Page } from '@playwright/test';

/** Today as the History tab dates it. */
export function historyToday() {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London',
  }).format(new Date());
}

export function historyPanel(page: Page) {
  return page.locator('#history');
}

/** The history's entries, newest first. */
export function historyEntries(page: Page) {
  return historyPanel(page).getByRole('listitem');
}

/** Opens the indicator overview's History tab. */
export async function openHistory(page: Page, id: string) {
  await page.goto(`/dashboard/indicators/${id}`);
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'History' })).toBeVisible();
}
