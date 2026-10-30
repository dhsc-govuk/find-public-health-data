import { expect, type Locator, type Page, test } from '@playwright/test';

import { createDraft, createIndicator, uniqueIndicatorName } from './create-indicator.ts';
import { expectErrorSummaryReady } from './govuk-frontend.ts';
import { MORTALITY_ID } from './indicator-page.ts';

/** A page of a draft's task list: its path segment and the name of its task row. */
export type Section = { key: string; taskName: string };

// The header and footer have lists of their own, so the task row is read inside the page.
export function taskRow(page: Page, taskName: string) {
  return page.getByRole('main').getByRole('listitem').filter({ hasText: taskName }).first();
}

/**
 * Opens a new draft's section page by its address; returns the draft's task list path. Each
 * section spec reaches its page from the task list once, in a test of its own.
 */
export async function openSectionPage(page: Page, { key }: Section): Promise<string> {
  const id = await createDraft(page, uniqueIndicatorName(key));

  await page.goto(`/publish/indicators/${id}/${key}`);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();

  return `/publish/indicators/${id}/task-list`;
}

export async function expectBackToTaskList(page: Page, taskListPath: string) {
  await page.getByRole('link', { name: 'Back to task list', exact: true }).click();
  await expect(page).toHaveURL(taskListPath);
}

/** Expects not-found for the page of a malformed id, an unknown id and a draftless indicator. */
export async function expectNotFoundWithoutDraft(page: Page, key: string) {
  for (const path of [
    `/publish/indicators/108/${key}`,
    `/publish/indicators/00000000-0000-7000-8000-000000000000/${key}`,
    // The seeded indicator is published, so it has no draft.
    `/publish/indicators/${MORTALITY_ID}/${key}`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  }
}

type SharedCases = {
  /** Checks the page a new draft opens on: its heading and every answer empty. */
  expectUnanswered: (page: Page) => Promise<void>;
  /**
   * The empty form's refusal: the summary's messages in order, the one whose link is followed
   * (the first unless named) and the field that link moves focus to.
   */
  refusal: { messages: [string, ...string[]]; follow?: string; focuses: (page: Page) => Locator };
};

/**
 * Declares the tests every section page shares: reached from the task list and the empty form
 * refused. The spec adds its own questions' tests and the accessibility scans. The back link and
 * not-found for an indicator with no draft come from the shared section loader and page, so the
 * polarity spec tests them for every section.
 */
export function describeSectionPage(section: Section, { expectUnanswered, refusal }: SharedCases) {
  test('is reached from the task list, where it starts as not started', async ({ page }) => {
    await createIndicator(page, uniqueIndicatorName(section.key));
    await expect(taskRow(page, section.taskName)).toContainText('Not started');

    await taskRow(page, section.taskName).getByRole('link').click();

    await expectUnanswered(page);
  });

  test('asks for every required answer when Continue is selected with the form empty', async ({
    page,
  }) => {
    await openSectionPage(page, section);
    const pagePath = new URL(page.url()).pathname;

    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(pagePath);
    await expect(page).toHaveTitle(/^Error: /);
    const summary = page.getByRole('alert');
    await expect(summary.getByRole('link')).toHaveText(refusal.messages);

    await expectErrorSummaryReady(page);
    const follow = refusal.follow ?? refusal.messages[0];
    await summary.getByRole('link', { name: follow, exact: true }).click();
    await expect(refusal.focuses(page)).toBeFocused();
  });
}
