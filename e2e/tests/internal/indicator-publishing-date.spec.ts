import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';
import { type DateTime, ukDateTime } from '../support/uk-date-time.ts';

const SECTION: Section = { key: 'publishing-date', taskName: 'Publishing date' };

// Far enough ahead to be accepted whenever the suite runs.
const LATER: DateTime = {
  day: '4',
  month: '1',
  year: String(new Date().getFullYear() + 2),
  hour: '15',
  minute: '05',
};

/** The UK date `days` after today's. */
function ukDateInDays(days: number): Pick<DateTime, 'day' | 'month' | 'year'> {
  const today = ukDateTime(new Date());
  const date = new Date(
    Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day) + days),
  );
  return {
    day: String(date.getUTCDate()),
    month: String(date.getUTCMonth() + 1),
    year: String(date.getUTCFullYear()),
  };
}

/** The last Sunday of March or October two years ahead, when the UK clocks change. */
function clockChangeDay(month: 3 | 10): Pick<DateTime, 'day' | 'month' | 'year'> {
  const year = new Date().getFullYear() + 2;
  const lastDay = new Date(Date.UTC(year, month, 0));
  const day = lastDay.getUTCDate() - lastDay.getUTCDay();
  return { day: String(day), month: String(month), year: String(year) };
}

function part(page: Page, group: 'Date' | 'Time', label: string) {
  return page.getByRole('group', { name: group }).getByLabel(label, { exact: true });
}

async function fill(page: Page, { day, month, year, hour, minute }: DateTime) {
  await part(page, 'Date', 'Day').fill(day);
  await part(page, 'Date', 'Month').fill(month);
  await part(page, 'Date', 'Year').fill(year);
  await part(page, 'Time', 'Hour').fill(hour);
  await part(page, 'Time', 'Minute').fill(minute);
}

async function expectShown(page: Page, { day, month, year, hour, minute }: DateTime) {
  await expect(part(page, 'Date', 'Day')).toHaveValue(day);
  await expect(part(page, 'Date', 'Month')).toHaveValue(month);
  await expect(part(page, 'Date', 'Year')).toHaveValue(year);
  await expect(part(page, 'Time', 'Hour')).toHaveValue(hour);
  await expect(part(page, 'Time', 'Minute')).toHaveValue(minute);
}

async function submitImpossibleDate(page: Page) {
  await fill(page, { ...LATER, day: '31', month: '2' });
  await page.getByRole('button', { name: 'Continue' }).click();
}

test.use({ storageState: PUBLISHER.storageState });

describeSectionPage(SECTION, {
  expectUnanswered: async (page) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'When should this indicator be published?' }),
    ).toBeVisible();
    await expectShown(page, { day: '', month: '', year: '', hour: '09', minute: '30' });
  },
  refusal: {
    messages: ['Enter the publishing date'],
    focuses: (page) => part(page, 'Date', 'Day'),
  },
});

test('refuses a date that does not exist, keeping what was typed', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await submitImpossibleDate(page);

  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Publishing date must be a real date',
  ]);
  await expectShown(page, { ...LATER, day: '31', month: '2' });
});

test('refuses a time that does not exist', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await fill(page, { ...LATER, hour: '24' });
  await page.getByRole('button', { name: 'Continue' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Publishing time must be a real time']);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(part(page, 'Time', 'Hour')).toBeFocused();
});

test('refuses a publishing date less than 28 days from today', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await fill(page, { ...ukDateInDays(27), hour: '23', minute: '59' });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Publishing date must be at least 28 days from today',
  ]);
});

test('refuses a time the spring clock change skips', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await fill(page, { ...clockChangeDay(3), hour: '01', minute: '30' });
  await page.getByRole('button', { name: 'Continue' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText(['Publishing time must be a real time']);

  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(part(page, 'Time', 'Hour')).toBeFocused();
});

test('accepts a time the autumn clock change repeats', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const repeated = { ...clockChangeDay(10), hour: '01', minute: '30' };

  await fill(page, repeated);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expectShown(page, repeated);
});

test('accepts the date its hint gives as an example', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const hint = await page
    .getByRole('group', { name: 'Date' })
    .getByText(/^For example, /)
    .textContent();
  const [, day = '', month = '', year = ''] = hint?.match(/(\d+) (\d+) (\d+)$/) ?? [];

  await part(page, 'Date', 'Day').fill(day);
  await part(page, 'Date', 'Month').fill(month);
  await part(page, 'Date', 'Year').fill(year);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
});

test('saves nothing until the date and time are accepted', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;

  await submitImpossibleDate(page);
  await expect(page.getByRole('alert')).toBeVisible();

  await page.goto(pagePath);
  await expectShown(page, { day: '', month: '', year: '', hour: '09', minute: '30' });
});

test('saves the date and time on Continue and shows the task as completed', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);

  await fill(page, LATER);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await taskRow(page, SECTION.taskName).getByRole('link').click();
  await expectShown(page, LATER);
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the date is refused', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  await submitImpossibleDate(page);
  await expect(page.getByRole('alert')).toContainText('Publishing date must be a real date');

  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('saves the date and time', async ({ page }) => {
    const taskListPath = await openSectionPage(page, SECTION);

    await fill(page, LATER);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
  });
});
