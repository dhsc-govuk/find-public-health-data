import { type Browser, expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { assignReviewers } from '../support/assign-reviewers.ts';
import { completeDraft, submitDraft } from '../support/complete-draft.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { historyEntries, historyToday, openHistory } from '../support/history.ts';
import { openIndicatorPage } from '../support/indicator-page.ts';
import { addInviteeAccess } from '../support/private-beta.ts';
import {
  confirmPublicationAt,
  MINUTE,
  nextPublicationTime,
  publicIndicatorUrl,
  waitForPublication,
} from '../support/published-indicator.ts';
import { asUser, respondToReview } from '../support/review-response.ts';
import { ADMIN, IMRG_REVIEWER, PUBLISHER } from '../support/sign-in.ts';
import { answerTo } from '../support/summary-list.ts';

// Values for England and for London. England is the benchmark, and London gives the published
// indicator's Compare areas tab a region to compare with it.
const DATA_TABLE = [
  'area_code,period_start,period_end,value,lower_ci_95,upper_ci_95,lower_ci_998,upper_ci_998',
  'E92000001,2019-04-01,2020-03-31,72.49,72042.0954,72939.9819,-2,100.00000000000003',
  'E12000007,2019-04-01,2020-03-31,33.33,4.0368,120.4115,3,130',
].join('\n');

const UPDATE_FREQUENCY_REASON = 'Published whenever the survey runs.';

/**
 * Creates a new indicator with `DATA_TABLE` as its data and no fixed update frequency, submits
 * it, and has the IMRG reviewer approve it. The indicator is then waiting for an admin to
 * confirm its publication date.
 */
async function approvedWithRegion(browser: Browser) {
  const name = uniqueIndicatorName('publish on time');
  const id = await asUser(browser, PUBLISHER, async (page) => {
    const draftId = await createDraft(page, name);
    await completeDraft(page, draftId);
    await page.goto(`/publish/indicators/${draftId}/value-type-and-units`);
    await page.getByLabel('Select value type').selectOption({ label: 'Proportion' });
    await page.getByLabel('Select units').selectOption({ label: '%' });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.goto(`/publish/indicators/${draftId}/update-frequency`);
    await page.getByLabel('No fixed frequency', { exact: true }).check();
    await page.getByRole('textbox', { name: 'Enter reason' }).fill(UPDATE_FREQUENCY_REASON);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(`/publish/indicators/${draftId}/task-list`);
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
  const publicUrl = publicIndicatorUrl(name);
  // Without the invitee's access, public-web would send every request for the indicator to the
  // private beta page, which answers 200 whether or not the indicator is published.
  await addInviteeAccess(page.context());

  const publishAt = nextPublicationTime(Date.now());
  await confirmPublicationAt(page, id, publishAt);
  await expect(page.getByRole('main').locator('h1 ~ p .govuk-tag')).toHaveText([
    'Indicator status: New indicator',
    'Publishing status: Publishing scheduled',
  ]);
  await expectNoAccessibilityViolations(page, testInfo);
  expect((await page.request.get(publicUrl)).status()).toBe(404);

  await waitForPublication(page, name, publishAt);
  expect(Date.now()).toBeGreaterThanOrEqual(publishAt);

  await openIndicatorPage(page, publicUrl);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const updateFrequency = answerTo(page, 'Update frequency');
  await expect(updateFrequency).toContainText('No fixed frequency, for the following reason:');
  await expect(updateFrequency.getByText(UPDATE_FREQUENCY_REASON)).toBeVisible();
  const shortId = (await answerTo(page, 'Indicator ID').textContent())?.trim();
  expect(shortId).toMatch(/^\d+$/);
  await openIndicatorPage(page, `${publicUrl}?ci-${shortId}=95&columns-${shortId}=value,95,99.8`);
  const trend = page.locator('#indicator-table table');
  await expect(trend.locator('tbody td')).toHaveText(['72.5%', '100%', '100%', '-2.0%', '100%']);
  const chart = page.getByRole('region', { name: `${name} trend chart` });
  const ticks = chart.locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value');
  await expect(ticks.first()).toBeVisible();
  expect((await ticks.allTextContents()).map(Number).every((value) => value < 200)).toBe(true);
  for (const file of ['table.csv', 'all-data.csv']) {
    const response = await page.request.get(
      `${publicUrl}/${file}?columns-${shortId}=value,95,99.8`,
    );
    expect(response.ok()).toBe(true);
    const csv = await response.text();
    expect(csv).toContain('72042.0954,72939.9819');
    expect(csv).toContain('-2,100.00000000000003');
  }

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
  const london = compareAreas.getByRole('row', { name: /London/ });
  await expect(london.getByRole('cell').last()).toHaveText('100');
  await expect(london.getByRole('cell').nth(2)).toHaveText('4.0');
  await expect(compareAreas.getByRole('table')).not.toContainText('72,042');
  const areaCsv = await page.request.get(
    `${publicUrl}/table.csv?tab-indicator=areas&areaType=Statistical%20regions`,
  );
  expect(areaCsv.ok()).toBe(true);
  expect(await areaCsv.text()).toContain('4.0368,120.4115');
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
