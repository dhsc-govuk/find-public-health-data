import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import { asUser, type FlaggedTask, inReview, respondToReview } from '../support/review-response.ts';
import { IMRG_REVIEWER, PUBLISHER, SECOND_TEAM_A_PUBLISHER } from '../support/sign-in.ts';

const REPLY = 'Response to revisions or clarifications';
const SUBMITTED = 'Indicator successfully submitted for approval.';

const POLARITY: FlaggedTask = {
  key: 'polarity',
  title: 'Polarity',
  notes: 'Check whether **higher** is better.',
};

function overviewPath(id: string) {
  return `/dashboard/indicators/${id}`;
}

function taskListPath(id: string) {
  return `/publish/indicators/${id}/task-list`;
}

function replyPath(id: string) {
  return `/publish/indicators/${id}/revision-response`;
}

function publishingTag(page: Page) {
  return page.getByRole('main').locator('h1 ~ p .govuk-tag').nth(1);
}

function reply(page: Page) {
  return page.getByRole('textbox', { name: REPLY });
}

/** A task's item in the task list, while a round of review has sent the draft back. */
function requestRow(page: Page, task: string) {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: task, exact: true }) });
}

/** Saves a section page as it stands, which clears its flag though nothing changed. */
async function saveUnchanged(page: Page, id: string, key: string) {
  await page.goto(`/publish/indicators/${id}/${key}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath(id));
}

async function writeReply(page: Page, id: string, text: string) {
  await page.goto(replyPath(id));
  await reply(page).fill(text);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath(id));
}

async function resubmit(page: Page, id: string) {
  await page.goto(taskListPath(id));
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page).toHaveURL(overviewPath(id));
}

test.use({ storageState: PUBLISHER.storageState });

test.describe('after minor revisions', () => {
  test('the publisher saves the flagged task, writes the reply and resubmits, and the reviewer approves the second round', async ({
    browser,
    page,
  }, testInfo) => {
    const { id, name } = await inReview(browser, 'minor revisions answered');
    await respondToReview(browser, id, { kind: 'minor_revisions', flags: [POLARITY] });

    await page.goto(overviewPath(id));
    await expect(publishingTag(page)).toHaveText('Publishing status: Minor revisions needed');
    await expect(page.getByRole('link', { name: 'Continue creating indicator' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Respond to requested revision' }).click();

    await expect(page).toHaveURL(taskListPath(id));
    const polarity = requestRow(page, 'Polarity');
    await expect(polarity).toContainText(`Comment from ${IMRG_REVIEWER.name}:`);
    await expect(polarity.locator('.fphd-markdown strong')).toHaveText('higher');
    await expect(polarity.getByText('Revisions needed')).toBeVisible();
    await expect(requestRow(page, REPLY).getByText('Incomplete')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for approval' })).toHaveCount(0);
    await expectNoAccessibilityViolations(page, testInfo);

    await saveUnchanged(page, id, 'polarity');
    await expect(polarity.getByText('Revisions needed')).toHaveCount(0);
    await expect(polarity).toContainText('Completed');
    await expect(polarity).toContainText('Check whether higher is better.');

    await page.goto(replyPath(id));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expectErrorSummaryReady(page);
    await expect(page.getByRole('alert')).toContainText(
      'Enter your response to the requested revisions',
    );
    await writeReply(page, id, 'Higher is better, as stated.');
    await expect(requestRow(page, REPLY)).toContainText('Completed');

    await resubmit(page, id);
    await expect(page.getByRole('alert')).toContainText(SUBMITTED);
    await expect(publishingTag(page)).toHaveText('Publishing status: Pending approval');

    await asUser(browser, IMRG_REVIEWER, async (reviewer) => {
      await reviewer.goto('/dashboard');
      const row = reviewer
        .getByRole('table', { name: 'Indicators to review, oldest submission first' })
        .getByRole('row')
        .filter({ hasText: name });
      await expect(row.locator('.govuk-tag')).toHaveText(['New', 'Pending approval']);
    });
    await respondToReview(browser, id, { kind: 'approved' });

    await page.goto(overviewPath(id));
    await expect(publishingTag(page)).toHaveText('Publishing status: Publishing scheduled');
  });
});

test.describe('after pre-IMRG feedback', () => {
  test('the publisher reads the advised wording throughout', async ({
    browser,
    page,
  }, testInfo) => {
    const { id } = await inReview(browser, 'feedback answered');
    await respondToReview(browser, id, {
      kind: 'pre_imrg_feedback',
      flags: [POLARITY],
      clarification: 'Which years does the table cover?',
    });

    await page.goto(overviewPath(id));
    await expect(publishingTag(page)).toHaveText(
      'Publishing status: Revisions or clarifications advised',
    );
    await page.getByRole('button', { name: 'Respond to advised revisions' }).click();

    await expect(requestRow(page, 'Polarity').getByText('Revisions advised')).toBeVisible();
    await expect(requestRow(page, REPLY)).toContainText('Which years does the table cover?');

    await requestRow(page, REPLY).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: REPLY })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expectErrorSummaryReady(page);
    await expect(page.getByRole('alert')).toContainText(
      'Enter your response to the advised revisions and clarification request',
    );
    await expectNoAccessibilityViolations(page, testInfo);
  });
});

test.describe('after a clarification request alone', () => {
  test('the publisher is asked to respond to it, and answers it on the reply page', async ({
    browser,
    page,
  }, testInfo) => {
    const { id } = await inReview(browser, 'clarification answered');
    await respondToReview(browser, id, {
      kind: 'major_revisions',
      clarification: 'Which *years* does the table cover?',
    });

    await page.goto(overviewPath(id));
    await expect(publishingTag(page)).toHaveText('Publishing status: Major revisions needed');
    await page.getByRole('button', { name: 'Respond to clarification request' }).click();
    await requestRow(page, REPLY).getByRole('link').click();

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

    await reply(page).fill('2019 to 2024.');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(taskListPath(id));
    await page.goto(replyPath(id));
    await expect(reply(page)).toHaveValue('2019 to 2024.');
  });
});

test.describe('with a teammate', () => {
  test("refuses a reply page opened before the teammate's reply as changed", async ({
    browser,
    page,
  }) => {
    const { id } = await inReview(browser, 'two repliers');
    await respondToReview(browser, id, { kind: 'minor_revisions', flags: [POLARITY] });

    await page.goto(replyPath(id));
    await asUser(browser, SECOND_TEAM_A_PUBLISHER, (teammate) =>
      writeReply(teammate, id, "Charlie's reply."),
    );
    await reply(page).fill("Sam's reply.");
    await page.getByRole('button', { name: 'Continue' }).click();

    await expectErrorSummaryReady(page);
    await expect(page.getByRole('alert')).toContainText(
      'Someone else has changed this response since you opened this page.',
    );
    await expect(reply(page)).toHaveValue("Sam's reply.");
  });

  test('names the teammate who wrote the reply as the last editor', async ({ browser, page }) => {
    const { id, name } = await inReview(browser, 'replied by a teammate');
    await respondToReview(browser, id, { kind: 'minor_revisions', flags: [POLARITY] });

    await asUser(browser, SECOND_TEAM_A_PUBLISHER, (teammate) =>
      writeReply(teammate, id, "Charlie's reply."),
    );

    await page.goto('/dashboard');
    const row = page.getByRole('table').getByRole('row').filter({ hasText: name });
    await expect(row.getByRole('cell').nth(3)).toHaveText(SECOND_TEAM_A_PUBLISHER.name);
  });

  test("withdraws the publisher's resubmission in review, and resubmits it to the same reviewers", async ({
    browser,
    page,
  }) => {
    const { id } = await inReview(browser, 'withdrawn by a teammate');
    await respondToReview(browser, id, { kind: 'minor_revisions', flags: [POLARITY] });
    await saveUnchanged(page, id, 'polarity');
    await writeReply(page, id, 'Higher is better.');
    await resubmit(page, id);

    await asUser(browser, SECOND_TEAM_A_PUBLISHER, async (teammate) => {
      await teammate.goto(overviewPath(id));
      await teammate.getByRole('link', { name: 'Withdraw submission' }).click();
      await teammate.getByRole('button', { name: 'Withdraw submission' }).click();
      await expect(publishingTag(teammate)).toHaveText('Publishing status: Incomplete');
      await resubmit(teammate, id);
      await expect(publishingTag(teammate)).toHaveText('Publishing status: Pending approval');
    });

    await asUser(browser, IMRG_REVIEWER, async (reviewer) => {
      await reviewer.goto(overviewPath(id));
      await expect(reviewer.getByRole('button', { name: 'Submit review response' })).toBeVisible();
    });
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('saves the flagged task, writes the reply and resubmits', async ({ browser, page }) => {
    const { id } = await inReview(browser, 'answered without script');
    await respondToReview(browser, id, { kind: 'minor_revisions', flags: [POLARITY] });

    await saveUnchanged(page, id, 'polarity');
    await expect(requestRow(page, 'Polarity')).toContainText('Completed');
    await page.goto(replyPath(id));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Enter your response to the requested revisions',
    );
    await writeReply(page, id, 'Higher is better.');
    await resubmit(page, id);

    await expect(publishingTag(page)).toHaveText('Publishing status: Pending approval');
  });
});
