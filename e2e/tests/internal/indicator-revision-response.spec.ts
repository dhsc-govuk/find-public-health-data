import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import { inReview, respondToReview } from '../support/review-response.ts';
import { PUBLISHER } from '../support/sign-in.ts';

const REPLY = 'Response to revisions or clarifications';

function replyPath(id: string) {
  return `/publish/indicators/${id}/revision-response`;
}

function reply(page: Page) {
  return page.getByRole('textbox', { name: REPLY });
}

test.use({ storageState: PUBLISHER.storageState });

test.describe('the reply page', () => {
  test('shows the clarification request, refuses an empty reply, then saves it', async ({
    browser,
    page,
  }, testInfo) => {
    const { id } = await inReview(browser, 'clarification asked');
    await respondToReview(browser, id, {
      kind: 'major_revisions',
      clarification: 'Which *years* does the table cover?',
    });

    await page.goto(replyPath(id));
    await expect(page.getByRole('heading', { level: 1, name: REPLY })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'High-level clarification request' }),
    ).toBeVisible();
    await expect(page.locator('.fphd-markdown em')).toHaveText('years');
    await expectNoAccessibilityViolations(page, testInfo);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expectErrorSummaryReady(page);
    await expect(page.getByRole('alert')).toContainText(
      'Enter your response to the clarification request',
    );
    await expectNoAccessibilityViolations(page, testInfo);

    await reply(page).fill('2019 to 2024.');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(`/publish/indicators/${id}/task-list`);
    await page.goto(replyPath(id));
    await expect(reply(page)).toHaveValue('2019 to 2024.');
  });
});
