import { type Browser, expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { assignReviewers } from '../support/assign-reviewers.ts';
import { completeDraft, submitDraft } from '../support/complete-draft.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { historyEntries, historyToday, openHistory } from '../support/history.ts';
import { openIndicatorPage } from '../support/indicator-page.ts';
import { addInviteeAccess } from '../support/private-beta.ts';
import { asUser, respondToReview } from '../support/review-response.ts';
import { ADMIN, IMRG_REVIEWER, PUBLISHER } from '../support/sign-in.ts';
import { ukDateTime } from '../support/uk-date-time.ts';
import { PUBLIC_WEB_URL } from '../support/web-urls.ts';

const MINUTE = 60_000;
// The confirm publication date page refuses a time that is not in the future. The test leaves
// itself at least 15 seconds to fill in and submit that form before the publication time arrives.
const LEAST_NOTICE = 15_000;

/** The first whole minute after `now` that is at least `LEAST_NOTICE` away, in milliseconds. */
function nextPublicationTime(now: number) {
  const next = (Math.floor(now / MINUTE) + 1) * MINUTE;
  return next - now < LEAST_NOTICE ? next + MINUTE : next;
}

/**
 * Confirms the indicator's publication date and time as `at`, through the confirm publication
 * date form an admin uses. The form takes the date and time in UK time.
 */
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

// Values for England and for London. England is the benchmark, and London gives the published
// indicator's Compare areas tab a region to compare with it.
const DATA_TABLE = [
  'area_code,period_start,period_end,value',
  'E92000001,2019-04-01,2020-03-31,83.8',
  'E12000007,2019-04-01,2020-03-31,79.2',
].join('\n');

/**
 * Creates a new indicator with `DATA_TABLE` as its data, submits it, and has the IMRG reviewer
 * approve it. The indicator is then waiting for an admin to confirm its publication date.
 */
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
  // Four minutes covers the setup, a wait of up to 75 seconds for the publication time, and up
  // to 65 seconds more for the worker's sweep to publish the indicator.
  test.setTimeout(4 * MINUTE);
  const { id, name } = await approvedWithRegion(browser);
  const publicUrl = `${PUBLIC_WEB_URL}/indicator/${name.toLowerCase().replaceAll(' ', '-')}`;
  // Without the invitee's access, public-web would send every request for the indicator to the
  // private beta page, which answers 200 whether or not the indicator is published.
  await addInviteeAccess(browser, page.context());

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
      // The worker sweeps one second past each minute, so it should publish the indicator about
      // a second after its publication time. Waiting 65 seconds also covers the following sweep,
      // in case the first one misses the indicator.
      timeout: publishAt + 65_000 - Date.now(),
      intervals: [1_000],
    })
    .toBe(200);
  expect(Date.now()).toBeGreaterThanOrEqual(publishAt);

  await openIndicatorPage(page, publicUrl);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  // The Compare areas tab offers only the area types listed for this indicator in the
  // `available_data` read-model table. Publishing adds the indicator's rows to that table, so
  // this checks that publishing refreshed the read models.
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
