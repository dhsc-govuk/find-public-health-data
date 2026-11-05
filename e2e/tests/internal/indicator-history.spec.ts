import { type Browser, expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { submitNewIndicator } from '../support/complete-draft.ts';
import { uniqueIndicatorName } from '../support/create-indicator.ts';
import { historyEntries, historyPanel, historyToday, openHistory } from '../support/history.ts';
import { MORTALITY_ID } from '../support/indicator-page.ts';
import { asUser, type FlaggedTask, inReview, respondToReview } from '../support/review-response.ts';
import { ADMIN, IMRG_MANAGER, IMRG_REVIEWER, PUBLISHER } from '../support/sign-in.ts';

const POLARITY: FlaggedTask = {
  key: 'polarity',
  title: 'Polarity',
  notes: 'Check whether **higher** is better.',
};
const UPDATE_FREQUENCY: FlaggedTask = {
  key: 'update-frequency',
  title: 'Update frequency',
  notes: 'Is it still yearly?',
};
const CLARIFICATION = 'Which years does the table cover?';
const REPLY = 'Higher is better. Yearly still.';
const REVIEWER_NOTE = 'Private: compare with the 2019 figures';

function overviewPath(id: string) {
  return `/dashboard/indicators/${id}`;
}

function taskListPath(id: string) {
  return `/publish/indicators/${id}/task-list`;
}

async function save(page: Page, id: string, key: string, change?: (page: Page) => Promise<void>) {
  await page.goto(`/publish/indicators/${id}/${key}`);
  await change?.(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath(id));
}

/** A round sent back with two flags and a clarification, answered, resubmitted and approved. */
async function reviewedRound(page: Page, browser: Browser) {
  const { id } = await inReview(browser, 'history');
  await respondToReview(browser, id, {
    kind: 'minor_revisions',
    flags: [POLARITY, UPDATE_FREQUENCY],
    clarification: CLARIFICATION,
  });

  await save(page, id, 'polarity', (section) => section.getByLabel('Higher is better').check());
  await save(page, id, 'update-frequency');
  await page.goto(`/publish/indicators/${id}/revision-response`);
  await page.getByRole('textbox', { name: 'Response to revisions or clarifications' }).fill(REPLY);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath(id));
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page).toHaveURL(overviewPath(id));
  await respondToReview(browser, id, { kind: 'approved' });

  return id;
}

function roundHistory() {
  const on = historyToday();
  return [
    `${on} Indicator approved for publishing By ${IMRG_REVIEWER.name}`,
    `${on} Indicator reviewed by IMRG By ${IMRG_REVIEWER.name}`,
    `${on} Indicator resubmitted for approval. By ${PUBLISHER.name} Section Comments ` +
      'Polarity Revisions made Update frequency No revisions made ' +
      `Response to revisions or clarifications ${REPLY}`,
    `${on} Indicator requires minor revisions to be approved for publishing. ` +
      `By ${IMRG_REVIEWER.name} Section Comments Polarity Check whether higher is better. ` +
      `Update frequency Is it still yearly? Clarification request ${CLARIFICATION}`,
    `${on} Indicator reviewed by IMRG By ${IMRG_REVIEWER.name}`,
    `${on} Indicator assigned for review by ${IMRG_REVIEWER.name}. By ${IMRG_MANAGER.name}`,
    `${on} Indicator submitted for approval By ${PUBLISHER.name}`,
    `${on} Indicator first created By ${PUBLISHER.name}`,
  ];
}

test.use({ storageState: PUBLISHER.storageState });

test('lists what has happened to the indicator, newest first, the same for the publisher and the reviewer', async ({
  browser,
  page,
}, testInfo) => {
  const id = await reviewedRound(page, browser);
  const expected = roundHistory();

  await openHistory(page, id);
  await expect(historyEntries(page)).toHaveText(expected, { useInnerText: true });
  await expect(
    historyPanel(page)
      .getByRole('row', { name: /^Polarity/ })
      .locator('.fphd-markdown strong'),
  ).toHaveText('higher');
  await expectNoAccessibilityViolations(page, testInfo);

  await asUser(browser, IMRG_REVIEWER, async (reviewer) => {
    await openHistory(reviewer, id);
    await expect(historyEntries(reviewer)).toHaveText(expected, { useInnerText: true });
  });
});

test("never shows a reviewer's own notes", async ({ browser, page }) => {
  const { id } = await inReview(browser, 'history with notes');
  await asUser(browser, IMRG_REVIEWER, async (reviewer) => {
    await reviewer.goto(overviewPath(id));
    await reviewer
      .getByLabel('Enter any notes as part of your indicator review')
      .fill(REVIEWER_NOTE);
    await reviewer.getByRole('button', { name: 'Add notes' }).click();
    await expect(reviewer.getByRole('table')).toContainText(REVIEWER_NOTE);

    await openHistory(reviewer, id);
    await expect(historyEntries(reviewer)).toHaveCount(3);
    await expect(historyPanel(reviewer)).not.toContainText(REVIEWER_NOTE);
  });

  await openHistory(page, id);
  await expect(historyEntries(page)).toHaveCount(3);
  await expect(historyPanel(page)).not.toContainText(REVIEWER_NOTE);
});

test.describe('as an admin', () => {
  test.use({ storageState: ADMIN.storageState });

  test('shows when an indicator migrated from Fingertips was first created and published', async ({
    page,
  }) => {
    await openHistory(page, MORTALITY_ID);

    await expect(historyEntries(page)).toHaveCount(2);
    await expect(historyEntries(page).first()).toContainText('Indicator published');
    await expect(historyEntries(page).first()).not.toContainText('By ');
    await expect(historyEntries(page).last()).toContainText('Indicator first created');
    await expect(historyEntries(page).last()).toContainText('By PHOLIO migration');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the history from its tab link', async ({ browser, page }) => {
    const id = await submitNewIndicator(browser, uniqueIndicatorName('history without script'));

    await page.goto(overviewPath(id));
    await page.getByRole('link', { name: 'History', exact: true }).click();
    await expect(page).toHaveURL(/#history$/);

    await expect(historyEntries(page)).toHaveText(
      [
        `${historyToday()} Indicator submitted for approval By ${PUBLISHER.name}`,
        `${historyToday()} Indicator first created By ${PUBLISHER.name}`,
      ],
      { useInnerText: true },
    );
  });
});
