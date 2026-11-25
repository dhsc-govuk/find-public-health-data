import { type Browser, expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { completeDraft, shownVersion, submitDraft } from '../support/complete-draft.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { PUBLISHER, SECOND_TEAM_A_PUBLISHER, TEAM_B_PUBLISHER } from '../support/sign-in.ts';

const DISCARDED = 'Draft discarded.';
const ALREADY_DISCARDED = 'This draft has already been discarded.';
const NOT_DISCARDED = 'This draft can no longer be discarded.';
const CHANGED =
  'This draft has changed since you opened the page. Check the changes, then try again.';

test.use({ storageState: PUBLISHER.storageState });

function overviewPath(id: string) {
  return `/dashboard/indicators/${id}`;
}

function discardPath(id: string) {
  return `/publish/indicators/${id}/discard-draft`;
}

function discardLink(page: Page) {
  return page.getByRole('link', { name: 'Discard draft' });
}

function discardButton(page: Page) {
  return page.getByRole('button', { name: 'Discard draft' });
}

/** The dashboard's matches for the name, in either of a publisher's tables. */
async function expectListed(page: Page, name: string, count: number) {
  await page.goto(`/dashboard?search=${encodeURIComponent(name)}`);
  await expect(page.getByRole('link', { name, includeHidden: true })).toHaveCount(count);
}

/** Opens a page as a user of their own, in a browser context closed after `act`. */
async function asUser(browser: Browser, storageState: string, act: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ storageState });
  try {
    await act(await context.newPage());
  } finally {
    await context.close();
  }
}

