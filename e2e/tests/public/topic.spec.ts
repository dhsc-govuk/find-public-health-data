import { expect, test } from '@playwright/test';
import {
  expectNoAccessibilityViolations,
  expectUniqueLandmarkNames,
} from '../support/accessibility.ts';
import { openTopicPage, topicPageTests } from '../support/topic-page.ts';

test('shows a topic', async ({ page }) => {
  await page.goto('/topics/health-behaviours');

  await expect(page.getByRole('heading', { level: 1, name: 'Health behaviours' })).toBeVisible();
  await expect(
    page.locator('#topic-overview').getByText('Everyday behaviours that affect health'),
  ).toBeVisible();
});

test('answers a topic that does not exist with the not-found page', async ({ page }) => {
  const response = await page.goto('/topics/no-such-topic');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await page.goto('/topics/health-behaviours');

  await expectNoAccessibilityViolations(page, testInfo);
});

topicPageTests();

for (const width of [1020, 375]) {
  test(`matches the highlighted card captions and spacing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const topic of ['mortality-and-life-expectancy', 'diabetes']) {
      await openTopicPage(page, `/topics/${topic}`);
      const cards = page.locator('.fphd-topic-highlight');
      await expect(cards.first()).toBeVisible();
      for (const card of await cards.all()) {
        const endpoints = card.locator('.fphd-sparkline__endpoints');
        await expect(endpoints).toHaveCSS('margin-bottom', '5px');
        const captions = endpoints.locator(':scope > span');
        for (const caption of await captions.all()) {
          await expect(caption).toHaveCSS('line-height', '22.8px');
          await expect(caption).toHaveCSS('margin-bottom', '15px');
        }
        const key = card.locator('.govuk-summary-list__key').first();
        const summary = await card.locator('.govuk-summary-list').boundingBox();
        const label = await key.boundingBox();
        expect(label?.width).toBeCloseTo((summary?.width ?? 0) * 0.55, 1);
      }
      if (topic === 'diabetes') {
        const rate = cards.filter({ hasText: 'Mortality rate for deaths involving diabetes' });
        await expect(rate.locator('.fphd-sparkline__endpoints > span')).toHaveText([
          '92.3per 100,000in 2015-17',
          '109.6per 100,000in 2022-24',
        ]);
        const tag = cards.first().locator('.fphd-trend-tag');
        await expect(tag).toHaveCSS('width', '136px');
        await expect(tag).toHaveCSS('margin-bottom', '-3px');
      }
    }
  });
}

for (const javaScriptEnabled of [true, false]) {
  test.describe(`topic sorting with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, () => {
    test.use({ javaScriptEnabled });

    for (const sort of ['recently-updated', 'invalid']) {
      test(`shows the default Data sort for sort=${sort}`, async ({ page }) => {
        await page.goto(`/topics/diabetes?tab-topic=data&render=complete&sort=${sort}`);
        if (javaScriptEnabled)
          await expect(page.getByRole('tab', { name: 'Data', exact: true })).toBeVisible();
        const select = page
          .locator('#topic-data')
          .getByRole('combobox', { name: 'Sort by', exact: true });
        await expect(select).toHaveValue('subtopic-asc');
        await expect(select.locator('option[selected]')).toHaveAttribute('value', 'subtopic-asc');

        await select.selectOption('name-desc');
        if (!javaScriptEnabled)
          await page
            .locator('#topic-data')
            .getByRole('button', { name: 'Sort indicators', exact: true })
            .click();
        await expect(page).toHaveURL(/sort=name-desc/);
        await expect(select).toHaveValue('name-desc');
      });
    }
  });
}

test('keeps unchecked comparison columns off after removing and re-adding an area', async ({
  page,
}, testInfo) => {
  await openTopicPage(page, '/topics/diabetes?tab-topic=data&ga=E10000032');
  const panel = page.locator('#topic-data');
  await panel.getByRole('button', { name: 'Table columns', exact: true }).click();
  for (const name of ['Compared with England', 'Comparison summary']) {
    await panel.getByRole('checkbox', { name, exact: true }).uncheck();
  }
  const search = panel.getByRole('searchbox', { name: 'Search for a geography', exact: true });
  await search.fill('West Sussex');
  const area = panel.getByRole('checkbox', { name: 'West Sussex', exact: true });
  await area.uncheck();
  await expect(page).not.toHaveURL(/ga=E10000032/);
  await expect(panel.getByRole('checkbox', { name: 'Compared with England' })).toHaveCount(0);
  await area.check();
  await expect(page).toHaveURL(/ga=E10000032/);
  for (const name of ['Compared with England', 'Comparison summary']) {
    await expect(panel.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
    await expect(panel.getByRole('columnheader', { name, exact: true })).toHaveCount(0);
  }
  await expectNoAccessibilityViolations(page, testInfo);
});

test('does not give England an arbitrary spread when chosen areas have different geography types', async ({
  page,
}) => {
  await openTopicPage(
    page,
    '/topics/mortality-and-life-expectancy?tab-topic=data&ga=E12000007&ga=E08000003&columns-topic=value,minmax,percentiles',
  );
  const table = page.getByRole('tabpanel', { name: 'Data', exact: true }).getByRole('table');
  await expect(table.locator('caption')).toContainText(
    'England spread values are unavailable when chosen areas have different geography types.',
  );
  for (const label of [
    'England lowest',
    'England 25th percentile',
    'England 75th percentile',
    'England highest',
  ]) {
    const id = await table
      .getByRole('columnheader', { name: label, exact: true })
      .getAttribute('id');
    expect(id).toBeTruthy();
    const cells = table.locator(`tbody td[headers~="${id}"]`);
    expect(await cells.count()).toBeGreaterThan(0);
    for (const cell of await cells.all()) await expect(cell).toHaveText('-No data');
  }
});

test('compares a chosen area with England and shows minimum and maximum values', async ({
  page,
}, testInfo) => {
  await openTopicPage(page, '/topics/diabetes?tab-topic=data');
  const panel = page.getByRole('tabpanel', { name: 'Data', exact: true });
  await panel
    .getByRole('searchbox', { name: 'Search for a geography', exact: true })
    .fill('West Sussex');
  await panel.getByRole('checkbox', { name: 'West Sussex', exact: true }).check();
  await expect(page).toHaveURL(/ga=E10000032/);
  const table = panel.getByRole('table');
  await expect(
    table.getByRole('columnheader', { name: 'Compared with England', exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: 'Comparison summary', exact: true }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
  await panel.getByRole('button', { name: 'Table columns', exact: true }).click();
  await panel.getByRole('checkbox', { name: 'Minimum/Maximum values', exact: true }).check();
  await expect(
    table.getByRole('columnheader', { name: 'England lowest', exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: 'England highest', exact: true }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test('names each geography tree on the page differently at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openTopicPage(page, '/topics/diabetes?tab-topic=data');

  const trees = page.locator('.fphd-geo-alt__tree');
  await expect(trees).toHaveCount(3);
  for (const tree of await trees.all()) await expect(tree).toBeVisible();
  await expectUniqueLandmarkNames(page);
});
