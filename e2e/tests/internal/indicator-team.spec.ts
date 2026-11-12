import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { uniqueIndicatorName } from '../support/create-indicator.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import { PUBLISHER, TEAMS_A_AND_B_PUBLISHER } from '../support/sign-in.ts';

const QUESTION = 'Which of your teams should own this indicator?';
const NAME_QUESTION = 'What is the name of the indicator?';
const TEAM_PATH = '/publish/indicators/new/team';

async function openTeamPage(page: Page) {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Create new indicator' }).click();
  await expect(page).toHaveURL(TEAM_PATH);
}

test.describe('as a publisher in two teams', () => {
  test.use({ storageState: TEAMS_A_AND_B_PUBLISHER.storageState });

  test('asks which team owns a new indicator before its name', async ({ page }) => {
    await openTeamPage(page);

    await expect(page.getByRole('heading', { level: 1, name: QUESTION })).toBeVisible();
    const options = page.getByRole('group', { name: QUESTION }).getByRole('radio');
    await expect(options).toHaveCount(2);
    await expect(page.getByLabel('Team A')).not.toBeChecked();
    await expect(page.getByLabel('Team B')).not.toBeChecked();
  });

  test('asks for a team when Continue is selected with none chosen', async ({ page }) => {
    await openTeamPage(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(TEAM_PATH);
    await expect(page).toHaveTitle(/^Error: /);
    const summary = page.getByRole('alert');
    await expect(summary.getByRole('link')).toHaveText([
      'Select which team should own this indicator',
    ]);

    await expectErrorSummaryReady(page);
    await summary.getByRole('link').click();
    await expect(page.getByLabel('Team A')).toBeFocused();
  });

  // Nothing is created in Team B, whose publisher's dashboard spec expects it to stay empty.
  test('carries the team chosen on to the name page', async ({ page }) => {
    await openTeamPage(page);
    await page.getByLabel('Team B').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/publish\/indicators\/new\?team=[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: NAME_QUESTION })).toBeVisible();
  });

  test('creates the indicator in the team chosen', async ({ page }) => {
    const name = uniqueIndicatorName('team');

    await openTeamPage(page);
    await page.getByLabel('Team A').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel(NAME_QUESTION).fill(name);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/publish\/indicators\/[0-9a-f-]{36}\/task-list$/);

    await page.goto('/dashboard');
    const row = page.getByRole('table').getByRole('row').filter({ hasText: name });
    await expect(row.getByRole('cell').nth(0)).toHaveText('Team A');
  });

  test('sends a publisher who names an indicator before choosing a team to choose', async ({
    page,
  }) => {
    await page.goto('/publish/indicators/new');

    await expect(page).toHaveURL(TEAM_PATH);
  });

  test('goes back to the dashboard', async ({ page }) => {
    await openTeamPage(page);
    await page.getByRole('link', { name: 'Back to indicators', exact: true }).click();

    await expect(page).toHaveURL('/dashboard');
  });

  test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
    await openTeamPage(page);

    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('has no WCAG 2.2 AA violations when the submission is rejected', async ({
    page,
  }, testInfo) => {
    await openTeamPage(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Select which team should own this indicator',
    );

    await expectNoAccessibilityViolations(page, testInfo);
  });
});

test.describe('as a publisher in one team', () => {
  test.use({ storageState: PUBLISHER.storageState });

  test('skips the team page, with no team to choose', async ({ page }) => {
    await page.goto(TEAM_PATH);

    await expect(page).toHaveURL('/publish/indicators/new');
    await expect(page.getByRole('heading', { level: 1, name: NAME_QUESTION })).toBeVisible();
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, storageState: TEAMS_A_AND_B_PUBLISHER.storageState });

  test('creates the indicator in the team chosen', async ({ page }) => {
    const name = uniqueIndicatorName('team');

    await openTeamPage(page);
    await page.getByLabel('Team A').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel(NAME_QUESTION).fill(name);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/publish\/indicators\/[0-9a-f-]{36}\/task-list$/);

    await page.goto('/dashboard');
    const row = page.getByRole('table').getByRole('row').filter({ hasText: name });
    await expect(row.getByRole('cell').nth(0)).toHaveText('Team A');
  });
});