test("discarding a new indicator's draft, through the confirmation page, deletes the indicator", async ({
  page,
}, testInfo) => {
  const name = uniqueIndicatorName('discard');
  const id = await createDraft(page, name);
  await expectListed(page, name, 1);

  await page.goto(overviewPath(id));
  await discardLink(page).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Are you sure you want to discard this draft?' }),
  ).toBeVisible();
  await expect(
    page.getByText('This indicator will be deleted. You cannot undo this.'),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
  await discardButton(page).click();

  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('alert', { name: 'Success' })).toContainText(DISCARDED);
  await expectNoAccessibilityViolations(page, testInfo);
  await expectListed(page, name, 0);

  for (const path of [
    overviewPath(id),
    `${overviewPath(id)}/preview`,
    discardPath(id),
    `/publish/indicators/${id}/task-list`,
    `/publish/indicators/${id}/polarity`,
    `/publish/indicators/${id}/data-table/check`,
    `/publish/indicators/${id}/data-table/values?column=areaCode`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test('the confirmation page cancels back to the overview', async ({ page }) => {
  const id = await createDraft(page, uniqueIndicatorName('discard cancelled'));
  await page.goto(discardPath(id));

  await page.getByRole('link', { name: 'Cancel' }).click();

  await expect(page).toHaveURL(overviewPath(id));
  await expect(discardLink(page)).toBeVisible();
});

test('a second copy of the page says on the dashboard that the draft has already been discarded', async ({
  page,
  context,
}) => {
  const id = await createDraft(page, uniqueIndicatorName('discard repeated'));
  const copy = await context.newPage();
  await copy.goto(discardPath(id));
  await page.goto(discardPath(id));
  await discardButton(page).click();
  await expect(page).toHaveURL('/dashboard');

  await discardButton(copy).click();

  await expect(copy).toHaveURL('/dashboard');
  await expect(copy.getByRole('region', { name: 'Important' })).toContainText(ALREADY_DISCARDED);
});

test('two teammates discarding a new indicator at once both land on the dashboard, and only one is told it was discarded', async ({
  page,
  browser,
}) => {
  const id = await createDraft(page, uniqueIndicatorName('discard overlapping'));
  await page.goto(discardPath(id));
  await asUser(browser, SECOND_TEAM_A_PUBLISHER.storageState, async (teammate) => {
    await teammate.goto(discardPath(id));

    await Promise.all([discardButton(page).click(), discardButton(teammate).click()]);

    const banners = [];
    for (const user of [page, teammate]) {
      await expect(user).toHaveURL('/dashboard');
      banners.push(await user.locator('.govuk-notification-banner__content').innerText());
      // The message is not kept for the next page.
      await user.goto('/dashboard');
      await expect(user.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(user.locator('.govuk-notification-banner')).toHaveCount(0);
    }
    expect(banners.sort()).toEqual([DISCARDED, ALREADY_DISCARDED]);
  });
});

test('a draft a teammate has discarded has already been discarded', async ({ page, browser }) => {
  const id = await createDraft(page, uniqueIndicatorName('discard by teammate'));
  await page.goto(discardPath(id));
  await asUser(browser, SECOND_TEAM_A_PUBLISHER.storageState, async (teammate) => {
    await teammate.goto(discardPath(id));
    await discardButton(teammate).click();
    await expect(teammate).toHaveURL('/dashboard');
  });

  await discardButton(page).click();

  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('region', { name: 'Important' })).toContainText(ALREADY_DISCARDED);
});

test('a draft edited since the page was opened is not discarded', async ({ page }) => {
  const id = await createDraft(page, uniqueIndicatorName('discard edited'));
  await page.goto(discardPath(id));
  const polarityPath = `/publish/indicators/${id}/polarity`;
  await page.request.post(polarityPath, {
    form: { polarity: 'higher-is-better', version: await shownVersion(page, polarityPath) },
    maxRedirects: 0,
  });

  await discardButton(page).click();

  await expect(page).toHaveURL(overviewPath(id));
  await expect(page.getByRole('region', { name: 'Important' })).toContainText(CHANGED);
  await discardLink(page).click();
  await discardButton(page).click();
  await expect(page).toHaveURL('/dashboard');
});

test('the name of a discarded indicator can be used again', async ({ page }) => {
  const name = uniqueIndicatorName('discard reused');
  await page.goto(discardPath(await createDraft(page, name)));
  await discardButton(page).click();
  await expect(page).toHaveURL('/dashboard');

  await createDraft(page, name);

  await expectListed(page, name, 1);
});

test('a submitted draft is discarded only once it is withdrawn', async ({ page }) => {
  const name = uniqueIndicatorName('discard withdrawn');
  const id = await createDraft(page, name);
  await completeDraft(page, id);
  const open = await page.context().newPage();
  await open.goto(discardPath(id));
  await submitDraft(page, id);

  await expect(discardLink(page)).toHaveCount(0);
  await discardButton(open).click();
  await expect(open).toHaveURL(overviewPath(id));
  await expect(open.getByRole('region', { name: 'Important' })).toContainText(NOT_DISCARDED);
  await page.goto(discardPath(id));
  await expect(page).toHaveURL(overviewPath(id));
  await expect(page.getByRole('region', { name: 'Important' })).toContainText(NOT_DISCARDED);

  await page.getByRole('link', { name: 'Withdraw submission' }).click();
  await page.getByRole('button', { name: 'Withdraw submission' }).click();
  await expect(page).toHaveURL(overviewPath(id));
  await discardLink(page).click();
  await discardButton(page).click();
  await expect(page).toHaveURL('/dashboard');
  await expectListed(page, name, 0);
});

test('a publisher in another team sees the indicator but cannot discard its draft', async ({
  page,
  browser,
}) => {
  const id = await createDraft(page, uniqueIndicatorName('discard other team'));

  await asUser(browser, TEAM_B_PUBLISHER.storageState, async (otherTeam) => {
    await otherTeam.goto(overviewPath(id));
    await expect(discardLink(otherTeam)).toHaveCount(0);
    expect((await otherTeam.goto(discardPath(id)))?.status()).toBe(404);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('discards a draft', async ({ page }) => {
    const id = await createDraft(page, uniqueIndicatorName('discard without JavaScript'));
    await page.goto(overviewPath(id));
    await discardLink(page).click();
    await discardButton(page).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText(DISCARDED)).toBeVisible();
  });
});
