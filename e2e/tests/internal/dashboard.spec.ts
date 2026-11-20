import { expect, type Locator, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { assignReviewers } from '../support/assign-reviewers.ts';
import { submitNewIndicator } from '../support/complete-draft.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { approvedIndicator } from '../support/review-response.ts';
import {
  ADMIN,
  IMRG_MANAGER,
  IMRG_REVIEWER,
  PUBLISHER,
  PUBLISHER_AND_REVIEWER,
  SECOND_TEAM_A_PUBLISHER,
  TEAM_B_PUBLISHER,
} from '../support/sign-in.ts';

test.use({ storageState: PUBLISHER.storageState });

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard');
});

const YOUR_TEAMS = "Your teams' indicators";
const ALL_OTHER = 'All other indicators';

/** A publisher's tab of the indicators in their teams. */
function yourTeams(page: Page) {
  return page.getByRole('tabpanel', { name: YOUR_TEAMS });
}

test('tags a new indicator as new with an incomplete draft', async ({ page }) => {
  const name = uniqueIndicatorName('dashboard');
  await createDraft(page, name);
  await page.goto('/dashboard');

  const row = yourTeams(page).getByRole('table').getByRole('row').filter({ hasText: name });

  // The column headers name the two statuses, so the tags carry no hidden prefix here.
  await expect(row.locator('.govuk-tag')).toHaveText(['New', 'Incomplete']);
});

