import { expect, type Page, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './accessibility.ts';
import { downloadFrom } from './downloads.ts';
import { MORTALITY_NAME, MORTALITY_PATH } from './indicator-page.ts';

const TOPIC_PATH = '/topics/mortality-and-life-expectancy';

async function openTopicPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.govuk-tabs')).not.toHaveClass(/fphd-tabs--ssr/);
}

export function topicPageTests() {
  test('preloads every section, uses mobile anchors and switches desktop tabs without reloading topic data', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTopicPage(page, '/topics/diabetes?ga=E10000032#topic-overview');
    const data = page.locator('#topic-data');
    const areas = page.locator('#topic-area-summaries');
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Highlighted indicators' })).toBeVisible();
    await expect(data.getByRole('table')).toBeVisible();
    await expect(areas.getByRole('table')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Official statistics releases on GOV.UK' }),
    ).toBeVisible();
    const requests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        request.isNavigationRequest() ||
        (url.pathname.endsWith('.data') && url.searchParams.get('_routes') !== 'root')
      )
        requests.push(request.url());
    });
    await expect(page.getByRole('link', { name: 'Data', exact: true })).toHaveAttribute(
      'href',
      '#topic-data',
    );
    await page.getByRole('link', { name: 'Data', exact: true }).click();
    await expect(page).toHaveURL(/#topic-data$/);
    await expect(data.getByRole('heading', { name: 'Data', exact: true })).toBeInViewport();
    await page.getByRole('link', { name: 'More information', exact: true }).click();
    await expect(page).toHaveURL(/#topic-publications$/);
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await expect(page).toHaveURL(/#topic-overview$/);
    await expectNoAccessibilityViolations(page, testInfo);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('tab', { name: 'Data', exact: true }).click();
    await expect(data.getByRole('table')).toBeVisible();
    await expect(page.locator('.govuk-tabs__panel[aria-busy="true"]')).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.goForward();
    await expect(data.getByRole('table')).toBeVisible();
    expect(requests).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(data.getByRole('table')).toBeVisible();
    await expect(areas.getByRole('table')).toBeVisible();
  });

  test('shows every topic section without JavaScript and follows native Contents anchors', async ({
    page,
    baseURL,
  }) => {
    if (baseURL === undefined) throw new Error('A base URL is required');
    const context = await page
      .context()
      .browser()
      ?.newContext({
        baseURL,
        storageState: await page.context().storageState(),
        javaScriptEnabled: false,
      });
    if (!context) throw new Error('A browser context is required');
    const withoutJs = await context.newPage();
    try {
      await withoutJs.setViewportSize({ width: 390, height: 844 });
      await withoutJs.goto('/topics/diabetes');
      await expect(withoutJs.locator('#topic-data').getByRole('table')).toBeVisible();
      await expect(withoutJs.locator('#topic-area-summaries').getByRole('table')).toBeVisible();
      await expect(
        withoutJs.getByRole('heading', { name: 'Official statistics releases on GOV.UK' }),
      ).toBeVisible();
      await withoutJs.getByRole('link', { name: 'Data', exact: true }).click();
      await expect(withoutJs).toHaveURL(/#topic-data$/);
      await expect(
        withoutJs.locator('#topic-data').getByRole('heading', { name: 'Data', exact: true }),
      ).toBeInViewport();
    } finally {
      await context.close();
    }
  });

  test('shows topic overview counts and highlighted indicator links', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes');
    await expect(
      page.getByRole('heading', { name: /Diabetes has \d+ indicators in total/ }),
    ).toBeVisible();
    await expect(page.getByText(/(?:are|is) getting better/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Highlighted indicators' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Diabetes: QOF prevalence' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Diabetes: QOF prevalence, England: trend chart' }),
    ).toContainText('Data visualisation to follow');
    await expect(page.getByRole('link', { name: 'View all diabetes indicators' })).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('stacks the overview toolbar as soon as the standard page width no longer fits', async ({
    page,
  }) => {
    await openTopicPage(page, '/topics/diabetes');
    for (const width of [320, 654, 960, 1020, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const sidebar = await page
        .locator('.fphd-topic-overview > .govuk-grid-column-one-quarter')
        .boundingBox();
      const content = await page
        .locator('.fphd-topic-overview > .govuk-grid-column-three-quarters')
        .boundingBox();
      if (width <= 1020)
        expect(content?.y).toBeGreaterThanOrEqual((sidebar?.y ?? 0) + (sidebar?.height ?? 0));
      else expect(content?.y).toBe(sidebar?.y);
      for (const card of await page.locator('.fphd-topic-highlight').all()) {
        expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
      }
    }
  });

  test('chooses one overview geography from the prototype authority tiers', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes');
    const panel = page.getByRole('tabpanel', { name: 'Overview', exact: true });
    await panel.getByRole('button', { name: 'Upper-tier local authorities', exact: true }).click();
    const choices = panel.getByRole('group', {
      name: 'Areas in Upper-tier local authorities',
      exact: true,
    });
    await choices.getByRole('radio', { name: 'Manchester', exact: true }).check();
    await expect(page).toHaveURL(/ga=E08000003/);
    await expect(panel.getByText('Manchester', { exact: true })).toHaveCount(2);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('lists indicators with the prototype data columns and detail links', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=data`);
    const panel = page.getByRole('tabpanel', { name: 'Data' });
    const table = panel.getByRole('table', { name: /Mortality and life expectancy indicators/ });
    await expect(table).toBeVisible();
    for (const column of [
      'Indicator',
      'Most recent period',
      'Last updated',
      'Trend (last 5 periods)',
      'Calculated value',
    ]) {
      await expect(table.getByRole('columnheader', { name: column })).toBeVisible();
    }
    await expect(
      panel.getByRole('link', { name: MORTALITY_NAME, exact: true }).first(),
    ).toHaveAttribute('href', MORTALITY_PATH);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('changes topic table columns and downloads the same view', async ({ page }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes?tab-topic=data');
    const panel = page.getByRole('tabpanel', { name: 'Data', exact: true });
    const table = panel.getByRole('table');
    await panel.getByRole('button', { name: 'Table columns', exact: true }).click();
    await panel.getByRole('checkbox', { name: 'Count', exact: true }).check();
    await panel.getByRole('checkbox', { name: 'Numerator', exact: true }).check();
    await panel.getByRole('checkbox', { name: 'Last updated', exact: true }).uncheck();
    await expect(panel.getByRole('checkbox', { name: 'Count', exact: true })).toBeChecked();
    await expect(
      panel.getByRole('checkbox', { name: 'Last updated', exact: true }),
    ).not.toBeChecked();
    await expect(table.getByRole('columnheader', { name: 'Count', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Numerator', exact: true })).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: 'Last updated', exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(table.getByRole('columnheader', { name: 'Count', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Subtopics and types', exact: true }).click();
    await panel.getByRole('checkbox', { name: 'Prevalence and risk', exact: true }).check();
    await expect(page).toHaveURL(/subtopic=prevalence-and-risk/);
    await expect(table.getByRole('columnheader', { name: 'Count', exact: true })).toBeVisible();
    await panel.getByText('Download or share data', { exact: true }).click();
    const csv = await downloadFrom(page, 'Download filtered data (CSV)', 'link');
    expect(csv.text.split('\n')[0]).toContain('England count');
    expect(csv.text.split('\n')[0]).toContain('England numerator');
    expect(csv.text.split('\n')[0]).not.toContain('Last updated');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('keeps topic data columns readable and scrollable at every width', async ({
    page,
  }, testInfo) => {
    const panel = page.locator('#topic-data');
    const region = panel.locator('.fphd-table-scroll-wrapper');
    for (const slug of ['diabetes', 'mortality-and-life-expectancy']) {
      await openTopicPage(page, `/topics/${slug}?tab-topic=data`);
      for (const width of [375, 641, 834, 1024, 1280, 1440, 2048]) {
        await page.setViewportSize({ width, height: 1000 });
        const overlaps = await region.locator('.fphd-trend-tag').evaluateAll(
          (tags) =>
            tags.filter((tag) => {
              const cell = tag.closest('td')?.getBoundingClientRect();
              return !cell || tag.getBoundingClientRect().right > cell.right;
            }).length,
        );
        expect(overlaps).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      }
    }
    await page.setViewportSize({ width: 834, height: 1000 });
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('switches area summary geography and filters the areas without leaving the topic', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=areas`);
    await page.getByRole('radio', { name: 'Statistical regions', exact: true }).check();
    await expect(page).toHaveURL(/geo=Statistical/);
    const table = page.getByRole('table', { name: 'Topic indicators by area' });
    await expect(
      table.getByRole('columnheader', { name: 'South West', exact: true }),
    ).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search for a geography (optional)' }).fill('London');
    await page.getByRole('checkbox', { name: 'London', exact: true }).check();
    await expect(page).toHaveURL(/ga=E12000007/);
    await expect(table.getByRole('columnheader', { name: 'London', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'South West', exact: true })).toHaveCount(
      0,
    );
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('uses the prototype widths for each topic tab', async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1200 });
    await openTopicPage(page, '/topics/diabetes');
    for (const [tab, width] of [
      ['Overview', 960],
      ['Data', 1988],
      ['Area summaries', 1442],
      ['More information', 960],
    ] as const) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      const panel = page.getByRole('tabpanel', { name: tab, exact: true });
      await expect(panel).not.toHaveAttribute('aria-busy', 'true');
      await expect
        .poll(async () => Math.round((await panel.boundingBox())?.width ?? 0))
        .toBe(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(2048);
    }
  });

  test('keeps the tab row in place when switching between wrapped labels', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes');
    const position = () =>
      page.getByRole('tablist').evaluate((element) => {
        const { top, height } = element.getBoundingClientRect();
        return { top: top + window.scrollY, height };
      });
    for (const width of [641, 834, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const initial = await position();
      for (const label of ['Overview', 'Data', 'Area summaries', 'More information']) {
        await page.getByRole('tab', { name: label, exact: true }).click();
        await expect(page.getByRole('tabpanel', { name: label, exact: true })).not.toHaveAttribute(
          'aria-busy',
          'true',
        );
        const current = await position();
        expect(Math.abs(current.top - initial.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(current.height - initial.height)).toBeLessThanOrEqual(1);
      }
    }
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('filters by subtopic and keeps the filter when sorting', async ({ page }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes?tab-topic=data');
    await page.getByRole('button', { name: 'Subtopics and types', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Prevalence and risk', exact: true }).check();
    await expect(page).toHaveURL(/subtopic=prevalence-and-risk/);
    const table = page.getByRole('table', { name: /Diabetes indicators/ });
    await expect(table.getByRole('link', { name: 'Diabetes: QOF prevalence' })).toBeVisible();
    await expect(table.getByRole('link', { name: /Mortality/ })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('name-desc');
    await expect(page).toHaveURL(/subtopic=prevalence-and-risk/);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('allows both year boundaries to be entered before applying the range', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes?tab-topic=data');
    await page.getByRole('button', { name: 'Years the data covers', exact: true }).click();
    const from = page.getByRole('textbox', { name: 'From', exact: true });
    const to = page.getByRole('textbox', { name: 'To', exact: true });
    await from.fill('2010');
    await from.press('Tab');
    await expect(to).toBeFocused();
    await expect(page).not.toHaveURL(/fromYear=/);
    await to.fill('2023');
    await page.getByRole('heading', { name: 'Display options', exact: true }).click();
    await expect(page).toHaveURL(/fromYear=2010/);
    await expect(page).toHaveURL(/toYear=2023/);
    await expect(from).toHaveValue('2010');
    await expect(to).toHaveValue('2023');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('keeps filters and sorting within the topic', async ({ page }) => {
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=data`);
    await page
      .getByRole('searchbox', { name: 'Search mortality and life expectancy indicators' })
      .fill('Under 75');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(
      page.getByRole('link', { name: MORTALITY_NAME, exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('name-desc');
    await expect(page).toHaveURL(/sort=name-desc/);
    await expect(page).toHaveURL(/\/topics\/mortality-and-life-expectancy/);
  });

  test('keeps subtopic filters when a server sort is pending', async ({ page }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes?tab-topic=data');
    await page.getByRole('button', { name: 'Subtopics and types', exact: true }).click();
    const subtopic = page.getByRole('checkbox', { name: 'Prevalence and risk', exact: true });
    const sort = page.getByRole('combobox', { name: 'Sort by', exact: true });
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pattern = '**/topics/diabetes.data?*';
    await page.route(pattern, async (route) => {
      started();
      await gate;
      await route.continue().catch(() => {});
    });
    try {
      await sort.selectOption('name-desc');
      await requested;
      await subtopic.check();
    } finally {
      release();
    }
    await expect(page).toHaveURL(/subtopic=prevalence-and-risk/);
    await expect(page).toHaveURL(/sort=name-desc/);
    await expect(subtopic).toBeChecked();
    await expect(sort).toHaveValue('name-desc');
    await page.unroute(pattern);
    await page.goBack();
    await expect(subtopic).not.toBeChecked();
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('filters topic rows on the server and keeps small prototype-sized checkboxes', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes?tab-topic=data');
    const panel = page.locator('#topic-data');
    await panel.getByRole('button', { name: 'Subtopics and types', exact: true }).click();
    const subtopic = panel.getByRole('checkbox', { name: 'Prevalence and risk', exact: true });
    const table = panel.getByRole('table');
    const response = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/topics/diabetes.data' &&
        url.searchParams.get('subtopic') === 'prevalence-and-risk' &&
        url.searchParams.get('_routes') !== 'root'
      );
    });
    await subtopic.check();
    await response;
    await expect(page).toHaveURL(/subtopic=prevalence-and-risk/);
    await expect(
      table.getByRole('link', { name: 'Diabetes: QOF prevalence', exact: true }),
    ).toBeVisible();
    await expect(table.getByRole('link', { name: /Mortality/ })).toHaveCount(0);
    await subtopic.uncheck();
    await expect(table.getByRole('link', { name: /Mortality/ })).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Populations and inequalities', exact: true }),
    ).toHaveCount(0);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const id = await subtopic.getAttribute('id');
      const label = panel.locator(`label[for="${id}"]`);
      expect(await label.evaluate((element) => getComputedStyle(element, '::before').width)).toBe(
        '24px',
      );
      expect(await label.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px');
    }
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('keeps geography search and choices available while changing the area type', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=areas`);
    const panel = page.getByRole('tabpanel', { name: 'Area summaries' });
    const search = panel.getByLabel('Search for a geography (optional)', { exact: true });
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pattern = '**/topics/mortality-and-life-expectancy.data?*';
    await page.route(pattern, async (route) => {
      started();
      await gate;
      await route.continue().catch(() => {});
    });
    try {
      await panel.getByRole('radio', { name: 'Statistical regions', exact: true }).check();
      await requested;
      await expect(search).toBeVisible();
      await expect(panel.getByRole('checkbox').first()).toBeVisible();
      await expect(
        panel.getByRole('radio', { name: 'Statistical regions', exact: true }),
      ).toBeChecked();
      await search.fill('London');
      await expect(panel.getByRole('checkbox', { name: 'London', exact: true })).toBeVisible();
    } finally {
      release();
    }
    await expect(page).toHaveURL(/geo=Statistical/);
    await page.unroute(pattern);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('opens area summaries on NHS regions with geography controls', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=areas`);
    const panel = page.getByRole('tabpanel', { name: 'Area summaries' });
    await expect(panel.getByRole('heading', { name: 'Geographies' })).toBeVisible();
    const table = panel.getByRole('table', { name: 'Topic indicators by area' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'England', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'London', exact: true })).toBeVisible();
    const ids = await page.locator('[id]').evaluateAll((elements) => elements.map(({ id }) => id));
    expect(ids.length).toBe(new Set(ids).size);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('shows API backed publication links on the more information tab', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes?tab-topic=publications');
    const panel = page.getByRole('tabpanel', { name: 'More information' });
    await expect(
      panel.getByRole('heading', { name: 'Official statistics releases on GOV.UK' }),
    ).toBeVisible();
    await expect(
      panel.getByRole('link', { name: 'Diabetes official statistical release, April 2026' }),
    ).toHaveAttribute(
      'href',
      'https://www.gov.uk/government/statistics/diabetes-profile-update-april-2026',
    );
    await expect(panel.getByRole('link', { name: 'Diabetes on GOV.UK' })).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('keeps the active tab after reload', async ({ page }) => {
    await openTopicPage(page, TOPIC_PATH);
    await page.getByRole('tab', { name: 'Data' }).click();
    await expect(page).toHaveURL(/tab-topic=data/);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');
  });
}
