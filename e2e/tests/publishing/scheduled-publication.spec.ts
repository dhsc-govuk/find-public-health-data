import { type Browser, expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { assignReviewers } from '../support/assign-reviewers.ts';
import { completeDraft, submitDraft } from '../support/complete-draft.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { historyEntries, historyToday, openHistory } from '../support/history.ts';
import { openIndicatorPage } from '../support/indicator-page.ts';
import { asUser, respondToReview } from '../support/review-response.ts';
import { ADMIN, IMRG_REVIEWER, PUBLISHER } from '../support/sign-in.ts';
import { ukDateTime } from '../support/uk-date-time.ts';
import { PUBLIC_WEB_URL } from '../support/web-urls.ts';

const MINUTE = 60_000;
// The confirm page refuses a time not in the future, so a minute this close is skipped.
const LEAST_NOTICE = 15_000;

/** The next whole minute at least LEAST_NOTICE away. */
function nextPublicationTime(now: number) {
  const next = (Math.floor(now / MINUTE) + 1) * MINUTE;
  return next - now < LEAST_NOTICE ? next + MINUTE : next;
}

/** Confirms the publication date and time as an admin does, the time in UK time. */
async function confirmPublicationAt(page: Page, id: string, at: number) {
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

// England and London, so the published indicator has areas to compare.
const DATA_TABLE = [
  'area_code,period_start,period_end,value',
  'E92000001,2019-04-01,2020-03-31,83.8',
  'E12000007,2019-04-01,2020-03-31,79.2',
].join('\n');

/** A new indicator with DATA_TABLE as its data, IMRG approved and pending scheduling. */
async function approvedWithRegion(browser: Browser) {
  const name = uniqueIndicatorName('publish on time');
  const id = await asUser(browser, PUBLISHER, async (page) => {
    const draftId = await createDraft(page, name);
    await completeDraft(page, draftId);
    await page.goto(`/publish/indicators/${draftId}/data-table`);
    await page.getByLabel('Upload indicator data table').setInputFiles({
      name: 'publish-on-time.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(DATA_TABLE),
    });
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(`/publish/indicators/${draftId}/data-table/check`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(`/publish/indicators/${draftId}/task-list`);
    await submitDraft(page, draftId);
    return draftId;
  });
  await assignReviewers(browser, id, [IMRG_REVIEWER.name]);
  await respondToReview(browser, id, { kind: 'approved' });
  return { id, name };
}

test.use({ storageState: ADMIN.storageState });

test('publishes a scheduled indicator at its publication time', async ({
  browser,
  page,
}, testInfo) => {
  // The setup, up to a minute and a quarter before the publication time, and up to 65 seconds
  // after it for the sweep.
  test.setTimeout(4 * MINUTE);
  const { id, name } = await approvedWithRegion(browser);
  const publicUrl = `${PUBLIC_WEB_URL}/indicator/${name.toLowerCase().replaceAll(' ', '-')}`;

  const publishAt = nextPublicationTime(Date.now());
  await confirmPublicationAt(page, id, publishAt);
  await expect(page.getByRole('main').locator('h1 ~ p .govuk-tag')).toHaveText([
    'Indicator status: New indicator',
    'Publishing status: Publishing scheduled',
  ]);
  await expectNoAccessibilityViolations(page, testInfo);
  expect((await page.request.get(publicUrl)).status()).toBe(404);

  await expect
    .poll(async () => (await page.request.get(publicUrl)).status(), {
      // The sweep a second past the minute, or the next one should that be missed.
      timeout: publishAt + 65_000 - Date.now(),
      intervals: [1_000],
    })
    .toBe(200);
  expect(Date.now()).toBeGreaterThanOrEqual(publishAt);

  await openIndicatorPage(page, publicUrl);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  // The areas to compare are read from the read models, which publishing refreshes.
  await page.getByRole('tab', { name: 'Compare areas', exact: true }).click();
  const compareAreas = page.locator('#indicator-compare-areas');
  await expect(
    compareAreas.getByRole('combobox', { name: 'Type of geography' }).getByRole('option'),
  ).toHaveText(['Statistical regions']);
  await expect(
    compareAreas
      .getByRole('group', { name: 'Areas in Statistical regions', exact: true })
      .getByRole('checkbox', { name: 'London', exact: true }),
  ).toBeVisible();
  await expect(compareAreas.getByRole('table').getByRole('rowheader')).toHaveText([
    'England (benchmark)',
    'London',
  ]);
  await expectNoAccessibilityViolations(page, testInfo);

  await page.goto(`/dashboard/indicators/${id}`);
  await expect(page.getByRole('main').locator('h1 ~ p .govuk-tag')).toHaveText([
    'Indicator status: Live indicator',
    'Publishing status: Published',
  ]);
  await expectNoAccessibilityViolations(page, testInfo);
  await openHistory(page, id);
  await expect(historyEntries(page).first()).toHaveText(`${historyToday()} Indicator published`, {
    useInnerText: true,
  });
});
