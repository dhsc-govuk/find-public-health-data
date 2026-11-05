import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import { historyEntries, historyToday, openHistory } from '../support/history.ts';
import { approvedIndicator, asUser } from '../support/review-response.ts';
import { ADMIN, IMRG_MANAGER, IMRG_REVIEWER, PUBLISHER } from '../support/sign-in.ts';

const CONFIRMED = 'Indicator publication date confirmed';
const IN_THE_PAST = 'Publishing date and time must be in the future';
const NEXT_YEAR = new Date().getFullYear() + 1;
// Far enough ahead that no scheduled publication falls due while the suite runs.
const CONFIRMED_YEAR = NEXT_YEAR + 1;
const CHANGED_YEAR = NEXT_YEAR + 2;

function overviewPath(id: string) {
  return `/dashboard/indicators/${id}`;
}

function publicationDatePath(id: string) {
  return `${overviewPath(id)}/publication-date`;
}

function publishingTag(page: Page) {
  return page.getByRole('main').locator('h1 ~ p .govuk-tag').nth(1);
}

function dateLine(page: Page) {
  return page.getByRole('main').locator('p:has(.govuk-tag) + p');
}

/** Types a date and time into the confirm page's fields. */
async function enterDate(page: Page, day: string, month: string, year: number | string) {
  const date = page.getByRole('group', { name: 'Date' });
  await date.getByLabel('Day').fill(day);
  await date.getByLabel('Month').fill(month);
  await date.getByLabel('Year').fill(String(year));
}

test.use({ storageState: ADMIN.storageState });

test('an admin confirms the publication date of an approved indicator, which shows it as Publishing scheduled', async ({
  browser,
  page,
}, testInfo) => {
  const { id } = await approvedIndicator(browser, 'confirm date');
  await page.goto(overviewPath(id));
  await expect(publishingTag(page)).toHaveText('Publishing status: Pending scheduling');
  await expect(dateLine(page)).toHaveText(
    `Proposed publication date: 1 April ${NEXT_YEAR} at 9:30am`,
  );

  await page.getByRole('button', { name: 'Confirm publication date' }).click();
  await expect(page).toHaveURL(publicationDatePath(id));
  await expect(
    page.getByRole('heading', { level: 1, name: 'Confirm publication date' }),
  ).toBeVisible();
  const date = page.getByRole('group', { name: 'Date' });
  await expect(date.getByLabel('Day')).toHaveValue('1');
  await expect(date.getByLabel('Month')).toHaveValue('4');
  await expect(date.getByLabel('Year')).toHaveValue(String(NEXT_YEAR));
  await expect(page.getByRole('group', { name: 'Time' }).getByLabel('Hour')).toHaveValue('09');
  await expectNoAccessibilityViolations(page, testInfo);

  await enterDate(page, '2', '4', CONFIRMED_YEAR);
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page).toHaveURL(overviewPath(id));
  await expect(page.getByRole('alert')).toContainText(CONFIRMED);
  await expect(publishingTag(page)).toHaveText('Publishing status: Publishing scheduled');
  await expect(dateLine(page)).toHaveText(
    `Scheduled publication date: 2 April ${CONFIRMED_YEAR} at 9:30am`,
  );
  await expect(page.getByRole('button', { name: 'Confirm publication date' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Change publication date' })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test('an admin changes a confirmed publication date, which stays Publishing scheduled and shows in History', async ({
  browser,
  page,
}) => {
  const { id } = await approvedIndicator(browser, 'change date');
  await page.goto(publicationDatePath(id));
  await enterDate(page, '2', '4', CONFIRMED_YEAR);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('alert')).toContainText(CONFIRMED);

  await page.getByRole('link', { name: 'Change publication date' }).click();
  await expect(page).toHaveURL(publicationDatePath(id));
  await expect(page.getByRole('group', { name: 'Date' }).getByLabel('Year')).toHaveValue(
    String(CONFIRMED_YEAR),
  );
  await enterDate(page, '15', '6', CHANGED_YEAR);
  await page.getByRole('group', { name: 'Time' }).getByLabel('Hour').fill('14');
  await page.getByRole('group', { name: 'Time' }).getByLabel('Minute').fill('00');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page).toHaveURL(overviewPath(id));
  await expect(page.getByRole('alert')).toContainText(CONFIRMED);
  await expect(publishingTag(page)).toHaveText('Publishing status: Publishing scheduled');
  await expect(dateLine(page)).toHaveText(
    `Scheduled publication date: 15 June ${CHANGED_YEAR} at 2:00pm`,
  );

  const on = historyToday();
  await openHistory(page, id);
  await expect(historyEntries(page)).toHaveText(
    [
      `${on} Publication date changed By ${ADMIN.name}`,
      `${on} Publication date confirmed By ${ADMIN.name}`,
      `${on} Indicator approved for publishing By ${IMRG_REVIEWER.name}`,
      `${on} Indicator reviewed by IMRG By ${IMRG_REVIEWER.name}`,
      `${on} Indicator assigned for review by ${IMRG_REVIEWER.name}. By ${IMRG_MANAGER.name}`,
      `${on} Indicator submitted for approval By ${PUBLISHER.name}`,
      `${on} Indicator first created By ${PUBLISHER.name}`,
    ],
    { useInnerText: true },
  );
});

test('the page refuses a publication date and time in the past', async ({
  browser,
  page,
}, testInfo) => {
  const { id } = await approvedIndicator(browser, 'past date');
  await page.goto(publicationDatePath(id));

  await enterDate(page, '1', '1', NEXT_YEAR - 2);
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page).toHaveURL(publicationDatePath(id));
  await expectErrorSummaryReady(page);
  await expect(page.getByRole('alert')).toContainText(IN_THE_PAST);
  await expect(page.getByRole('group', { name: 'Date' })).toContainText(IN_THE_PAST);
  await expectNoAccessibilityViolations(page, testInfo);

  await page.goto(overviewPath(id));
  await expect(publishingTag(page)).toHaveText('Publishing status: Pending scheduling');
});

test('the publisher sees Pending scheduling and the proposed date, and no way to confirm it', async ({
  browser,
}) => {
  const { id } = await approvedIndicator(browser, 'publisher view');

  await asUser(browser, PUBLISHER, async (page) => {
    await page.goto(overviewPath(id));
    await expect(publishingTag(page)).toHaveText('Publishing status: Pending scheduling');
    await expect(dateLine(page)).toHaveText(
      `Proposed publication date: 1 April ${NEXT_YEAR} at 9:30am`,
    );
    await expect(page.getByRole('button', { name: 'Confirm publication date' })).toHaveCount(0);

    const response = await page.goto(publicationDatePath(id));
    expect(response?.status()).toBe(404);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('confirms the publication date, and refuses one in the past', async ({ browser, page }) => {
    const { id } = await approvedIndicator(browser, 'no script date');
    await page.goto(publicationDatePath(id));

    await enterDate(page, '1', '1', NEXT_YEAR - 2);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('alert')).toContainText(IN_THE_PAST);

    await enterDate(page, '2', '4', CONFIRMED_YEAR);
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page).toHaveURL(overviewPath(id));
    await expect(publishingTag(page)).toHaveText('Publishing status: Publishing scheduled');
  });
});
