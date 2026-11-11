import type { Page } from '@playwright/test';

/** The answer a summary list gives to the question it names, matched by its exact text. */
export function answerTo(page: Page, question: string) {
  return page
    .locator('.govuk-summary-list__row')
    .filter({ has: page.getByText(question, { exact: true }) })
    .locator('dd');
}
