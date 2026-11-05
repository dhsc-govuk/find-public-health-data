import { expect, type Page, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/accessibility.ts';

const panel = (page: Page, tab: string) => page.locator(`#search-${tab}`);

test('search returns indicators and topics with a count in each tab', async ({
  page,
}, testInfo) => {
  await page.goto('/search?q=diabetes');
  const indicators = page.getByRole('tab', { name: /^Indicators \(\d+\)$/ });
  await expect(indicators).toHaveAttribute('aria-selected', 'true');
  const count = await panel(page, 'indicators').locator('#results-heading').innerText();
  expect(await indicators.innerText()).toBe(`Indicators (${count.split(' ')[0]})`);
  await expect(page.getByRole('tab', { name: 'Topics (1)', exact: true })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expectNoAccessibilityViolations(page, testInfo);

  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('.data')) requests.push(request.url());
  });
  await page.getByRole('tab', { name: 'Topics (1)', exact: true }).click();
  await expect(page).toHaveURL(/tab-search=topics/);
  await expect(
    panel(page, 'topics').getByRole('link', { name: 'Diabetes', exact: true }),
  ).toHaveAttribute('href', '/topics/diabetes');
  await expectNoAccessibilityViolations(page, testInfo);
  await expect(panel(page, 'indicators')).toBeHidden();
  expect(requests).toEqual([]);
  await panel(page, 'topics').getByRole('link', { name: 'Diabetes', exact: true }).click();
  await expect(page).toHaveURL('/topics/diabetes');
});

test('topics use the same matching results as the topics page', async ({ page }) => {
  await page.goto('/topics?q=health');
  const topics = await page.locator('.fphd-card-list__link').allTextContents();
  expect(topics.length).toBeGreaterThan(0);
  await page.goto('/search?q=health');
  await page.getByRole('tab', { name: /^Topics/ }).click();
  expect(await panel(page, 'topics').locator('.fphd-card-list__link').allTextContents()).toEqual(
    topics,
  );
  await expect(page.getByRole('tab', { name: /^Topics/ })).toHaveText(`Topics (${topics.length})`);

  const query = new URLSearchParams({ q: 'mortality  and life expectancy' });
  await page.goto(`/topics?${query}`);
  await expect(page.getByText('No topics match your search.')).toBeVisible();
  await page.goto(`/search?${query}&tab-search=topics`);
  await expect(page.getByRole('tab', { name: 'Topics (0)' })).toBeVisible();
});

test('search updates all counts and keeps the selected tab', async ({ page }, testInfo) => {
  await page.goto('/search?tab-search=topics');
  await expect(page.getByRole('tab', { name: /^Topics/ })).toHaveAttribute('aria-selected', 'true');
  const search = page.getByRole('searchbox', { name: 'Search by keywords' });
  await search.fill('diabetes');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Topics (1)', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expectNoAccessibilityViolations(page, testInfo);

  await search.fill('zzzz-no-matching-result');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  for (const name of ['Indicators', 'Topics']) {
    await expect(page.getByRole('tab', { name: `${name} (0)`, exact: true })).toBeVisible();
  }
  await expect(panel(page, 'topics')).toContainText('No topics match your search terms.');
  await expectNoAccessibilityViolations(page, testInfo);
});

test('the selected search tab supports keyboard navigation, history and reload', async ({
  page,
}) => {
  await page.goto('/search?q=diabetes&t=diabetes');
  const indicators = page.getByRole('tab', { name: /^Indicators/ });
  await indicators.focus();
  await indicators.press('ArrowRight');
  const topics = page.getByRole('tab', { name: 'Topics (1)', exact: true });
  await expect(topics).toBeFocused();
  await expect(topics).toHaveAttribute('aria-selected', 'true');
  await topics.press('ArrowLeft');
  await expect(indicators).toBeFocused();
  expect(new URL(page.url()).searchParams.get('q')).toBe('diabetes');
  expect(new URL(page.url()).searchParams.get('t')).toBe('diabetes');
  await page.goBack();
  await expect(topics).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(topics).toHaveAttribute('aria-selected', 'true');
});

test('search tabs remain interactive on small screens', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/search?q=diabetes');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Topics (1)', exact: true }).click();
  await expect(panel(page, 'topics')).toBeVisible();
  await expect(panel(page, 'indicators')).toBeHidden();
  await expect(panel(page, 'frameworks')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('one search returns both result sections without JavaScript', async ({ page }) => {
    await page.goto('/search');
    await page.getByRole('searchbox', { name: 'Search by keywords' }).fill('diabetes');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    for (const tab of ['indicators', 'topics']) {
      await expect(panel(page, tab)).toBeVisible();
    }
    await expect(
      panel(page, 'topics').getByRole('link', { name: 'Diabetes', exact: true }),
    ).toBeVisible();
    await expect(panel(page, 'frameworks')).toHaveCount(0);

    await page.getByRole('link', { name: 'Topics (1)', exact: true }).click();
    await expect(panel(page, 'indicators')).toBeHidden();
    await page.getByRole('searchbox', { name: 'Search by keywords' }).fill('mortality');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/tab-search=topics/);
    await expect(panel(page, 'indicators')).toBeHidden();
    await expect(panel(page, 'topics')).toBeVisible();
  });
});
