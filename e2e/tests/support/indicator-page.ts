import { expect, type Page } from '@playwright/test';

/** The seeded indicator the specs drive, at the slug its published page is addressed by. */
export const MORTALITY_SLUG = 'under-75-mortality-rate-from-all-causes';
export const MORTALITY_PATH = `/indicator/${MORTALITY_SLUG}`;
export const MORTALITY_NAME = 'Under 75 mortality rate from all causes';
/** The seeded indicator's short id, which names it in a query such as `compareWith`. */
export const MORTALITY_SHORT_ID = 108;
/** The seed fixes indicator ids, so the publisher's pages for it have a stable address. */
export const MORTALITY_ID = '019fa38f-1346-7094-b773-79dcd43ae4b4';

/**
 * An accordion card, by the title its toggle button carries. Without JavaScript the button is
 * hidden and the title shows as text, so the match includes hidden buttons.
 */
export function filterCard(page: Page, title: string) {
  return page.locator('.fphd-filter-card', {
    has: page.getByRole('button', { name: title, exact: true, includeHidden: true }),
  });
}

/**
 * Opens an indicator page and waits until it is interactive. The search box is a plain
 * input until React has hydrated and the autocomplete loaded; driving the tabs or the
 * geography tree before then reaches the no-script fallbacks instead.
 */
export async function openIndicatorPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('tab', { name: 'Indicator', exact: true })).toBeVisible();
  await expect(page.locator('.govuk-tabs')).not.toHaveClass(/fphd-tabs--ssr/);
}
