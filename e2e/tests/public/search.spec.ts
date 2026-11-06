import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { MORTALITY_PATH, MORTALITY_SLUG } from '../support/indicator-page.ts';

const card = (page: Page, title: string) =>
  page
    .locator('.fphd-filter-card')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const results = (page: Page) => page.locator('.fphd-search-results');

async function ready(page: Page, path = '/search') {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Indicator filters', exact: true })).toBeVisible();
}

test('loads the search page with h1', async ({ page }) => {
  await page.goto('/search');

  await expect(page.getByRole('heading', { level: 1, name: 'Search for data' })).toBeVisible();
});

test('keeps direct indicator matches ahead of taxonomy-only matches', async ({
  page,
}, testInfo) => {
  await ready(page, '/search?q=diabetes');
  await expect(results(page).getByRole('link').first()).toHaveText('Diabetes: QOF prevalence');
  await expectNoAccessibilityViolations(page, testInfo);
});

test('uses the compact NotGovUK search box', async ({ page }) => {
  await page.goto('/search');

  const input = page.getByRole('searchbox', { name: 'Search by keywords' });
  const button = page.getByRole('button', { name: 'Search', exact: true });

  await expect(input.locator('..')).toHaveClass(/not-govuk-search-box/);
  await expect(button).toHaveCSS('background-color', 'rgb(29, 112, 184)');
  await expect(button).toHaveCSS('height', '40px');
  await expect(button).toHaveCSS('width', '40px');
});

test('keeps filter card geometry stable through hydration', async ({ page }) => {
  const geometry = async () =>
    page.locator('.fphd-wide-layout .govuk-grid-column-one-third').evaluate((column) => {
      const box = (element: Element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      const searchBox = document.querySelector('.fphd-search-bar');
      if (!searchBox) throw new Error('Search box is missing');
      return {
        column: box(column),
        searchBox: box(searchBox),
        cards: [...column.querySelectorAll('.fphd-filter-card')].map(box),
      };
    });

  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'script') await route.abort();
    else await route.continue();
  });
  await page.goto('/search');

  const serverGeometry = await geometry();

  await page.unroute('**/*');
  await page.reload();
  await ready(page);

  expect(await geometry()).toEqual(serverGeometry);
});

test('search uses the shared accordion filters beneath geographies', async ({ page }, testInfo) => {
  await ready(page);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Geographies', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Indicator filters', exact: true })).toBeVisible();
  const filters = page.locator('.fphd-topic-indicator-filters');
  for (const title of [
    'Topics and types',
    'Frameworks and programmes',
    'About the data',
    'Status',
    'Years the data covers',
    'Last updated',
  ]) {
    const toggle = filters.getByRole('button', { name: title, exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle.locator('..').locator('..')).toHaveClass('fphd-filter-card');
  }
  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await page.goto('/search');

  await page.getByRole('heading', { level: 1, name: 'Search for data' }).waitFor();
  await expectNoAccessibilityViolations(page, testInfo);
});

test('a keyword narrows the result count', async ({ page }) => {
  await page.goto('/search');

  await page
    .getByRole('heading', { name: /indicators?/ })
    .last()
    .waitFor();
  const initial = await page.locator('#results-heading').textContent();

  await page.goto('/search?q=mortality');

  await page.locator('#results-heading').waitFor();
  const narrowed = await page.locator('#results-heading').textContent();

  expect(narrowed).not.toEqual(initial);
  expect(narrowed).toMatch(/\d+ indicators?/);
});

test('search matches an indicator number, its slug and taxonomy slugs', async ({ page }) => {
  await page.goto('/search?q=108');
  await expect(page.getByRole('heading', { name: '1 indicator' })).toBeVisible();
  await expect(results(page).getByRole('link')).toHaveAttribute('href', MORTALITY_PATH);

  await page.goto(`/search?q=${MORTALITY_SLUG}`);
  await expect(page.getByRole('heading', { name: '1 indicator' })).toBeVisible();

  await page.goto('/search?q=mortality-and-life-expectancy');
  await expect(results(page).locator('.fphd-search-result').first()).toContainText(
    'Mortality and life expectancy',
  );

  await page.goto('/search?q=indicator-type-outcome');
  await expect(results(page).locator('.fphd-search-result').first()).toContainText('Outcome');
});