test('names the team, the creator and the last editor of a new indicator', async ({ page }) => {
  const name = uniqueIndicatorName('dashboard');
  await createDraft(page, name);
  await page.goto('/dashboard');

  const row = yourTeams(page).getByRole('table').getByRole('row').filter({ hasText: name });

  await expect(row.getByRole('cell').nth(0)).toHaveText('Team A');
  await expect(row.getByRole('cell').nth(1)).toHaveText(PUBLISHER.name);
  await expect(row.getByRole('cell').nth(3)).toHaveText(PUBLISHER.name);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('as a publisher whose team holds no indicators', () => {
  test.use({ storageState: TEAM_B_PUBLISHER.storageState });

  test("offers Your teams' indicators, open, then All other indicators", async ({ page }) => {
    await expect(page.getByRole('tab')).toHaveText([YOUR_TEAMS, ALL_OTHER]);
    await expect(page.getByRole('tab', { name: YOUR_TEAMS })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test("shows a publisher only their own teams' indicators under Your teams' indicators", async ({
    page,
  }) => {
    await expect(
      yourTeams(page).getByText('There are no indicators for you to see yet.'),
    ).toBeVisible();
    await expect(
      yourTeams(page).getByRole('button', { name: 'Create new indicator' }),
    ).toBeVisible();
  });

  test("lists another team's indicator under All other indicators, linked to its overview", async ({
    browser,
    page,
  }, testInfo) => {
    const teamA = await browser.newContext({ storageState: PUBLISHER.storageState });
    const name = uniqueIndicatorName('all other');
    const id = await createDraft(await teamA.newPage(), name);
    await teamA.close();

    await page.goto('/dashboard');
    await page.getByRole('tab', { name: ALL_OTHER }).click();
    await expect(page).toHaveURL(/[?&]tab=all-other/);

    const panel = page.getByRole('tabpanel', { name: ALL_OTHER });
    const row = panel.getByRole('table').getByRole('row').filter({ hasText: name });

    await expect(panel.getByRole('button', { name: 'Create new indicator' })).toHaveCount(0);
    await expect(row.getByRole('cell').nth(0)).toHaveText('Team A');
    await expect(row.getByRole('cell').nth(1)).toHaveText(PUBLISHER.name);
    await expect(row.locator('.govuk-tag')).toHaveText(['New', 'Incomplete']);
    await expectNoAccessibilityViolations(page, testInfo);

    await row.getByRole('link', { name }).click();

    await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
  });

  // The seed holds more indicators than one page, none of them in Team B.
  test("pages through other teams' indicators on their own tab", async ({ page }) => {
    await page.getByRole('tab', { name: ALL_OTHER }).click();
    const panel = page.getByRole('tabpanel', { name: ALL_OTHER });

    await panel.getByRole('link', { name: 'Next page' }).click();

    await expect(page).toHaveURL('/dashboard?otherPage=2&tab=all-other');
    await expect(page.getByRole('tab', { name: ALL_OTHER })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(panel.getByRole('table').getByRole('row').nth(1)).toBeVisible();
  });
});

test.describe('as an admin, who sees every team', () => {
  test.use({ storageState: ADMIN.storageState });

  test.beforeEach(async ({ page }) => {
    await page.getByRole('tab', { name: 'All indicators' }).click();
  });

  // The seed holds more indicators than one page, all in Fingertips, and specs only add to it.
  test('lists a page of indicators', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Indicators' })).toBeVisible();

    const rows = page.getByRole('table').getByRole('row');

    await expect(rows).toHaveCount(11);
    await expect(rows.first().getByRole('columnheader')).toHaveText([
      'Indicator name',
      'Team',
      'Created by',
      'Last edited',
      'Last edited by',
      'Indicator status',
      'Publishing status',
    ]);
  });

  test('moves between pages', async ({ page }) => {
    await page.getByRole('link', { name: 'Next page' }).click();

    await expect(page).toHaveURL('/dashboard?page=2&tab=all-indicators');
    await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible();

    await page.getByRole('link', { name: 'Previous page' }).click();

    await expect(page).toHaveURL('/dashboard?tab=all-indicators');
  });

  test('offers an admin no create action', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create new indicator' })).toHaveCount(0);
  });
});

test.describe('as an admin, scheduling publication', () => {
  test.use({ storageState: ADMIN.storageState });

  function scheduledRow(page: Page, name: string) {
    return page
      .getByRole('table', { name: 'Scheduled indicators, soonest publication date first' })
      .getByRole('row')
      .filter({ hasText: name });
  }

  test('the Scheduled indicators tab comes first and lists an approved indicator, pending scheduling then publishing scheduled', async ({
    browser,
    page,
  }, testInfo) => {
    const { id, name } = await approvedIndicator(browser, 'scheduled tab');
    await page.goto('/dashboard');

    await expect(page.getByRole('tab')).toHaveText([
      /^Scheduled indicators \(\d+\)$/,
      /^Update decision needed( \(\d+\))?$/,
      'All indicators',
    ]);
    await expect(page.getByRole('tab', { name: /^Scheduled indicators/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(scheduledRow(page, name).locator('.govuk-tag')).toHaveText([
      'New',
      'Pending scheduling',
    ]);
    await expectNoAccessibilityViolations(page, testInfo);

    await scheduledRow(page, name).getByRole('link', { name }).click();
    await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
    await page.getByRole('button', { name: 'Confirm publication date' }).click();
    await page
      .getByRole('group', { name: 'Date' })
      .getByLabel('Year')
      .fill(String(new Date().getFullYear() + 2));
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.goto('/dashboard');

    await expect(scheduledRow(page, name).locator('.govuk-tag')).toHaveText([
      'New',
      'Publishing scheduled',
    ]);
  });
});

test.describe('as an IMRG manager', () => {
  test.use({ storageState: IMRG_MANAGER.storageState });

  test('shows the indicators under review, with a tab each for unassigned and assigned', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Indicators under review' }),
    ).toBeVisible();
    await expect(page.getByRole('tab')).toHaveText([
      'Unassigned indicators',
      'Assigned indicators',
    ]);
    await expect(page.getByRole('button', { name: 'Create new indicator' })).toHaveCount(0);
  });

  test('lists a submitted indicator as unassigned, linked to its overview', async ({
    browser,
    page,
  }, testInfo) => {
    const name = uniqueIndicatorName('under review');
    const id = await submitNewIndicator(browser, name);

    await page.goto('/dashboard');
    const row = page
      .getByRole('table', { name: 'Unassigned indicators, oldest submission first' })
      .getByRole('row')
      .filter({ hasText: name });

    await expect(row.locator('.govuk-tag')).toHaveText(['New', 'Pending review']);
    await expectNoAccessibilityViolations(page, testInfo);

    await row.getByRole('link', { name }).click();

    await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
  });
});

test.describe('as an IMRG reviewer', () => {
  test.use({ storageState: IMRG_REVIEWER.storageState });

  /** The named indicator's row in the reviewer's table. */
  function reviewRow(page: Page, name: string) {
    return page
      .getByRole('table', { name: 'Indicators to review, oldest submission first' })
      .getByRole('row')
      .filter({ hasText: name });
  }

  test('shows an IMRG reviewer the indicators assigned to them, without tabs', async ({
    browser,
    page,
  }, testInfo) => {
    const name = uniqueIndicatorName('to review');
    const id = await submitNewIndicator(browser, name);
    await assignReviewers(browser, id, [IMRG_REVIEWER.name, PUBLISHER_AND_REVIEWER.name]);

    await page.goto('/dashboard');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Indicators under review' }),
    ).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    const row = reviewRow(page, name);
    await expect(row.getByRole('listitem')).toHaveText([
      IMRG_REVIEWER.name,
      PUBLISHER_AND_REVIEWER.name,
    ]);
    await expect(row.locator('.govuk-tag')).toHaveText(['New', 'Pending review']);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('an assigned reviewer opens the indicator overview, with the review response to submit', async ({
    browser,
    page,
  }, testInfo) => {
    const name = uniqueIndicatorName('reviewer overview');
    const id = await submitNewIndicator(browser, name);
    await assignReviewers(browser, id, [IMRG_REVIEWER.name]);

    await page.goto('/dashboard');
    await reviewRow(page, name).getByRole('link', { name }).click();

    await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Review' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit review response' })).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test("a reviewer can't open an indicator assigned to someone else", async ({ browser, page }) => {
    const name = uniqueIndicatorName('not assigned');
    const id = await submitNewIndicator(browser, name);
    await assignReviewers(browser, id, [PUBLISHER_AND_REVIEWER.name]);

    await page.goto('/dashboard');
    await expect(reviewRow(page, name)).toHaveCount(0);

    const response = await page.goto(`/dashboard/indicators/${id}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});

test.describe('as an IMRG reviewer who publishes', () => {
  test.use({ storageState: PUBLISHER_AND_REVIEWER.storageState });

  test("offers a Review tab, then Your teams' indicators and All other indicators", async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Indicators' })).toBeVisible();
    // Other specs also assign indicators to this reviewer, so the count varies (none at zero).
    await expect(page.getByRole('tab')).toHaveText([/^Review( \(\d+\))?$/, YOUR_TEAMS, ALL_OTHER]);

    await page.getByRole('tab', { name: YOUR_TEAMS }).click();

    await expect(
      yourTeams(page).getByRole('button', { name: 'Create new indicator' }),
    ).toBeVisible();
  });
});

test.describe('searching the dashboard', () => {
  const SEARCH_LABEL = 'Search indicators by name or who created them';

  async function search(page: Page, text: string) {
    await page.getByRole('searchbox', { name: SEARCH_LABEL }).fill(text);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/[?&]search=/);
  }

  async function boxOf(locator: Locator) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    if (box === null) throw new Error('The element has no box on the page');
    return box;
  }

  function rowNames(page: Page) {
    return page.getByRole('table').locator('tbody tr').getByRole('rowheader');
  }

  test('narrows the list to the indicators whose name matches the search', async ({ page }) => {
    const wanted = uniqueIndicatorName('search quokka');
    await createDraft(page, wanted);
    await createDraft(page, uniqueIndicatorName('search wombat'));
    await page.goto('/dashboard');

    await search(page, wanted);

    await expect(rowNames(page)).toHaveText([wanted]);
    await expect(page.getByRole('searchbox', { name: SEARCH_LABEL })).toHaveValue(wanted);
  });

  test('narrows the list to the indicators whose creator matches the search', async ({ page }) => {
    const name = uniqueIndicatorName('search creator');
    await createDraft(page, name);
    await page.goto('/dashboard');

    await search(page, `${name} ${PUBLISHER.name}`);
    await expect(rowNames(page)).toHaveText([name]);

    await search(page, `${name} ${SECOND_TEAM_A_PUBLISHER.name}`);
    await expect(yourTeams(page).getByText('No indicators match your search.')).toBeVisible();
  });

  test('says no indicators match a search that finds none, on both tabs', async ({
    page,
  }, testInfo) => {
    await search(page, uniqueIndicatorName('search nothing'));

    await expect(yourTeams(page).getByText('No indicators match your search.')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.getByRole('tab', { name: ALL_OTHER }).click();
    await expect(
      page.getByRole('tabpanel', { name: ALL_OTHER }).getByText('No indicators match your search.'),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('Clear search returns the list to all indicators', async ({ page }) => {
    const name = uniqueIndicatorName('search clear');
    await createDraft(page, name);
    await page.goto('/dashboard');
    await search(page, uniqueIndicatorName('search clear nothing'));
    await expect(yourTeams(page).getByText('No indicators match your search.')).toBeVisible();

    await page.getByRole('link', { name: 'Clear search' }).click();

    await expect(page).not.toHaveURL(/[?&]search=/);
    await expect(page.getByRole('searchbox', { name: SEARCH_LABEL })).toHaveValue('');
    await expect(page.getByText('No indicators match your search.')).toHaveCount(0);
    await expect(rowNames(page).filter({ hasText: name })).toHaveCount(1);
  });

  test('Clear search empties a search that was typed but not sent', async ({ page }) => {
    const searchbox = page.getByRole('searchbox', { name: SEARCH_LABEL });
    await searchbox.fill(uniqueIndicatorName('search clear unsent'));

    await page.getByRole('link', { name: 'Clear search' }).click();

    await expect(searchbox).toHaveValue('');
  });

  test('puts Clear search beside the Search button on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const button = await boxOf(page.getByRole('button', { name: 'Search' }));
    const clear = await boxOf(page.getByRole('link', { name: 'Clear search' }));

    expect(clear.x).toBeGreaterThanOrEqual(button.x + button.width);
    expect(clear.y).toBeGreaterThanOrEqual(button.y);
    expect(clear.y + clear.height).toBeLessThanOrEqual(button.y + button.height);
  });

  test('puts Clear search on its own line under the search on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const form = await boxOf(page.getByRole('search').locator('form'));
    const searchbox = await boxOf(page.getByRole('searchbox', { name: SEARCH_LABEL }));
    const button = await boxOf(page.getByRole('button', { name: 'Search' }));
    const clear = await boxOf(page.getByRole('link', { name: 'Clear search' }));

    expect(searchbox.width).toBe(form.width);
    expect(clear.y).toBeGreaterThanOrEqual(searchbox.y + searchbox.height);
    expect(clear.y).toBeGreaterThanOrEqual(button.y + button.height);
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('narrows the list to the matches of the search', async ({ page }) => {
      const wanted = uniqueIndicatorName('search no js');
      await createDraft(page, wanted);
      await page.goto('/dashboard');

      await search(page, wanted);

      await expect(rowNames(page)).toHaveText([wanted]);
    });

    test('Clear search returns the list to all indicators', async ({ page }) => {
      const name = uniqueIndicatorName('search clear no js');
      await createDraft(page, name);
      await page.goto('/dashboard');
      await search(page, uniqueIndicatorName('search clear no js nothing'));

      await page.getByRole('link', { name: 'Clear search' }).click();

      await expect(page).not.toHaveURL(/[?&]search=/);
      await expect(page.getByRole('searchbox', { name: SEARCH_LABEL })).toHaveValue('');
      await expect(rowNames(page).filter({ hasText: name })).toHaveCount(1);
    });
  });

  test.describe('as an IMRG reviewer who publishes', () => {
    test.use({ storageState: PUBLISHER_AND_REVIEWER.storageState });

    test('keeps the open tab after a search', async ({ page }) => {
      await page.getByRole('tab', { name: YOUR_TEAMS }).click();
      await expect(page).toHaveURL(/[?&]tab=your-teams/);

      await search(page, uniqueIndicatorName('search tab'));

      await expect(page).toHaveURL(/[?&]tab=your-teams/);
      await expect(page.getByRole('tab', { name: YOUR_TEAMS })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(yourTeams(page).getByText('No indicators match your search.')).toBeVisible();
    });

    test('keeps the open tab after Clear search', async ({ page }) => {
      await page.getByRole('tab', { name: ALL_OTHER }).click();
      await search(page, uniqueIndicatorName('search clear tab'));

      await page.getByRole('link', { name: 'Clear search' }).click();

      await expect(page).not.toHaveURL(/[?&]search=/);
      await expect(page).toHaveURL(/[?&]tab=all-other/);
      await expect(page.getByRole('tab', { name: ALL_OTHER })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });
});
