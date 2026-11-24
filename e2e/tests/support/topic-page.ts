import { expect, type Page, test } from '@playwright/test';
import { parse } from 'csv-parse/sync';
import { expectNoAccessibilityViolations } from './accessibility.ts';
import { downloadFrom } from './downloads.ts';
import { MORTALITY_NAME, MORTALITY_PATH } from './indicator-page.ts';

const TOPIC_PATH = '/topics/mortality-and-life-expectancy';
const OHID_STATISTICS_LINK =
  'Release calendar for the Office for Health Improvement and Disparities';

export async function openTopicPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.govuk-tabs')).not.toHaveClass(/fphd-tabs--ssr/);
}

function expectAreaCsvColumns(csv: string, areas: string[]) {
  const [header] = parse(csv, { to_line: 1 }) as string[][];
  expect(header).toEqual([
    'Indicator',
    'Unit',
    'Latest period',
    'England',
    'England period',
    ...areas.flatMap((area) => [area, `${area} period`, `${area} comparison`, `${area} notes`]),
  ]);
}

export function topicPageTests() {
  test('includes every topic section in the initial HTML without loading placeholders', async ({
    page,
  }) => {
    const response = await page.request.get('/topics/diabetes', {
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36' },
    });
    expect(response.ok()).toBe(true);
    const html = await response.text();
    const document = html.split('</html>')[0]?.replaceAll('<!-- -->', '');
    expect(document).toContain('Diabetes');
    expect(document).toContain('Highlighted indicators');
    expect(document).toMatch(/Diabetes indicators by [a-z]/);
    expect(document).toContain('Official statistics releases on GOV.UK');
    expect(document).toContain('<table');
    expect(document).not.toMatch(/Loading (overview|data|area summaries)/);
    expect(html).not.toContain('<!--$?-->');
    expect(html).not.toContain('Show all sections');
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

  test('loads every topic section without JavaScript and follows the contents links', async ({
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
      await expect(withoutJs.getByRole('status').filter({ hasText: /^Loading / })).toHaveCount(0);
      await expect(
        withoutJs.getByRole('link', { name: 'Show all sections', exact: true }),
      ).toHaveCount(0);
      await withoutJs.reload();
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
      /rose from 94\.4 per 100,000 in 2017, peaked at 132\.0 in 2020, and has since decreased to 105\.0 in 2024$/,
    );
    for (const [chart, period, count, value] of [
      [highlight, '2024 to 2025', '4,109,134', '7.9%'],
      [mortality, '2024', '60,825', '105.0 per 100,000'],
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
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).locator('.fphd-trend-tag')).toHaveText('Increasing');
    await expect(cards.nth(1).locator('.fphd-trend-tag')).toHaveText(
      'Decreasing and getting better',
    );
    await expect(cards.nth(1).locator('.fphd-trend-reason')).toHaveCount(0);
    await expect(cards.nth(1).locator('.govuk-summary-list__value').nth(3)).toHaveText(
      'Decreasing and getting better',
    );
    await expect(
      cards.nth(1).locator('.govuk-summary-list__value').nth(2).locator('.govuk-hint'),
    ).toHaveText('per 100,000');
    await expect(page.getByRole('link', { name: 'View all diabetes indicators' })).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('stacks the overview toolbar as soon as the standard page width no longer fits', async ({
    page,
  }) => {
    await openTopicPage(page, '/topics/diabetes');
    await expect(page.locator('#topic-overview .fphd-topic-highlight')).toHaveCount(2);
    for (const width of [320, 640, 641, 654, 764, 960, 1020, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(width);
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
        for (let index = 0; index + 1 < (await cards.count()); index += 2) {
          for (const selector of [
            'h3',
            '.fphd-chart-section, .fphd-topic-highlight__no-trend',
            '.govuk-summary-list',
          ]) {
            const left = await cards.nth(index).locator(selector).boundingBox();
            const right = await cards
              .nth(index + 1)
              .locator(selector)
              .boundingBox();
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
      const overflowingTags = await page
        .locator('#topic-overview .fphd-topic-highlight .fphd-trend-tag')
        .evaluateAll(
          (tags) =>
            tags.filter((tag) => {
              const cell = tag.closest('dd')?.getBoundingClientRect();
              return !cell || tag.getBoundingClientRect().right > cell.right;
            }).length,
        );
      expect(overflowingTags).toBe(0);
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

  test('lists overview geography search results under their geography types', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes');
    const panel = page.getByRole('tabpanel', { name: 'Overview', exact: true });
    const search = panel.getByRole('searchbox', { name: 'Search for a geography', exact: true });
    const choices = panel.getByRole('region', { name: 'Geography choices for Overview' });
    const tier = (name: string) => choices.getByRole('button', { name, exact: true });
    const areasIn = (name: string) =>
      choices.getByRole('group', { name: `Areas in ${name}`, exact: true });
    await search.fill('cornwa');
    await expect(choices.getByRole('button', { expanded: true })).toHaveText([
      'Integrated care boards (ICBs)',
      'Upper-tier local authorities',
      'Lower-tier local authorities',
    ]);
    await expect(
      areasIn('Integrated care boards (ICBs)').getByRole('radio', {
        name: 'Cornwall and the Isles of Scilly',
        exact: true,
      }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);

    await areasIn('Lower-tier local authorities')
      .getByRole('radio', { name: 'Cornwall', exact: true })
      .check();
    await expect(page).toHaveURL(/ga=E06000052/);
    await expect(
      panel.getByRole('heading', { name: 'Diabetes has 2 indicators in Cornwall', exact: true }),
    ).toBeVisible();
    await expect(
      areasIn('Lower-tier local authorities').getByRole('radio', { name: 'Cornwall' }),
    ).toBeChecked();
    await expect(
      areasIn('Upper-tier local authorities').getByRole('radio', { name: 'Cornwall' }),
    ).not.toBeChecked();

    await areasIn('Upper-tier local authorities')
      .getByRole('radio', { name: 'Cornwall', exact: true })
      .check();
    await expect(
      areasIn('Upper-tier local authorities').getByRole('radio', { name: 'Cornwall' }),
    ).toBeChecked();
    await expect(
      areasIn('Lower-tier local authorities').getByRole('radio', { name: 'Cornwall' }),
    ).not.toBeChecked();

    await tier('Lower-tier local authorities').click();
    await expect(tier('Lower-tier local authorities')).toHaveAttribute('aria-expanded', 'false');
    await expect(areasIn('Lower-tier local authorities')).toHaveCount(0);

    await search.fill('kent');
    await expect(tier('Upper-tier local authorities')).toHaveAttribute('aria-expanded', 'true');
    await expect(
      areasIn('Upper-tier local authorities').getByRole('radio', { name: 'Kent', exact: true }),
    ).toBeVisible();
    await expect(tier('Lower-tier local authorities')).toHaveCount(0);
  });

  test('counts trends and shows figures for the area chosen on the overview', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes?tab-topic=data&ga=E12000007&ga=E06000052');
    const panel = page.getByRole('tabpanel', { name: 'Overview', exact: true });
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await expect(
      panel.getByRole('heading', { name: 'Diabetes has 2 indicators in London', exact: true }),
    ).toBeVisible();
    await panel
      .getByRole('searchbox', { name: 'Search for a geography', exact: true })
      .fill('West Sussex');
    await panel.getByRole('radio', { name: 'West Sussex', exact: true }).check();
    await expect(page).toHaveURL(/ga=E10000032/);
    expect(new URL(page.url()).searchParams.getAll('ga')).toEqual(['E10000032']);
    await expect(
      panel.getByRole('heading', { name: 'Diabetes has 2 indicators in West Sussex', exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText('In West Sussex, the trend over the last 5 data points is:', { exact: true }),
    ).toBeVisible();
    await expect(panel.locator('.fphd-trend-tag')).toHaveText([
      '0 are getting better',
      '1 is getting worse',
      '0 show no significant change',
      '1 is going up (higher is neither better nor worse)',
      '0 are going down (higher is neither better nor worse)',
      '0 cannot have a trend calculated',
      'Increasing',
    ]);
    await expect(panel.locator('.fphd-topic-highlight h3 .govuk-hint')).toHaveText([
      'in West Sussex',
      'in West Sussex',
    ]);
    await expectNoAccessibilityViolations(page, testInfo);
    await page.getByRole('tab', { name: 'Data', exact: true }).click();
    await expect(
      page
        .getByRole('tabpanel', { name: 'Data', exact: true })
        .getByRole('table', { name: /West Sussex compared with England/ }),
    ).toBeVisible();
  });

  test('keeps areas in the order they were picked and shows the first on the overview', async ({
    page,
  }) => {
    await openTopicPage(page, '/topics/diabetes?tab-topic=data');
    const data = page.getByRole('tabpanel', { name: 'Data', exact: true });
    for (const [name, code] of [
      ['London', 'E12000007'],
      ['Cornwall', 'E06000052'],
      ['Birmingham', 'E08000025'],
    ] as const) {
      await data.getByRole('searchbox', { name: 'Search for a geography', exact: true }).fill(name);
      await data
        .getByRole('group', { name: /^Areas in / })
        .locator(`input[value="${code}"]`)
        .first()
        .check();
      await expect(page).toHaveURL(new RegExp(`ga=${code}`));
    }
    expect(new URL(page.url()).searchParams.getAll('ga')).toEqual([
      'E12000007',
      'E06000052',
      'E08000025',
    ]);
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await expect(
      page
        .getByRole('tabpanel', { name: 'Overview', exact: true })
        .getByRole('heading', { name: 'Diabetes has 2 indicators in London', exact: true }),
    ).toBeVisible();
  });

  test('says the chosen area has no indicators when every value for it is suppressed', async ({
    page,
  }) => {
    await openTopicPage(page, '/topics/cancer?ga=E06000053');
    const panel = page.getByRole('tabpanel', { name: 'Overview', exact: true });
    await expect(
      panel.getByRole('heading', {
        name: 'Cancer has 0 indicators in Isles of Scilly',
        exact: true,
      }),
    ).toBeVisible();
    await openTopicPage(page, '/topics/mortality-and-life-expectancy?ga=E06000053');
    await expect(
      page.getByRole('tabpanel', { name: 'Overview', exact: true }).getByRole('heading', {
        name: 'Mortality and life expectancy has 1 indicator in Isles of Scilly',
        exact: true,
      }),
    ).toBeVisible();
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('checks the upper tier for an overview area listed under both council tiers', async ({
      page,
    }) => {
      await page.goto('/topics/diabetes?tab-topic=overview&ga=E06000052&geo-q=cornwa');
      const choices = page.locator('#topic-overview');
      await expect(
        choices
          .getByRole('group', { name: 'Areas in Upper-tier local authorities', exact: true })
          .getByRole('radio', { name: 'Cornwall', exact: true }),
      ).toBeChecked();
      await expect(
        choices
          .getByRole('group', { name: 'Areas in Lower-tier local authorities', exact: true })
          .getByRole('radio', { name: 'Cornwall', exact: true }),
      ).not.toBeChecked();
    });

    test('replaces the overview area with one chosen from a search that does not list it', async ({
      page,
    }) => {
      await page.goto('/topics/diabetes?tab-topic=overview&ga=E06000052&geo-q=kent');
      const panel = page.locator('#topic-overview');
      await panel.getByRole('radio', { name: 'Kent', exact: true }).check();
      await panel.getByRole('button', { name: 'Apply geographies', exact: true }).click();
      await expect(page).toHaveURL(/ga=E10000016/);
      expect(new URL(page.url()).searchParams.getAll('ga')).toEqual(['E10000016']);
      await expect(
        panel.getByRole('heading', { name: 'Diabetes has 2 indicators in Kent', exact: true }),
      ).toBeVisible();
    });

    test('counts trends for the area chosen on the overview', async ({ page }) => {
      await page.goto('/topics/diabetes');
      const panel = page.locator('#topic-overview');
      await panel
        .getByRole('searchbox', { name: 'Search for a geography', exact: true })
        .fill('West Sussex');
      await panel.getByRole('button', { name: 'Find geographies', exact: true }).click();
      await page
        .locator('#topic-overview')
        .getByRole('radio', { name: 'West Sussex', exact: true })
        .check();
      await page
        .locator('#topic-overview')
        .getByRole('button', { name: 'Apply geographies', exact: true })
        .click();
      await expect(page).toHaveURL(/tab-topic=overview.*ga=E10000032/);
      await expect(
        page.locator('#topic-overview').getByRole('heading', {
          name: 'Diabetes has 2 indicators in West Sussex',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('#topic-overview .fphd-trend-tag').nth(1)).toHaveText(
        '1 is getting worse',
      );
    });
  });

  test('says the chosen area has no indicators, and shows nothing else, when it has no data', async ({
    page,
  }) => {
    await openTopicPage(page, '/topics/diabetes?ga=E02004518');
    const panel = page.getByRole('tabpanel', { name: 'Overview', exact: true });
    await expect(
      panel.getByRole('heading', { name: 'Diabetes has 0 indicators in Abbey Field', exact: true }),
    ).toBeVisible();
    await expect(panel.locator('.fphd-trend-tag')).toHaveCount(0);
    await expect(panel.getByRole('link', { name: 'View all diabetes indicators' })).toHaveCount(0);
    await expect(panel.getByRole('heading', { name: 'Highlighted indicators' })).toHaveCount(0);
    await expect(panel.locator('.fphd-topic-highlight')).toHaveCount(0);
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

  test('keeps England beside a picked area on the data tab with a comparison summary', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=data&ga=E12000007`);
    const panel = page.getByRole('tabpanel', { name: 'Data' });
    const table = panel.getByRole('table', {
      name: 'Mortality and life expectancy indicators: London compared with England',
    });
    await expect(table).toBeVisible();
    for (const column of ['London', 'Comparison summary', 'England']) {
      await expect(table.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
    }
    await expect(table.getByRole('columnheader').last()).toHaveText(/Calculated\s*value/);
    await panel.getByRole('button', { name: 'Table columns', exact: true }).click();
    await panel.getByRole('checkbox', { name: 'Calculated value', exact: true }).uncheck();
    await expect(table.getByRole('columnheader', { name: 'England', exact: true })).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: 'Calculated value', exact: true }),
    ).toHaveCount(1);
    await panel.getByText('Download or share data', { exact: true }).click();
    const csv = await downloadFrom(page, 'Download filtered data (CSV)', 'link');
    expect(csv.text.split('\n')[0]).toContain('England calculated value');
    expect(csv.text.split('\n')[0]).not.toContain('London calculated value');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('changes topic table columns and downloads the same view', async ({ page }, testInfo) => {
    await openTopicPage(page, '/topics/diabetes?tab-topic=data');
    const panel = page.getByRole('tabpanel', { name: 'Data', exact: true });
    const table = panel.getByRole('table');
    await panel.getByRole('button', { name: 'Table columns', exact: true }).click();
    const initialCsv = await page.request.get('/topics/diabetes/table.csv?tab-topic=data');
    expect(initialCsv.ok()).toBe(true);
    expect((await initialCsv.text()).split('\n')[0]?.split(',')).toContain('Last updated');
    await panel.getByRole('checkbox', { name: 'Count', exact: true }).check();
    await panel.getByRole('checkbox', { name: 'Data last updated', exact: true }).uncheck();
    await expect(panel.getByRole('checkbox', { name: 'Count', exact: true })).toBeChecked();
    await expect(
      panel.getByRole('checkbox', { name: 'Data last updated', exact: true }),
    ).not.toBeChecked();
    await expect(table.getByRole('columnheader', { name: 'Count', exact: true })).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: 'Data last updated', exact: true }),
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
    expect(csv.text.split('\n')[0]?.split(',')).not.toContain('Last updated');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('downloads every column in all data whichever columns the table shows', async ({ page }) => {
    await openTopicPage(page, '/topics/diabetes?tab-topic=data');
    const panel = page.getByRole('tabpanel', { name: 'Data', exact: true });
    const table = panel.getByRole('table');
    await panel.getByRole('button', { name: 'Table columns', exact: true }).click();
    await panel.getByRole('checkbox', { name: 'Most recent period', exact: true }).uncheck();
    await expect(
      table.getByRole('columnheader', { name: 'Most recent period', exact: true }),
    ).toHaveCount(0);
    await panel.getByText('Download or share data', { exact: true }).click();
    const csv = await downloadFrom(page, 'Download all data (CSV)', 'link');
    const [header] = parse(csv.text, { to_line: 1 }) as string[][];
    expect(header).toEqual([
      'Indicator',
      'Subtopic',
      'Unit',
      'Most recent period',
      'Last updated',
      'England trend (last 5 periods)',
      'England count',
      'England calculated value',
    ]);
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
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=areas&geo=NHS+regions`);
    await page.getByRole('radio', { name: 'Statistical regions', exact: true }).check();
    await expect(page).toHaveURL(/geo=Statistical/);
    const table = page.getByRole('table', {
      name: 'Mortality and life expectancy indicators by statistical region',
    });
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
      ['Area summaries', 1712],
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
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=areas&geo=NHS+regions`);
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

  test('opens area summaries on statistical regions with geography controls', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=areas`);
    const panel = page.getByRole('tabpanel', { name: 'Area summaries' });
    await expect(panel.getByRole('heading', { name: 'Geographies' })).toBeVisible();
    await expect(panel.getByRole('radio', { name: 'Statistical regions' })).toBeChecked();
    const table = panel.getByRole('table', {
      name: 'Mortality and life expectancy indicators by statistical region',
    });
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

  test('sorts indicator rows in Area summaries', async ({ page }, testInfo) => {
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=areas`);
    const panel = page.getByRole('tabpanel', { name: 'Area summaries' });
    await expect(panel.getByRole('table')).toBeVisible();
    const names = panel.getByRole('rowheader').getByRole('link');
    const expected = (await names.allTextContents()).sort((a, b) => b.localeCompare(a));
    expect(expected.length).toBeGreaterThan(1);
    const sort = panel.getByRole('combobox', { name: 'Sort indicators by:' });
    await sort.selectOption('name-desc');
    await expect(names).toHaveText(expected);
    await page.reload();
    await expect(sort).toHaveValue('name-desc');
    await expect(names).toHaveText(expected);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('keeps area sorting and CSV order without JavaScript', async ({
    page,
    browser,
    baseURL,
  }) => {
    if (baseURL === undefined) throw new Error('A base URL is required');
    const context = await browser.newContext({
      baseURL,
      storageState: await page.context().storageState(),
      javaScriptEnabled: false,
    });
    const withoutJs = await context.newPage();
    try {
      await withoutJs.goto(`${TOPIC_PATH}?tab-topic=areas&render=complete`);
      const panel = withoutJs.locator('#topic-area-summaries');
      const names = panel.getByRole('rowheader').getByRole('link');
      const expected = (await names.allTextContents()).sort((a, b) => b.localeCompare(a));
      await panel.getByRole('combobox', { name: 'Sort indicators by:' }).selectOption('name-desc');
      await panel.getByRole('button', { name: 'Sort indicators', exact: true }).click();
      await expect(names).toHaveText(expected);
      const row = panel
        .getByRole('row')
        .filter({
          has: withoutJs.getByRole('link', {
            name: 'Mortality rate for deaths involving diabetes, all ages',
            exact: true,
          }),
        })
        .first();
      await row.getByRole('link', { name: /^Sort best to worst for/ }).click();
      await expect(row.getByRole('rowheader')).toHaveAttribute('aria-sort', 'ascending');
      await row.getByRole('link', { name: /^Sort worst to best for/ }).click();
      await expect(row.getByRole('rowheader')).toHaveAttribute('aria-sort', 'descending');
      await expect(names).toHaveText(expected);
      await expect(withoutJs).toHaveURL(/areaRowSort=name-desc/);
      const headers = await panel.getByRole('columnheader').allTextContents();
      await panel.getByText('Download or share data', { exact: true }).click();
      const href = await panel
        .getByRole('link', { name: 'Download filtered data (CSV)' })
        .getAttribute('href');
      if (!href) throw new Error('Expected a CSV download URL');
      const response = await withoutJs.request.get(href);
      expect(response.ok()).toBe(true);
      expectAreaCsvColumns(await response.text(), headers.slice(4));
    } finally {
      await context.close();
    }
  });

  test('sorts area columns by an indicator and downloads them in that order', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=areas`);
    const panel = page.getByRole('tabpanel', { name: 'Area summaries' });
    const table = panel.getByRole('table', {
      name: /^Mortality and life expectancy indicators by statistical region/,
    });
    await expect(table).toBeVisible();
    const headers = table.getByRole('columnheader');
    const original = await headers.allTextContents();
    const row = table
      .getByRole('row')
      .filter({
        has: page.getByRole('link', {
          name: 'Mortality rate for deaths involving diabetes, all ages',
          exact: true,
        }),
      })
      .first();
    await row.getByRole('link', { name: /^Sort best to worst for/ }).click();
    await expect(row.getByRole('rowheader')).toHaveAttribute('aria-sort', 'ascending');
    await expect(row.getByRole('rowheader').getByText('Areas sorted best to worst')).toBeVisible();
    await expect(table).toHaveAccessibleName(
      'Mortality and life expectancy indicators by statistical region, sorted by Mortality rate for deaths involving diabetes, all ages, best to worst',
    );
    await row.getByRole('link', { name: /^Sort worst to best for/ }).click();
    await expect(row.getByRole('rowheader')).toHaveAttribute('aria-sort', 'descending');
    const sorted = await headers.allTextContents();
    expect(sorted.slice(0, 4)).toEqual(original.slice(0, 4));
    expect(sorted).not.toEqual(original);
    await panel.getByText('Download or share data', { exact: true }).click();
    const { text } = await downloadFrom(page, 'Download filtered data (CSV)', 'link');
    expectAreaCsvColumns(text, sorted.slice(4));
    await expectNoAccessibilityViolations(page, testInfo);
    await row.getByRole('link', { name: /^Clear sort by/ }).press('Enter');
    await expect(row.getByRole('link', { name: /^Sort best to worst for/ })).toBeFocused();
    await expect(table).toHaveAccessibleName(
      'Mortality and life expectancy indicators by statistical region',
    );
    await expect(headers).toHaveText(original);
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
    await expect(panel.getByRole('link', { name: OHID_STATISTICS_LINK })).toHaveCount(0);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('links a topic without curated content to OHID statistics on GOV.UK', async ({
    page,
  }, testInfo) => {
    await openTopicPage(page, `${TOPIC_PATH}?tab-topic=publications`);
    const panel = page.getByRole('tabpanel', { name: 'More information' });
    await expect(
      panel.getByText(
        'Find upcoming official statistics releases about public health data on GOV.UK.',
      ),
    ).toBeVisible();
    await expect(panel.getByRole('link', { name: OHID_STATISTICS_LINK })).toHaveAttribute(
      'href',
      'https://www.gov.uk/search/research-and-statistics?content_store_document_type=upcoming_statistics&organisations[]=office-for-health-improvement-and-disparities&order=release-date-oldest',
    );
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