test('a result links directly to its indicator page', async ({ page }) => {
  await ready(page, '/search?q=108');
  await expect(results(page).getByRole('link')).toHaveAttribute('href', MORTALITY_PATH);
  await expect(results(page).getByRole('checkbox')).toHaveCount(0);
  await results(page).getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/indicator/${MORTALITY_SLUG}$`));
});

test('search nav link appears between Home and Topics', async ({ page }) => {
  await page.goto('/');

  const navLinks = page.getByRole('navigation').getByRole('link');
  const texts = await navLinks.allTextContents();

  const homeIdx = texts.indexOf('Home');
  const searchIdx = texts.indexOf('Search');
  const topicsIdx = texts.indexOf('Topics');

  expect(homeIdx).toBeGreaterThanOrEqual(0);
  expect(searchIdx).toBeGreaterThanOrEqual(0);
  expect(topicsIdx).toBeGreaterThanOrEqual(0);
  expect(searchIdx).toBeGreaterThan(homeIdx);
  expect(topicsIdx).toBeGreaterThan(searchIdx);
});

test('home page search form navigates to /search with q param', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Search for data').fill('mortality');
  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page).toHaveURL('/search?q=mortality');
  await expect(page.getByRole('heading', { level: 1, name: 'Search for data' })).toBeVisible();
});

test('clearing keywords clears both submitted and unsubmitted text', async ({ page }) => {
  await ready(page);
  const input = page.getByRole('searchbox', { name: 'Search by keywords' });
  await input.fill('diabetes');
  await page.getByRole('link', { name: 'Clear search', exact: true }).click();
  await expect(input).toHaveValue('');
  await input.fill('diabetes');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=diabetes/);
  await page.getByRole('link', { name: 'Clear search', exact: true }).click();
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).not.toHaveURL(/diabetes/);
});

test('filtering keeps result links available', async ({ page }) => {
  await ready(page);
  await page.getByRole('searchbox', { name: 'Search by keywords' }).fill('cancer');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=cancer/);
  await expect(page.getByRole('heading', { name: '1 indicator', exact: true })).toBeVisible();
  await expect(results(page).getByRole('link')).toHaveCount(1);
});

test('keeps focus on a filter control while it updates the results', async ({ page }) => {
  await ready(page, '/search?t=diabetes');
  const clear = page.getByRole('link', { name: 'Clear all filters' });
  await clear.click();
  await expect(page).toHaveURL('/search');
  await expect(page.getByRole('heading', { name: '12 indicators', exact: true })).toBeVisible();
  await expect(clear).toBeFocused();
});

test('keeps the results live region while searches update its count', async ({ page }) => {
  await ready(page);
  const heading = page.getByRole('heading', { name: '12 indicators', exact: true });
  await expect(heading).toHaveAttribute('aria-live', 'polite');
  await expect(heading).toHaveAttribute('aria-atomic', 'true');
  const liveRegion = await heading.elementHandle();
  if (!liveRegion) throw new Error('The results live region must exist before searching');

  const input = page.getByRole('searchbox', { name: 'Search by keywords' });
  await input.fill('cancer');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=cancer/);
  expect(await liveRegion.evaluate((element) => element.isConnected)).toBe(true);
  await expect.poll(() => liveRegion.textContent()).toBe('1 indicator');

  await input.fill('zzzzzzzzzzzz');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=zzzzzzzzzzzz/);
  expect(await liveRegion.evaluate((element) => element.isConnected)).toBe(true);
  await expect.poll(() => liveRegion.textContent()).toBe('0 indicators');
  await expect(
    page.getByText('No indicators match your selected filters or search terms.'),
  ).toBeVisible();
});

test('topic checkboxes apply and remove filters immediately', async ({ page }, testInfo) => {
  await ready(page);
  const topics = card(page, 'Topics and types');
  await topics.getByRole('button', { name: 'Topics and types', exact: true }).click();
  const diabetes = topics.getByRole('checkbox', { name: 'Diabetes', exact: true });
  await diabetes.check();
  await expect(page).toHaveURL(/t=diabetes/);
  await expect(diabetes).toBeChecked();
  await expect(results(page).getByRole('link')).toHaveCount(2);
  await expectNoAccessibilityViolations(page, testInfo);
  await diabetes.uncheck();
  await expect(page).toHaveURL('/search');
  await expect(results(page).getByRole('link')).toHaveCount(12);
});

test('years and last updated filters preserve the keyword and other filters', async ({ page }) => {
  await ready(page, '/search?q=diabetes&t=diabetes&fromYear=2010&toYear=2025');
  await expect(page.getByRole('textbox', { name: 'From', exact: true })).toHaveValue('2010');
  await expect(page.getByRole('textbox', { name: 'To', exact: true })).toHaveValue('2025');
  await card(page, 'Last updated')
    .getByRole('button', { name: 'Last updated', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Last updated', exact: true }).selectOption('12');
  await expect(page).toHaveURL(/updatedWithin=12/);
  const params = new URL(page.url()).searchParams;
  expect(params.get('q')).toBe('diabetes');
  expect(params.get('t')).toBe('diabetes');
  expect(params.get('fromYear')).toBe('2010');
  expect(params.get('toYear')).toBe('2025');
});

test('a complete long data source remains selected and narrows results', async ({ page }) => {
  await ready(page);
  const attributes = card(page, 'About the data');
  await attributes.getByRole('button', { name: 'About the data', exact: true }).click();
  const option = attributes.getByRole('checkbox', { name: /Medicines/ }).first();
  const source = await option.inputValue();
  expect(source.length).toBeGreaterThan(100);
  await option.check();
  await expect(page).toHaveURL(/src=/);
  expect(new URL(page.url()).searchParams.get('src')).toBe(source);
  await expect(option).toBeChecked();
  await expect(results(page).getByRole('link')).toHaveCount(2);
  await page.reload();
  await expect(option).toBeChecked();
});

test('lays out the geography levels and their first 100 areas as a compact tree', async ({
  page,
}) => {
  await ready(page);
  const geography = card(page, 'Geographies');
  const levelRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/geographies?level=')) levelRequests.push(request.url());
  });
  await geography.getByRole('button', { name: 'Expand Upper-tier local authorities' }).click();

  const level = geography
    .getByRole('group', { name: 'All of Upper-tier local authorities', exact: true })
    .locator('label');
  const longLevel = geography
    .getByRole('group', { name: 'All of Middle layer super output areas (MSOAs)', exact: true })
    .locator('label');
  const area = geography.getByText('County Durham', { exact: true });
  const levelInput = geography.getByRole('checkbox', {
    name: 'All Upper-tier local authorities (as one group)',
    exact: true,
  });
  const toggle = geography.getByRole('button', { name: 'Collapse Upper-tier local authorities' });
  await expect(area).toBeVisible();
  await expect(geography.getByText('Loading…')).toHaveCount(0);
  await expect(
    geography.getByText('Showing the first 100 — search to find the rest'),
  ).toBeVisible();
  await expect(geography.locator('.fphd-geo-alt__children').getByRole('checkbox')).toHaveCount(100);
  expect(levelRequests).toEqual([]);
  await expect(level).toHaveCSS('font-size', '16px');
  await expect(levelInput).toHaveCSS('width', '24px');
  await expect(levelInput).toHaveCSS('height', '36px');
  await expect(toggle).toHaveCSS('height', '36px');

  const levelBox = await level.boundingBox();
  const longLevelBox = await longLevel.boundingBox();
  const areaBox = await area.boundingBox();
  expect(levelBox).not.toBeNull();
  expect(longLevelBox?.height ?? 0).toBeGreaterThanOrEqual(levelBox?.height ?? 0);
  expect(await longLevel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  expect((areaBox?.x ?? 0) - (levelBox?.x ?? 0)).toBe(26);
});

test('geography can be unchecked or cleared without leaving pending ticks', async ({ page }) => {
  await ready(page, '/search?geo=Statistical+regions');
  const geography = card(page, 'Geographies');
  const level = geography.getByRole('checkbox', {
    name: 'All Statistical regions (as one group)',
    exact: true,
  });
  await level.uncheck();
  await expect(page).toHaveURL('/search');
  await level.check();
  await expect(page).toHaveURL(/geo=/);
  await geography.getByRole('link', { name: 'Clear filter' }).click();
  await expect(page).toHaveURL('/search');
  await expect(level).not.toBeChecked();
  await expect(geography.getByRole('button', { name: 'Apply geographies' })).toBeHidden();
});

test('selected areas return only indicators with data for every area', async ({ page }) => {
  await ready(page, '/search?ga=E07000223&ga=E07000032');

  await expect(
    results(page).getByRole('link', {
      name: /Smoking Prevalence in adults .* current smokers \(APS\)/,
    }),
  ).toBeVisible();
  await expect(
    results(page).getByRole('link', {
      name: /Attended contacts with community and outpatient mental health services/,
    }),
  ).toHaveCount(0);
});

test('changing and clearing filters replaces the current filter history entry', async ({
  page,
}) => {
  await ready(page, '/search?t=diabetes&geo=Statistical+regions');
  const before = await page.evaluate(() => history.length);
  await card(page, 'Topics and types')
    .getByRole('checkbox', { name: 'Diabetes', exact: true })
    .uncheck();
  await expect(page).not.toHaveURL(/t=diabetes/);
  await page.getByRole('link', { name: 'Clear all filters', exact: true }).click();
  await expect(page).toHaveURL('/search');
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('selected areas and whole levels reach the indicator view through a result link', async ({
  page,
}) => {
  await ready(page, '/search?geo=Statistical+regions&ga=E06000052');
  await results(page).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/indicator\//);
  const params = new URL(page.url()).searchParams;
  expect(params.getAll('as')).toEqual(['E06000052']);
  expect(params.getAll('als')).toEqual(['Statistical regions']);
  await expect(
    page.getByRole('link', { name: 'Remove Cornwall filter', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Remove Statistical regions filter', exact: true }),
  ).toBeVisible();
});

test('geography search reports failures, retries and empty results', async ({ page }) => {
  await ready(page);
  const geography = card(page, 'Geographies');
  await page.route('**/geographies?*', (route) =>
    route.fulfill({ status: 502, body: 'Unavailable' }),
  );
  const input = geography.getByRole('searchbox', { name: 'Search for a geography' });
  await input.fill('Cornwall');
  await expect(geography.locator('.fphd-geo-alt__tree').getByRole('status')).toContainText(
    'Geography search is not working',
  );
  await page.unroute('**/geographies?*');
  await geography.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    geography
      .getByRole('group', { name: 'Areas in Upper-tier local authorities', exact: true })
      .getByRole('checkbox', { name: 'Cornwall', exact: true }),
  ).toBeVisible();
  await input.fill('zzzzzzzzzzzz');
  await expect(geography.locator('.fphd-geo-alt__tree').getByRole('status')).toContainText(
    'No geographies found',
  );
});

test('geography failure stays visible after scrolling previous results', async ({ page }) => {
  await ready(page);
  const geography = card(page, 'Geographies');
  const tree = geography.locator('.fphd-geo-alt__tree');
  const input = geography.getByRole('searchbox', { name: 'Search for a geography' });
  await input.fill('E');
  await expect(
    tree
      .getByRole('group', { name: /^Areas in / })
      .first()
      .getByRole('checkbox')
      .first(),
  ).toBeVisible();
  await tree.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.route('**/geographies?*', (route) =>
    route.fulfill({ status: 502, body: 'Unavailable' }),
  );
  await input.fill('Cornwall');
  await expect(tree.getByRole('status').first()).toContainText('Geography search is not working');
  await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBe(0);
  const retry = tree.getByRole('button', { name: 'Try again' });
  expect(
    await retry.evaluate((button) => {
      const tree = button.closest('.fphd-geo-alt__tree');
      if (!tree) return false;
      return button.getBoundingClientRect().bottom <= tree.getBoundingClientRect().bottom;
    }),
  ).toBe(true);
});

test('filter navigation preserves unsubmitted search text', async ({ page }) => {
  await ready(page);
  const keyword = page.getByRole('searchbox', { name: 'Search by keywords' });
  await keyword.fill('unfinished keyword');
  const frameworks = card(page, 'Frameworks and programmes');
  await frameworks.getByRole('button', { name: 'Frameworks and programmes', exact: true }).click();
  const geography = card(page, 'Geographies');
  await geography.getByRole('button', { name: 'Expand Upper-tier local authorities' }).click();
  await geography.getByRole('checkbox', { name: 'County Durham' }).check();
  await expect(page).toHaveURL(/ga=E06000047/);
  await expect(keyword).toHaveValue('unfinished keyword');
  await expect(
    frameworks.getByRole('button', { name: 'Frameworks and programmes', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
});

test('geography searches keep existing areas visible while loading', async ({ page }, testInfo) => {
  await ready(page);
  const geography = card(page, 'Geographies');
  await geography.getByRole('button', { name: 'Expand Upper-tier local authorities' }).click();
  await expect(geography.getByRole('checkbox', { name: 'County Durham' })).toBeVisible();
  let finishSearch: (() => Promise<void>) | undefined;
  await page.route('**/geographies?*', (route) => {
    finishSearch = () => route.fulfill({ json: { groups: [] } });
  });
  const requested = page.waitForRequest('**/geographies?*');
  await geography.getByRole('searchbox', { name: 'Search for a geography' }).fill('missing-place');
  await requested;

  await expect(geography.getByRole('checkbox', { name: 'County Durham' })).toBeVisible();
  await expect(geography.locator('.fphd-geo-alt__tree').getByRole('status')).toContainText(
    'Finding geographies',
  );
  await expect(
    geography.locator('.fphd-geo-alt__tree').getByRole('status').locator('p'),
  ).toHaveClass(/govuk-visually-hidden/);
  await expect(geography.getByText('No geographies found')).toHaveCount(0);
  await finishSearch?.();
  await expect(geography.locator('.fphd-geo-alt__tree').getByRole('status')).toContainText(
    'No geographies found',
  );
  await expectNoAccessibilityViolations(page, testInfo);
});

test('geography searches keep previous results visible while loading', async ({ page }) => {
  await ready(page);
  const geography = card(page, 'Geographies');
  const input = geography.getByRole('searchbox', { name: 'Search for a geography' });
  await input.fill('Cornwall');
  await expect(
    geography
      .getByRole('group', { name: 'Areas in Upper-tier local authorities', exact: true })
      .getByRole('checkbox', { name: 'Cornwall', exact: true }),
  ).toBeVisible();

  let finishSearch: (() => Promise<void>) | undefined;
  await page.route('**/geographies?*', (route) => {
    finishSearch = () => route.fulfill({ json: { groups: [] } });
  });
  const requested = page.waitForRequest('**/geographies?*');
  await input.fill('missing-place');
  await requested;

  await expect(
    geography
      .getByRole('group', { name: 'Areas in Upper-tier local authorities', exact: true })
      .getByRole('checkbox', { name: 'Cornwall', exact: true }),
  ).toBeVisible();
  await finishSearch?.();
  await expect(geography.locator('.fphd-geo-alt__tree').getByRole('status')).toContainText(
    'No geographies found',
  );

  const nextRequest = page.waitForRequest('**/geographies?*');
  await input.fill('another-place');
  await nextRequest;
  await expect(
    geography.getByRole('button', { name: 'Expand Upper-tier local authorities' }),
  ).toBeVisible();
  await finishSearch?.();
});

test('a whole level exceeding the area limit shows a notice on the indicator view', async ({
  page,
}) => {
  await ready(page, '/search?geo=Local+authorities');
  await results(page).getByRole('link').first().click();
  await expect(page.getByText(/Showing the first 20 selected areas/)).toBeVisible();
});

test('expanded filters have no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await ready(page);
  const filterCards = page.locator('.fphd-filter-card');
  await expect(filterCards.first()).toBeVisible();
  for (const filterCard of await filterCards.all()) {
    const expand = filterCard.locator('.fphd-filter-card__toggle[aria-expanded="false"]');
    if (await expand.count()) await expand.click();
  }
  await expectNoAccessibilityViolations(page, testInfo);
});

for (const width of [320, 390, 640, 768, 1024, 1440]) {
  test(`search fits a ${width}px viewport with aligned titles`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const row = results(page).locator('.fphd-search-result').first();
    const title = await row.getByRole('link').first().boundingBox();
    if (!title) throw new Error('The result title must be visible');
    expect(title.x).toBeGreaterThanOrEqual(0);
    expect(
      await row
        .getByRole('link')
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe('19px');
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('search and individual geography selections work through to the indicator view', async ({
    page,
  }) => {
    await page.goto('/search');
    await page.getByRole('searchbox', { name: 'Search by keywords' }).fill('mortality');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/q=mortality/);
    const geography = card(page, 'Geographies');
    await geography.getByRole('searchbox', { name: 'Search for a geography' }).fill('Cornwall');
    await geography.getByRole('button', { name: 'Find geographies', exact: true }).click();
    await expect(page).toHaveURL(/geo-q=Cornwall/);
    await geography
      .getByRole('group', { name: 'Areas in Upper-tier local authorities', exact: true })
      .getByRole('checkbox', { name: 'Cornwall', exact: true })
      .check();
    await geography.getByRole('button', { name: 'Apply geographies' }).click();
    await expect(page).toHaveURL(/ga=E06000052/);
    await results(page).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/indicator\/.*as=E06000052/);
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Compare areas', exact: true })).toBeVisible();
    const indicator = page.locator('#indicator-data');
    await expect(
      indicator.getByRole('link', { name: 'Remove Cornwall filter', exact: true }),
    ).toBeVisible();
    await indicator.getByRole('searchbox', { name: 'Search for a geography' }).fill('Devon');
    await indicator.getByRole('button', { name: 'Find geographies', exact: true }).click();
    await expect(
      indicator
        .getByRole('group', { name: 'Areas in Upper-tier local authorities', exact: true })
        .getByRole('checkbox', { name: 'Devon', exact: true }),
    ).toBeVisible();
  });

  test('browsing a geography level reveals areas without losing existing levels', async ({
    page,
  }) => {
    await page.goto('/search?geo=NHS+regions');
    const geography = card(page, 'Geographies');
    await geography
      .getByRole('button', { name: 'Show areas in Statistical regions', exact: true })
      .click();
    await expect(
      geography.getByRole('checkbox', { name: 'North East', exact: true }),
    ).toBeVisible();
    await geography.getByRole('searchbox', { name: 'Search for a geography' }).fill('Cornwall');
    await geography.getByRole('button', { name: 'Find geographies', exact: true }).click();
    await geography
      .getByRole('group', { name: 'Areas in Upper-tier local authorities', exact: true })
      .getByRole('checkbox', { name: 'Cornwall', exact: true })
      .check();
    await geography.getByRole('button', { name: 'Apply geographies' }).click();
    await expect(page).toHaveURL(/geo=NHS\+regions/);
    await expect(page).toHaveURL(/ga=E06000052/);
  });
});
