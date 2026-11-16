import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady, expectHydrated } from '../support/govuk-frontend.ts';
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

const FAST_TRACKED = 'This indicator needs to be fast-tracked';
const REASON = 'Enter reason for fast-tracking';
const ENTER_REASON = 'Enter the reason for fast-tracking';
const BRIEFING = 'Needed for a ministerial briefing.';

function fastTracked(page: Page) {
  return page.getByRole('checkbox', { name: FAST_TRACKED });
}

function reason(page: Page) {
  return page.getByRole('textbox', { name: REASON });
}

async function fastTrack(page: Page, text: string) {
  await fastTracked(page).check();
  await reason(page).fill(text);
}

/** The overview of the draft whose page is open. */
function overviewPath(page: Page): string {
  const [, id] = new URL(page.url()).pathname.match(/^\/publish\/indicators\/([^/]+)\//) ?? [];
  return `/dashboard/indicators/${id}`;
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
    await expect(fastTracked(page)).not.toBeChecked();
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

test('refuses a publishing date less than 8 weeks from today', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await fill(page, { ...ukDateInDays(55), hour: '23', minute: '59' });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Publishing date and time must be at least 8 weeks in the future',
  ]);
});

test('accepts any time on the date 8 weeks from today', async ({ page }) => {
  const taskListPath = await openSectionPage(page, SECTION);

  await fill(page, { ...ukDateInDays(56), hour: '00', minute: '00' });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');
});

test('reveals the reason for fast-tracking only while the box is ticked', async ({ page }) => {
  await openSectionPage(page, SECTION);
  await expectHydrated(page);

  await expect(reason(page)).toBeHidden();

  await fastTracked(page).check();
  await expect(reason(page)).toBeVisible();

  await fastTracked(page).uncheck();
  await expect(reason(page)).toBeHidden();
});

test('saves a fast-tracked date inside the notice period, and the overview shows the reason', async ({
  page,
}) => {
  const taskListPath = await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  const soon = { ...ukDateInDays(7), hour: '09', minute: '30' };

  await fill(page, soon);
  await expectHydrated(page);
  await fastTrack(page, `  ${BRIEFING}  `);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath);
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expectShown(page, soon);
  await expect(fastTracked(page)).toBeChecked();
  await expect(reason(page)).toHaveValue(BRIEFING);

  await page.goto(overviewPath(page));
  await expect(page.getByRole('main').locator('p:has(.govuk-tag) + p')).toContainText(
    `Fast-track reason: ${BRIEFING}`,
  );
});

test('asks for the reason when the box is ticked without one', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await fill(page, LATER);
  await fastTracked(page).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  const summary = page.getByRole('alert');
  await expect(summary.getByRole('link')).toHaveText([ENTER_REASON]);
  await expect(fastTracked(page)).toBeChecked();

  await expectErrorSummaryReady(page);
  await summary.getByRole('link').click();
  await expect(reason(page)).toBeFocused();
});

test('refuses a fast-tracked date in the past', async ({ page }) => {
  await openSectionPage(page, SECTION);

  await fill(page, { ...ukDateInDays(-1), hour: '09', minute: '30' });
  await expectHydrated(page);
  await fastTrack(page, BRIEFING);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('alert').getByRole('link')).toHaveText([
    'Publishing date and time must be in the future',
  ]);
});

test('forgets the reason once the box is unticked', async ({ page }) => {
  await openSectionPage(page, SECTION);
  const pagePath = new URL(page.url()).pathname;
  await fill(page, LATER);
  await expectHydrated(page);
  await fastTrack(page, BRIEFING);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await fastTracked(page).uncheck();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

  await page.goto(pagePath);
  await expect(fastTracked(page)).not.toBeChecked();
  await fastTracked(page).check();
  await expect(reason(page)).toHaveValue('');

  await page.goto(overviewPath(page));
  await expect(page.getByText('Fast-track reason:')).toHaveCount(0);
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

test('has no WCAG 2.2 AA violations with the reason for fast-tracking revealed', async ({
  page,
}, testInfo) => {
  await openSectionPage(page, SECTION);
  await expectHydrated(page);
  await fastTracked(page).check();
  await expect(reason(page)).toBeVisible();

  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no WCAG 2.2 AA violations when the reason is refused', async ({ page }, testInfo) => {
  await openSectionPage(page, SECTION);
  await fill(page, LATER);
  await fastTracked(page).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText(ENTER_REASON);

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

  test('shows the reason for fast-tracking and saves it', async ({ page }) => {
    await openSectionPage(page, SECTION);
    const pagePath = new URL(page.url()).pathname;

    await expect(reason(page)).toBeVisible();
    await fill(page, { ...ukDateInDays(7), hour: '09', minute: '30' });
    await fastTrack(page, BRIEFING);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(taskRow(page, SECTION.taskName)).toContainText('Completed');

    await page.goto(pagePath);
    await expect(fastTracked(page)).toBeChecked();
    await expect(reason(page)).toHaveValue(BRIEFING);
  });
});
