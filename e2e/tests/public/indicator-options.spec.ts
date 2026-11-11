import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { filterCard, MORTALITY_PATH, openIndicatorPage } from '../support/indicator-page.ts';

function trendTable(page: import('@playwright/test').Page) {
  return page.getByRole('table', { name: /^Table:/ });
}

test('table options update the series and keep their choices on reload', async ({
  page,
}, testInfo) => {
  await openIndicatorPage(page, MORTALITY_PATH);
  const options = page
    .locator('.fphd-filter-card')
    .filter({ has: page.getByRole('button', { name: 'Table columns', exact: true }) });
  await options.getByRole('button', { name: 'Table columns', exact: true }).click();
  const table = trendTable(page);
  await options.getByLabel('Select sex').selectOption('Male');
  await expect(page).toHaveURL(/sex-108=Male/);
  await expect(table).toHaveAccessibleName(/<75 yrs, Male$/);
  await options.getByLabel('Select time period type').selectOption('1 year');
  await expect(page).toHaveURL(/pt-108=1-year/);
  await expect(table.getByRole('rowheader', { name: '2015 to 2017', exact: true })).toHaveCount(0);
  await options.getByRole('checkbox', { name: '95% confidence intervals', exact: true }).check();
  await options.getByRole('checkbox', { name: 'Numerator', exact: true }).check();
  await expect(table.getByRole('columnheader', { name: 'Numerator', exact: true })).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: '95% lower confidence interval' }),
  ).toBeVisible();
  await page.reload();
  await expect(table).toHaveAccessibleName(/<75 yrs, Male$/);
  await expectNoAccessibilityViolations(page, testInfo);
});

test('selected geography and benchmark options stay on the one indicator page', async ({
  page,
}) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?as=E08000003`);
  const options = page
    .locator('.fphd-filter-card')
    .filter({ has: page.getByRole('button', { name: 'Table columns', exact: true }) });
  await options.getByRole('button', { name: 'Table columns', exact: true }).click();
  await options.getByLabel('Select a geography or goal to compare with').selectOption('England');
  await expect(page).toHaveURL(/cmp-108=england/);
  await expect(trendTable(page).getByRole('columnheader', { name: 'Manchester' })).toBeVisible();
  await expect(trendTable(page).getByRole('columnheader', { name: 'England' })).toBeVisible();
  await options.getByRole('radio', { name: 'Yes' }).click();
  await expect(trendTable(page).getByRole('columnheader', { name: 'Minimum' })).toBeVisible();
});

test('inequality options change the breakdown period', async ({ page }) => {
  await openIndicatorPage(page, `${MORTALITY_PATH}?tab-indicator=inequalities`);
  const options = page
    .locator('.fphd-filter-card')
    .filter({ has: page.getByRole('button', { name: 'Chart options', exact: true }) });
  await options
    .getByRole('radio', { name: /Districts and unitary authorities by deprivation/ })
    .check();
  await expect(page).toHaveURL(/ic-108=/);
  await options.getByLabel('Time period', { exact: true }).selectOption('2023');
  await expect(
    page.getByRole('table', { name: /Districts and unitary authorities by deprivation.*2023/ }),
  ).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('table and inequality options apply through their Apply options buttons', async ({
    page,
  }) => {
    await page.goto(MORTALITY_PATH);
    const tableOptions = filterCard(page, 'Table columns');
    await tableOptions.getByLabel('Select sex').selectOption('Male');
    await tableOptions.getByLabel('Select time period type').selectOption('1 year');
    await tableOptions.getByRole('checkbox', { name: 'Numerator', exact: true }).check();
    await tableOptions.getByRole('button', { name: 'Apply options' }).click();

    await expect(page).toHaveURL(/sex-108=Male/);
    await expect(page).toHaveURL(/pt-108=1-year/);
    const table = trendTable(page);
    await expect(table).toHaveAccessibleName(/<75 yrs, Male$/);
    await expect(table.getByRole('rowheader', { name: '2015 to 2017', exact: true })).toHaveCount(
      0,
    );
    await expect(table.getByRole('columnheader', { name: 'Numerator', exact: true })).toBeVisible();

    const inequalityOptions = filterCard(page, 'Chart options');
    await inequalityOptions
      .getByRole('radio', { name: /Districts and unitary authorities by deprivation/ })
      .check();
    await inequalityOptions.getByLabel('Time period', { exact: true }).selectOption('2023');
    await inequalityOptions.getByRole('button', { name: 'Apply options' }).click();

    await expect(page).toHaveURL(/ic-108=/);
    await expect(
      page.getByRole('table', { name: /Districts and unitary authorities by deprivation.*2023/ }),
    ).toBeVisible();
    await expect(page).toHaveURL(/sex-108=Male/);
  });
});
