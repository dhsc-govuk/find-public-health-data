import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { completeDraft } from '../support/complete-draft.ts';
import { createDraft, uniqueIndicatorName } from '../support/create-indicator.ts';
import { openIndicatorPage } from '../support/indicator-page.ts';
import { PUBLISHER, TEAM_B_PUBLISHER } from '../support/sign-in.ts';
import { answerTo } from '../support/summary-list.ts';

test.use({ storageState: PUBLISHER.storageState });

function previewPath(id: string) {
  return `/dashboard/indicators/${id}/preview`;
}

async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
  return page.getByRole('tabpanel', { name });
}

test('"Preview indicator" on the task list shows the draft as the public page, under "This is a preview of the indicator", with "Back to task list"', async ({
  page,
}, testInfo) => {
  const name = uniqueIndicatorName('preview');
  const id = await createDraft(page, name);

  await page.goto(`/publish/indicators/${id}/task-list`);
  await page.getByRole('button', { name: 'Preview indicator' }).click();
  await expect(page).toHaveURL(`${previewPath(id)}?from=task-list`);

  const banner = page.getByRole('region', { name: 'Important' });
  await expect(banner).toHaveText(/This is a preview of the indicator/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveText([
    'Indicator',
    'Compare areas',
    'Compare indicators',
    'Inequalities',
    'About this indicator',
  ]);
  await expect(page.getByRole('link', { name: 'Back to task list' })).toHaveAttribute(
    'href',
    `/publish/indicators/${id}/task-list`,
  );
  await expectNoAccessibilityViolations(page, testInfo);
});

test('a draft previewed before any data reads "[Not provided yet]" where the page needs data and "[Not entered yet]" for each question it has not answered', async ({
  page,
}, testInfo) => {
  const id = await createDraft(page, uniqueIndicatorName('preview before data'));

  await openIndicatorPage(page, previewPath(id));

  await expect(answerTo(page, 'Period covered')).toHaveText('[Not provided yet]');
  await expect(answerTo(page, 'Update frequency')).toHaveText('[Not entered yet]');
  await expect(page.getByRole('tabpanel', { name: 'Indicator' })).toHaveText('[Not provided yet]');
  for (const tab of ['Compare areas', 'Compare indicators', 'Inequalities']) {
    await expect(await openTab(page, tab)).toHaveText('[Not provided yet]');
  }

  const about = await openTab(page, 'About this indicator');
  for (const question of ['Value type', 'Unit', 'Frequency', 'Polarity']) {
    await expect(answerTo(page, question)).toHaveText('[Not entered yet]');
  }
  await expect(about.getByText('Indicator ID', { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test('a draft whose data is not yet shown in the preview reads "[Data isn\'t shown in the preview yet]" and shows its answers', async ({
  page,
}, testInfo) => {
  const id = await createDraft(page, uniqueIndicatorName('preview with data'));
  await completeDraft(page, id);

  await openIndicatorPage(page, previewPath(id));

  await expect(answerTo(page, 'Period covered')).toHaveText(
    "[Data isn't shown in the preview yet]",
  );
  await expect(page.getByRole('tabpanel', { name: 'Indicator' })).toHaveText(
    "[Data isn't shown in the preview yet]",
  );
  await openTab(page, 'About this indicator');
  await expect(answerTo(page, 'Value type')).not.toHaveText('[Not entered yet]');
  // The sample answers make it a count of people, so its values are labelled with what they count.
  await expect(answerTo(page, 'Unit')).toHaveText('people');
  // The sample answers use the standard method, which the page describes in its place.
  await expect(answerTo(page, 'How the indicator was calculated')).toHaveText(
    'Value and count are the same.',
  );
  await expect(page.getByText('[Not entered yet]')).toHaveCount(0);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('"View indicator preview" on the overview\'s Actions tab opens the preview, with "Back to indicator overview"', async ({
  page,
}) => {
  const id = await createDraft(page, uniqueIndicatorName('preview from overview'));

  await page.goto(`/dashboard/indicators/${id}`);
  await page.getByRole('link', { name: 'View indicator preview' }).click();

  await expect(page).toHaveURL(previewPath(id));
  await expect(page.getByRole('link', { name: 'Back to indicator overview' })).toHaveAttribute(
    'href',
    `/dashboard/indicators/${id}`,
  );
});

test('the preview\'s metadata file gives each unanswered question as "[Not entered yet]", and it has no CSV download before any data', async ({
  page,
}) => {
  const name = uniqueIndicatorName('preview metadata');
  const id = await createDraft(page, name);

  const metadata = await page.request.get(`${previewPath(id)}/metadata.txt`);
  expect(metadata.status()).toBe(200);
  const text = await metadata.text();
  expect(text).toContain(`Indicator: ${name}`);
  expect(text).toContain('Value type: [Not entered yet]');
  expect(text).toContain('Unit: [Not entered yet]');

  expect((await page.request.get(`${previewPath(id)}/table.csv`)).status()).toBe(404);
});

test('the compare search in the preview finds the draft as if it were published, and the public site does not', async ({
  page,
}) => {
  const name = uniqueIndicatorName('preview search');
  const id = await createDraft(page, name);

  const previewed = await page.request.get(
    `${previewPath(id)}/indicators/search?q=${encodeURIComponent(name)}`,
  );
  expect(((await previewed.json()) as { indicators: { name: string }[] }).indicators).toEqual([
    expect.objectContaining({ name }),
  ]);

  const published = await page.request.get(`/indicators/search?q=${encodeURIComponent(name)}`);
  expect(((await published.json()) as { indicators: unknown[] }).indicators).toEqual([]);
});

test('the draft never shows as a published indicator page', async ({ page }) => {
  const name = uniqueIndicatorName('preview not public');
  const id = await createDraft(page, name);
  // The preview's search gives the draft's slug as the public page would have it.
  const search = await page.request.get(
    `${previewPath(id)}/indicators/search?q=${encodeURIComponent(name)}`,
  );
  const [found] = ((await search.json()) as { indicators: { slug: string }[] }).indicators;
  expect(found?.slug).toMatch(/^e2e-preview-not-public-/);

  // internal-web serves the public pages too, through the same published views as public-web.
  const response = await page.request.get(`/indicator/${found?.slug}`);

  expect(response.status()).toBe(404);
});

test.describe('a publisher in another team', () => {
  test.use({ storageState: TEAM_B_PUBLISHER.storageState });

  test('opens a Team A draft from its overview as a metadata-only preview, under a banner that says so', async ({
    browser,
    page,
  }, testInfo) => {
    const name = uniqueIndicatorName('preview team A');
    const teamA = await browser.newContext({ storageState: PUBLISHER.storageState });
    const teamAPage = await teamA.newPage();
    const id = await createDraft(teamAPage, name);
    await completeDraft(teamAPage, id);
    await teamA.close();

    await page.goto(`/dashboard/indicators/${id}`);
    await page.getByRole('link', { name: 'View indicator preview (metadata only)' }).click();

    await expect(page).toHaveURL(previewPath(id));
    await expect(page.getByRole('region', { name: 'Important' })).toContainText(
      'This is a preview of the indicator. Only metadata is visible as this indicator belongs to a team you are not in.',
    );
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveText(['About this indicator']);
    await expect(answerTo(page, 'Period covered')).toHaveText('[Not shown in this preview]');
    await expect(answerTo(page, 'Value type')).not.toHaveText('[Not entered yet]');
    await expect(page.getByRole('link', { name: 'Back to indicator overview' })).toHaveAttribute(
      'href',
      `/dashboard/indicators/${id}`,
    );
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test("gives a Team A draft's metadata file but none of its data", async ({ browser, page }) => {
    const name = uniqueIndicatorName('preview team A data');
    const teamA = await browser.newContext({ storageState: PUBLISHER.storageState });
    const teamAPage = await teamA.newPage();
    const id = await createDraft(teamAPage, name);
    await completeDraft(teamAPage, id);
    await teamA.close();

    const metadata = await page.request.get(`${previewPath(id)}/metadata.txt`);
    expect(metadata.status()).toBe(200);
    expect(await metadata.text()).toContain(`Indicator: ${name}`);

    for (const path of [
      'table.csv',
      'all-data.csv',
      `indicators/search?q=${encodeURIComponent(name)}`,
    ]) {
      expect((await page.request.get(`${previewPath(id)}/${path}`)).status(), path).toBe(404);
    }
  });
});
