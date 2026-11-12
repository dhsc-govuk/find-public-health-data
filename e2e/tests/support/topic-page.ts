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
  test('streams the topic heading and navigation before its section data', async ({ page }) => {
    const response = await page.request.get('/topics/diabetes', {
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36' },
    });
    expect(response.ok()).toBe(true);
    const html = await response.text();
    const shell = html.split('</html>')[0]?.replaceAll('<!-- -->', '');
    expect(shell).toContain('Diabetes');
    expect(shell).toContain('topic-area-summaries');
    expect(shell).toContain('Loading overview');
    expect(shell).toContain('Loading data');
    expect(html).toContain('Highlighted indicators');
    expect(html).toContain('<table');
  });

  test('shows every topic section together on mobile and switches desktop tabs locally', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTopicPage(page, '/topics/diabetes?ga=E10000032#topic-overview');
    const data = page.locator('#topic-data');
    const areas = page.locator('#topic-area-summaries');
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Highlighted indicators' })).toBeVisible();
    await expect(data.getByRole('heading', { name: 'Data', exact: true })).toBeVisible();
    await expect(areas.getByRole('heading', { name: 'Area summaries', exact: true })).toBeVisible();
    await expect(data.getByRole('table')).toBeVisible();
    await expect(areas.getByRole('table')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Official statistics releases on GOV.UK' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Data', exact: true }).click();
    await expect(page).toHaveURL(/#topic-data$/);
    await expect(data.getByRole('heading', { name: 'Data', exact: true })).toBeInViewport();
    await expect(data.getByRole('table')).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('tab', { name: 'Data', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const reads: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/topics/diabetes.data')) reads.push(request.url());
    });
    await page.getByRole('tab', { name: 'Area summaries', exact: true }).click();
    await expect(areas.getByRole('table')).toBeVisible();
    await page.goBack();
    await expect(data.getByRole('table')).toBeVisible();
    await page.goForward();
    await expect(areas.getByRole('table')).toBeVisible();
    expect(reads).toEqual([]);
  });

  test('loads every topic section through the JavaScript-free fallback and follows the contents links', async ({
    page,
    browser,
    baseURL,
  }) => {
    if (baseURL === undefined) throw new Error('A base URL is required');
    const context = await browser.newContext({
      baseURL,
      storageState: await page.context().storageState(),
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    const withoutJs = await context.newPage();
    try {
      await withoutJs.goto('/topics/diabetes');
      await withoutJs.getByRole('link', { name: 'Show all sections', exact: true }).click();
      for (const [label, anchor, content] of [
        ['Data', 'topic-data', withoutJs.locator('#topic-data').getByRole('table')],
        [
          'Area summaries',
          'topic-area-summaries',
          withoutJs.locator('#topic-area-summaries').getByRole('table'),
        ],
        [
          'More information',
          'topic-publications',
          withoutJs.getByRole('heading', { name: 'Official statistics releases on GOV.UK' }),
        ],
        [
          'Overview',
          'topic-overview',
          withoutJs.getByRole('heading', { name: 'Highlighted indicators' }),
        ],
      ] as const) {
        await expect(content).toBeVisible();
        await withoutJs.getByRole('link', { name: label, exact: true }).click();
        await expect(withoutJs).toHaveURL(new RegExp(`#${anchor}$`));
        await expect(content).toBeVisible();
      }
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
    await expect(
      page.locator('#topic-overview').getByText(/(?:are|is) getting better/),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Highlighted indicators' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Diabetes: QOF prevalence' })).toBeVisible();
    const highlight = page.getByRole('region', {
      name: 'Diabetes: QOF prevalence, England: trend chart',
    });
    const sparkline = highlight.getByRole('img', {
      name: 'Diabetes: QOF prevalence, England: trend chart',
    });
    await expect(sparkline.locator('polyline')).toBeVisible();
    await expect(sparkline).toHaveAttribute('viewBox', '0 0 120 40');
    await expect(sparkline).toHaveCSS('height', '56px');
    await expect(sparkline.locator('polyline')).toHaveAttribute('stroke', '#12436d');
    await expect(sparkline.locator('polyline')).toHaveAttribute('stroke-width', '2');
    await expect(sparkline.locator('polyline')).toHaveAttribute('points', /^(?:\S+ ){7}\S+$/);
    await expect(sparkline.locator('circle')).toHaveAttribute('r', '3');
    await expect(sparkline).toHaveAccessibleDescription(
      /rising from 6\.8% in 2017 to 2018, to 7\.9% in 2024 to 2025$/,
    );
    await expect(highlight.locator('.fphd-sparkline__endpoints')).toContainText('7.9%');
    await expect(highlight.locator('details, table')).toHaveCount(0);
    const mortality = page.getByRole('region', { name: /Mortality.*England: trend chart/ });
    await expect(mortality.getByRole('img').locator('polyline')).toHaveAttribute(
      'points',
      /^(?:\S+ ){7}\S+$/,
    );
    await expect(mortality.getByRole('img')).toHaveAccessibleDescription(
      /rose from 92\.3 per 100,000 in 2015 to 2017, peaked at 125\.6 in 2020 to 2022, and has since decreased to 109\.6 in 2022 to 2024$/,
    );
    for (const [chart, period, count, value] of [
      [highlight, '2024 to 2025', '4,109,134', '7.9%'],
      [mortality, '2022 to 2024', '186,922', '109.6 per 100,000'],
    ] as const) {
      const card = page.locator('.fphd-topic-highlight').filter({ has: chart });
      await expect(card.locator('.govuk-summary-list__key')).toHaveText([
        'Most recent period',
        'Count',
        'Calculated value',
        'Trend (last 5 periods)',
      ]);
      await expect(card.locator('.govuk-summary-list__value').nth(0)).toHaveText(period);
      await expect(card.locator('.govuk-summary-list__value').nth(1)).toHaveText(count);
      await expect(card.locator('.govuk-summary-list__value').nth(2)).toHaveText(value);
    }
    const cards = page.locator('.fphd-topic-highlight');
    await expect(cards.nth(0).locator('.fphd-trend-tag')).toHaveText('Increasing');
    await expect(cards.nth(1).locator('.fphd-trend-tag')).toHaveCount(0);
    await expect(cards.nth(1).locator('.fphd-trend-reason')).toHaveText('multi-year periods');
    await expect(cards.nth(1).locator('.govuk-summary-list__value').nth(3)).toHaveText(
      'Trend unavailable (multi-year periods)',
    );
    await expect(
      cards.nth(1).locator('.govuk-summary-list__value').nth(2).locator('.govuk-hint'),
    ).toHaveText('per 100,000');
    for (const card of [cards.nth(2), cards.nth(3)]) {
      await expect(card.locator('.govuk-summary-list__value').nth(3)).toHaveText(
        'Trend unavailable (not enough data points)',
      );
      await expect(card.locator('.fphd-trend-reason')).toHaveText('not enough data points');
    }
    await expect(page.getByRole('link', { name: 'View all diabetes indicators' })).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('stacks the overview toolbar as soon as the standard page width no longer fits', async ({
    page,
  }) => {
    await openTopicPage(page, '/topics/diabetes');
    for (const width of [320, 640, 641, 654, 960, 1020, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const sidebar = await page
        .locator('#topic-overview .fphd-topic-overview > .govuk-grid-column-one-quarter')
        .boundingBox();
      const content = await page
        .locator('#topic-overview .fphd-topic-overview > .govuk-grid-column-three-quarters')
        .boundingBox();
      if (width <= 1020)
        expect(content?.y).toBeGreaterThanOrEqual((sidebar?.y ?? 0) + (sidebar?.height ?? 0));
      else expect(content?.y).toBe(sidebar?.y);
      for (const card of await page.locator('#topic-overview .fphd-topic-highlight').all()) {
        expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
      }
      const cards = page.locator('#topic-overview .fphd-topic-highlight');
      const first = await cards.nth(0).boundingBox();
      const second = await cards.nth(1).boundingBox();
      if (width < 641) {
        expect(first?.x).toBe(second?.x);
        expect((second?.y ?? 0) - (first?.y ?? 0) - (first?.height ?? 0)).toBeCloseTo(40, 1);
      } else {
        expect(first?.y).toBe(second?.y);
        expect(second?.x).toBeGreaterThan(first?.x ?? 0);
        for (const pair of [
          [0, 1],
          [2, 3],
        ] as const) {
          for (const selector of [
            'h3',
            '.fphd-chart-section, .fphd-topic-highlight__no-trend',
            '.govuk-summary-list',
          ]) {
            const left = await cards.nth(pair[0]).locator(selector).boundingBox();
            const right = await cards.nth(pair[1]).locator(selector).boundingBox();
            expect(left?.y).toBe(right?.y);
          }
        }
        if (width === 1280) {
          for (const card of await cards.all()) {
            const lines = await card
              .locator('.govuk-summary-list__key')
              .nth(3)
              .evaluate((key) => {
                const range = document.createRange();
                range.selectNodeContents(key);
                return range.getClientRects().length;
              });
            expect(lines).toBe(1);
          }
        }
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
    await expect(choices.getByRole('radio', { name: 'Manchester', exact: true })).toBeChecked();
    await expect(
      panel.getByRole('region', { name: 'Diabetes: QOF prevalence, Manchester: trend chart' }),
    ).toBeVisible();
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
    await expect(page.locator('#topic-data [aria-busy]')).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('searchbox', { name: 'Search for a geography (optional)' }).fill('London');
    const responseGate = Promise.withResolvers<void>();
    let responseHeld = false;
    await page.route(`**${TOPIC_PATH}.data?*`, async (route) => {
      responseHeld = true;
      await responseGate.promise;
      await route.continue();
    });
    try {
      await page.getByRole('checkbox', { name: 'London', exact: true }).check();
      await expect.poll(() => responseHeld).toBe(true);
      await expect(table.getByRole('columnheader', { name: 'London', exact: true })).toBeVisible();
      await expect(
        table.getByRole('columnheader', { name: 'South West', exact: true }),
      ).toHaveCount(0);
      await expect(page.locator('#topic-area-summaries [aria-busy]')).toHaveAttribute(
        'aria-busy',
        'true',
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('#topic-data').getByRole('table')).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'London', exact: true })).toBeVisible();
      await expect(
        table.getByRole('columnheader', { name: 'South West', exact: true }),
      ).toHaveCount(0);
    } finally {
      responseGate.resolve();
    }
    await expect(page).toHaveURL(/ga=E12000007/);
    await expect(table.getByRole('columnheader', { name: 'London', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'South West', exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator('#topic-area-summaries [aria-busy]')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('uses the prototype widths for each topic tab', async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1200 });
    await openTopicPage(page, '/topics/diabetes');
    for (const [tab, width] of [
      ['Overview', 1020],
      ['Data', 1988],
      ['Area summaries', 1442],
      ['More information', 1020],
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
      for (const label of ['More information', 'Overview']) {
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
    await expect
      .poll(async () => {
        const ids = await page
          .locator('[id]')
          .evaluateAll((elements) => elements.map(({ id }) => id));
        return ids.length === new Set(ids).size;
      })
      .toBe(true);
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
