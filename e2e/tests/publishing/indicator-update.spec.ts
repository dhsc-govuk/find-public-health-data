import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { addReviewer, assignReviewers } from '../support/assign-reviewers.ts';
import { expectErrorSummaryReady, expectHydrated } from '../support/govuk-frontend.ts';
import { historyEntries, historyToday, openHistory } from '../support/history.ts';
import { MINUTE, publicIndicatorUrl, publishedIndicator } from '../support/published-indicator.ts';
import { asUser } from '../support/review-response.ts';
import { ADMIN, IMRG_MANAGER, IMRG_REVIEWER, PUBLISHER } from '../support/sign-in.ts';

// Only a publication gives a publisher a live indicator of their own, so the tests share one and
// run in order: the first starts its update, and the rest work on it. A second live indicator,
// published alongside, takes the core team's request for revisions, which no later step undoes.
// A third goes through IMRG review.
test.describe.configure({ mode: 'serial' });
test.use({ storageState: PUBLISHER.storageState });

let indicator: { id: string; name: string };
let sentBack: { id: string; name: string };
let reviewed: { id: string; name: string };

test.beforeAll(async ({ browser }) => {
  // Approving the indicators and waiting for the worker to publish them takes up to three minutes.
  test.setTimeout(4 * MINUTE);
  [indicator, sentBack, reviewed] = await Promise.all([
    publishedIndicator(browser, 'update'),
    publishedIndicator(browser, 'update sent back'),
    publishedIndicator(browser, 'update reviewed'),
  ]);
});

function overviewPath(id = indicator.id) {
  return `/dashboard/indicators/${id}`;
}

function taskListPath(id = indicator.id) {
  return `/publish/indicators/${id}/task-list`;
}

function statusTags(page: Page) {
  return page.getByRole('main').locator('h1 ~ p .govuk-tag');
}

/** The status beside a task on the task list, found by its title whether or not it links. */
function taskStatus(page: Page, title: string) {
  return page
    .locator('.govuk-task-list__item')
    .filter({ has: page.getByText(title, { exact: true }) })
    .locator('.govuk-task-list__status');
}

// The rationale the update gives, one word changed from the sample one it was published with.
const UPDATED_RATIONALE = 'A revised rationale.';

/** Saves the polarity page with the answer given, which returns to the task list. */
async function savePolarity(page: Page, answer: string, id = indicator.id) {
  await page.goto(`/publish/indicators/${id}/polarity`);
  await page.getByLabel(answer, { exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath(id));
}

/**
 * Starts an update of the live indicator as the publisher, changes its polarity, gives it a
 * publishing date and a summary, and submits it for review.
 */
async function submitUpdate(page: Page, id: string) {
  await page.goto(overviewPath(id));
  await page.getByRole('button', { name: 'Update indicator' }).click();
  await savePolarity(page, 'Higher is better', id);
  await page.goto(`/publish/indicators/${id}/update-summary`);
  await page
    .getByLabel('Update summary for consumer-facing indicator history')
    .fill('Polarity corrected to higher is better.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.goto(`/publish/indicators/${id}/publishing-date`);
  const date = page.getByRole('group', { name: 'Date' });
  await date.getByLabel('Day', { exact: true }).fill('1');
  await date.getByLabel('Month', { exact: true }).fill('4');
  await date.getByLabel('Year', { exact: true }).fill(String(new Date().getFullYear() + 2));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath(id));
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page).toHaveURL(overviewPath(id));
}

const REPLY = 'Response to revisions or clarifications';

/** A task's item on the task list, found by the link to its page. */
function taskRow(page: Page, title: string) {
  return page
    .locator('.govuk-task-list__item')
    .filter({ has: page.getByRole('link', { name: title, exact: true }) });
}

/** Writes the publisher's response to the round, which returns to the task list. */
async function writeReply(page: Page, id: string, text: string) {
  await page.goto(`/publish/indicators/${id}/revision-response`);
  await page.getByRole('textbox', { name: REPLY }).fill(text);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath(id));
}

/** Chooses an answer on "What should happen to this update?" from the update's overview. */
async function decide(page: Page, id: string, decision: string) {
  await page.goto(overviewPath(id));
  await page.getByRole('button', { name: 'Submit update decision' }).click();
  await page.getByLabel(decision, { exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('a live indicator with no draft gets "Update indicator", which opens a draft and goes to the update task list', async ({
  page,
}, testInfo) => {
  await page.goto(overviewPath());
  await expect(statusTags(page)).toHaveText([
    'Indicator status: Live indicator',
    'Publishing status: Published',
  ]);
  await expectNoAccessibilityViolations(page, testInfo);

  await page.getByRole('button', { name: 'Update indicator' }).click();

  await expect(page).toHaveURL(taskListPath());
  await expect(page.getByRole('heading', { level: 1, name: indicator.name })).toBeVisible();
});

test('with a draft open, the Actions tab shows "Continue updating indicator" and the overview shows "Live indicator" and "Update incomplete"', async ({
  page,
}, testInfo) => {
  await page.goto(overviewPath());

  await expect(statusTags(page)).toHaveText([
    'Indicator status: Live indicator',
    'Publishing status: Update incomplete',
  ]);
  await expect(page.getByRole('button', { name: 'Update indicator' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Continue updating indicator' })).toHaveAttribute(
    'href',
    taskListPath(),
  );
  await expectNoAccessibilityViolations(page, testInfo);
});

test('the view link reads "View live indicator"', async ({ page }) => {
  await page.goto(overviewPath());

  await expect(page.getByRole('link', { name: 'View live indicator' })).toHaveAttribute(
    'href',
    new URL(publicIndicatorUrl(indicator.name)).pathname,
  );
});

test('the dashboard and the task list show "Live indicator" and "Update incomplete"', async ({
  page,
}) => {
  await page.goto('/dashboard');
  const row = page.getByRole('table').getByRole('row').filter({ hasText: indicator.name });
  // The column headers name the two statuses, so the tags carry no hidden prefix here.
  await expect(row.locator('.govuk-tag')).toHaveText(['Live', 'Update incomplete']);

  await page.goto(taskListPath());
  await expect(statusTags(page)).toHaveText([
    'Indicator status: Live indicator',
    'Publishing status: Update incomplete',
  ]);
});

test('the History tab shows "Indicator update started"', async ({ page }) => {
  await openHistory(page, indicator.id);

  await expect(historyEntries(page).first()).toHaveText(
    `${historyToday()} Indicator update started By ${PUBLISHER.name}`,
    { useInnerText: true },
  );
});

test('every task but the publishing date and update summary reads "Unchanged" against the live indicator, and those two have "No changes to publish"', async ({
  page,
}, testInfo) => {
  await page.goto(taskListPath());

  await expect(taskStatus(page, 'Polarity')).toHaveText('Unchanged');
  await expect(taskStatus(page, 'Data table')).toHaveText('Unchanged');
  await expect(taskStatus(page, 'Other comments')).toHaveText('Unchanged');
  for (const title of ['Publishing date', 'Update summary']) {
    await expect(taskStatus(page, title)).toHaveText('No changes to publish');
    await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
  }
  await expectNoAccessibilityViolations(page, testInfo);
});

test('a changed task reads "Changed", and the publishing date and update summary become links reading "Incomplete"', async ({
  page,
}, testInfo) => {
  await savePolarity(page, 'Higher is better');

  await expect(taskStatus(page, 'Polarity')).toHaveText('Changed');
  await expect(taskStatus(page, 'Definition and rationale')).toHaveText('Unchanged');
  for (const title of ['Publishing date', 'Update summary']) {
    await expect(taskStatus(page, title)).toHaveText('Incomplete');
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
  }
  await expectNoAccessibilityViolations(page, testInfo);
});

test('the update summary page asks "What is the summary of this update?", and reads "Complete" once saved', async ({
  page,
}, testInfo) => {
  await page.goto(taskListPath());
  await page.getByRole('link', { name: 'Update summary', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'What is the summary of this update?' }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);

  await page
    .getByLabel('Update summary for consumer-facing indicator history')
    .fill('Polarity corrected to higher is better.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath());
  await expect(taskStatus(page, 'Update summary')).toHaveText('Complete');
});

test('on an update the publishing date page asks "When should this update be published?", and reads "Complete" once saved', async ({
  page,
}, testInfo) => {
  await page.goto(taskListPath());
  await page.getByRole('link', { name: 'Publishing date', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'When should this update be published?' }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);

  const date = page.getByRole('group', { name: 'Date' });
  await date.getByLabel('Day', { exact: true }).fill('1');
  await date.getByLabel('Month', { exact: true }).fill('4');
  await date.getByLabel('Year', { exact: true }).fill(String(new Date().getFullYear() + 2));
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath());
  await expect(taskStatus(page, 'Publishing date')).toHaveText('Complete');
});

test('a task saved back to its live answers reads "Unchanged" again', async ({ page }) => {
  await savePolarity(page, 'Lower is better');

  await expect(taskStatus(page, 'Polarity')).toHaveText('Unchanged');
  await expect(taskStatus(page, 'Publishing date')).toHaveText('No changes to publish');
  await expect(taskStatus(page, 'Update summary')).toHaveText('No changes to publish');
});

test('an update is not offered for review while no task is changed', async ({ page }) => {
  await page.goto(taskListPath());

  await expect(page.getByRole('button', { name: 'Submit for review' })).toHaveCount(0);
});

// Two financial years for England, a different table from the one-row sample it was published with.
const REPLACEMENT_CSV = [
  'area_code,period_start,period_end,value',
  'E92000001,2019-04-01,2020-03-31,83.8',
  'E92000001,2020-04-01,2021-03-31,84.1',
].join('\n');

test('on an update, the check page of a new data table shows "Number of data values replaced", and the Data table task reads "Changed" once it is confirmed', async ({
  page,
}, testInfo) => {
  const checkPath = `/publish/indicators/${indicator.id}/data-table/check`;

  // Until a file is uploaded, the draft shows the live indicator's table, which replaces nothing.
  await page.goto(checkPath);
  await expect(page.getByText('Your upload contains 1 row')).toBeVisible();
  await expect(page.getByText('Number of data values replaced')).toHaveCount(0);

  await page.goto(`/publish/indicators/${indicator.id}/data-table`);
  await page.getByLabel('Upload indicator data table').setInputFiles({
    name: 'data.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(REPLACEMENT_CSV),
  });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(checkPath);
  const summary = page.locator('.govuk-summary-list__row');
  await expect(summary).toHaveCount(1);
  await expect(summary.locator('dt')).toHaveText('Number of data values replaced');
  await expect(summary.locator('dd')).toHaveText('2');
  await expect(page.getByText('Your upload contains 2 rows')).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);

  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(taskListPath());
  await expect(taskStatus(page, 'Data table')).toHaveText('Changed');
});

test('an update can be submitted once at least one task is "Changed" and the publishing date and update summary are complete, and the overview\'s banner reads "Update successfully submitted for review."', async ({
  page,
}, testInfo) => {
  await savePolarity(page, 'Higher is better');
  await page.goto(`/publish/indicators/${indicator.id}/definition-and-rationale`);
  await page.getByLabel('What is the rationale for this indicator?').fill(UPDATED_RATIONALE);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(taskListPath());
  await expect(taskStatus(page, 'Definition and rationale')).toHaveText('Changed');
  await expect(taskStatus(page, 'Publishing date')).toHaveText('Complete');
  await expect(taskStatus(page, 'Update summary')).toHaveText('Complete');

  await page.getByRole('button', { name: 'Submit for review' }).click();

  await expect(page).toHaveURL(overviewPath());
  await expect(page.getByText('Update successfully submitted for review.')).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test('a submitted update has the publishing status "Update pending decision" on the overview and the dashboard', async ({
  page,
}) => {
  await page.goto(overviewPath());
  await expect(statusTags(page)).toHaveText([
    'Indicator status: Live indicator',
    'Publishing status: Update pending decision',
  ]);

  await page.goto('/dashboard');
  const row = page.getByRole('table').getByRole('row').filter({ hasText: indicator.name });
  await expect(row.locator('.govuk-tag')).toHaveText(['Live', 'Update pending decision']);
});

test('the History tab shows "Update submitted for review" with a table of "Section" and "Changes", one row per changed section and a row for the update summary', async ({
  page,
}, testInfo) => {
  await openHistory(page, indicator.id);

  const entry = historyEntries(page).first();
  await expect(entry.getByText('Update submitted for review', { exact: true })).toBeVisible();
  const table = entry.getByRole('table', { name: 'Update submitted for review' });
  await expect(table.getByRole('columnheader')).toHaveText(['Section', 'Changes']);
  await expect(table.getByRole('row').nth(1)).toHaveText(/^Data table\s*2 data values replaced$/);
  await expect(table.getByRole('row').nth(2)).toHaveText(/^Polarity\s*Higher is better$/);
  const rationale = table.getByRole('row').nth(3);
  await expect(rationale.getByRole('cell').first()).toHaveText('Definition and rationale');
  await expect(rationale.getByText('Rationale', { exact: true })).toBeVisible();
  await expect(rationale.locator('del')).toHaveText('Removed: sample');
  await expect(rationale.locator('ins')).toHaveText('Added: revised');
  await expect(table.getByRole('row').nth(4)).toHaveText(
    /^Update summary\s*Polarity corrected to higher is better\.$/,
  );
  await expectNoAccessibilityViolations(page, testInfo);
});

test.describe('the core team', () => {
  test.use({ storageState: ADMIN.storageState });

  test('the admin dashboard has an "Update decision needed (n)" tab listing the update as "Update pending decision"', async ({
    page,
  }, testInfo) => {
    await page.goto('/dashboard');
    await page.getByRole('tab', { name: /^Update decision needed \(\d+\)$/ }).click();

    const row = page
      .getByRole('table', { name: 'Updates waiting for a decision, oldest submission first' })
      .getByRole('row')
      .filter({ hasText: indicator.name });
    await expect(row.locator('.govuk-tag')).toHaveText(['Live', 'Update pending decision']);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('the overview of an "Update pending decision" update gives the core team "Submit update decision"', async ({
    page,
  }, testInfo) => {
    await page.goto(overviewPath());

    await expect(page.getByRole('button', { name: 'Submit update decision' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View live indicator' })).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('"What should happen to this update?" offers four choices, and its error is "Select what should happen to this update"', async ({
    page,
  }, testInfo) => {
    await page.goto(overviewPath());
    await page.getByRole('button', { name: 'Submit update decision' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'What should happen to this update?' }),
    ).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(4);
    for (const label of [
      'IMRG review',
      'Request revisions',
      'Publish with visibility in history',
      'Publish without visibility in history',
    ]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expectNoAccessibilityViolations(page, testInfo);

    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveTitle(/^Error: /);
    await expect(page.getByRole('alert')).toContainText('Select what should happen to this update');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('"IMRG review" sets "Update pending review", and the History tab shows "Update sent for IMRG review"', async ({
    page,
  }) => {
    await decide(page, indicator.id, 'IMRG review');

    await expect(page).toHaveURL(overviewPath());
    await expect(statusTags(page)).toHaveText([
      'Indicator status: Live indicator',
      'Publishing status: Update pending review',
    ]);

    await openHistory(page, indicator.id);
    await expect(historyEntries(page).first()).toHaveText(
      `${historyToday()} Update sent for IMRG review By ${ADMIN.name}`,
      { useInnerText: true },
    );
  });

  test('an update withdrawn after a decision waits for a new one once it is submitted again', async ({
    browser,
    page,
  }) => {
    await asUser(browser, PUBLISHER, async (publisher) => {
      await publisher.goto(overviewPath());
      await publisher.getByRole('link', { name: 'Withdraw submission' }).click();
      await publisher.getByRole('button', { name: 'Withdraw submission' }).click();
      await expect(publisher).toHaveURL(overviewPath());
      await publisher.goto(taskListPath());
      await publisher.getByRole('button', { name: 'Submit for review' }).click();
      await expect(publisher).toHaveURL(overviewPath());
    });

    await page.goto(overviewPath());
    await expect(statusTags(page)).toHaveText([
      'Indicator status: Live indicator',
      'Publishing status: Update pending decision',
    ]);
  });

  test('"Request revisions" opens "What needs to be revised or clarified?" with an "Update summary" task', async ({
    page,
  }, testInfo) => {
    await decide(page, indicator.id, 'Request revisions');

    await expect(
      page.getByRole('heading', { level: 1, name: 'What needs to be revised or clarified?' }),
    ).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Publishing' }).getByLabel('Update summary', { exact: true }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('"Publish with visibility in history" goes to "Confirm publication date", and the overview shows "Update pending scheduling", then "Update publishing scheduled"', async ({
    page,
  }, testInfo) => {
    await decide(page, indicator.id, 'Publish with visibility in history');

    await expect(page).toHaveURL(`${overviewPath()}/publication-date`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Confirm publication date' }),
    ).toBeVisible();

    await page.goto(overviewPath());
    await expect(statusTags(page)).toHaveText([
      'Indicator status: Live indicator',
      'Publishing status: Update pending scheduling',
    ]);

    // The publisher asked for a date two years ahead, so the worker never publishes it in a run.
    await page.getByRole('button', { name: 'Confirm publication date' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page).toHaveURL(overviewPath());
    await expect(page.getByText('Indicator publication date confirmed')).toBeVisible();
    await expect(statusTags(page)).toHaveText([
      'Indicator status: Live indicator',
      'Publishing status: Update publishing scheduled',
    ]);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('the History tab shows "Update approved for publishing with visibility in history" and "Publication date confirmed" by the core team member', async ({
    page,
  }) => {
    await openHistory(page, indicator.id);

    await expect(historyEntries(page).nth(0)).toHaveText(
      `${historyToday()} Publication date confirmed By ${ADMIN.name}`,
      { useInnerText: true },
    );
    await expect(historyEntries(page).nth(1)).toHaveText(
      `${historyToday()} Update approved for publishing with visibility in history By ${ADMIN.name}`,
      { useInnerText: true },
    );
  });

  test('"Request revisions" sends the update back as "Revisions or clarifications needed", with a History entry listing the flagged tasks', async ({
    browser,
    page,
  }, testInfo) => {
    await asUser(browser, PUBLISHER, (publisher) => submitUpdate(publisher, sentBack.id));

    await decide(page, sentBack.id, 'Request revisions');
    await page.getByLabel('Update summary', { exact: true }).check();
    // Every task reveals a box with the same label, so this one is found by its name.
    await page
      .locator('textarea[name="flags.update-summary"]')
      .fill('Say why the polarity changed.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(overviewPath(sentBack.id));
    await expect(
      page.getByText('Revisions or clarifications requested before update can be published'),
    ).toBeVisible();
    await expect(statusTags(page)).toHaveText([
      'Indicator status: Live indicator',
      'Publishing status: Revisions or clarifications needed',
    ]);
    await expectNoAccessibilityViolations(page, testInfo);

    await openHistory(page, sentBack.id);
    const entry = historyEntries(page).first();
    await expect(
      entry.getByText('Revisions or clarifications requested before IMRG review', { exact: true }),
    ).toBeVisible();
    await expect(entry.getByText(`By ${ADMIN.name}`)).toBeVisible();
    await expect(entry.getByRole('row').nth(1)).toHaveText(
      /^Update summary\s*Say why the polarity changed\.$/,
    );
  });
});

test.describe('the publisher responding to the core team', () => {
  test('the overview offers "Respond to requested revisions", and the dashboard reads "Revisions or clarifications needed"', async ({
    page,
  }, testInfo) => {
    await page.goto('/dashboard');
    const row = page.getByRole('table').getByRole('row').filter({ hasText: sentBack.name });
    await expect(row.locator('.govuk-tag')).toHaveText([
      'Live',
      'Revisions or clarifications needed',
    ]);

    await page.goto(overviewPath(sentBack.id));
    await expect(page.getByRole('link', { name: 'Continue updating indicator' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Respond to requested revisions' }).click();

    await expect(page).toHaveURL(taskListPath(sentBack.id));
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('the update task list shows the flagged "Update summary" with the request, and "Response to revisions or clarifications" in the Notes for reviewers group', async ({
    page,
  }) => {
    await page.goto(taskListPath(sentBack.id));

    const summary = taskRow(page, 'Update summary');
    await expect(summary).toContainText(`Comment from ${ADMIN.name}:`);
    await expect(summary).toContainText('Say why the polarity changed.');
    await expect(summary.getByText('Revisions advised')).toBeVisible();
    await expect(taskStatus(page, 'Polarity')).toHaveText('Changed');
    const notes = page
      .getByRole('heading', { level: 2, name: 'Notes for reviewers (not visible to consumers)' })
      .locator('xpath=..');
    await expect(notes.getByRole('link', { name: REPLY })).toBeVisible();
    await expect(taskRow(page, REPLY).getByText('Incomplete')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for review' })).toHaveCount(0);
  });

  test('a resubmitted update goes back to "Update pending decision", and the History tab shows "Update resubmitted for review." with "Revisions made"', async ({
    page,
  }) => {
    await page.goto(`/publish/indicators/${sentBack.id}/update-summary`);
    // Hydration puts a textarea's server-rendered text back over anything typed before it.
    await expectHydrated(page);
    await page
      .getByLabel('Update summary for consumer-facing indicator history')
      .fill('Polarity corrected to higher is better, as the source states.');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(taskRow(page, 'Update summary').getByText('Revisions advised')).toHaveCount(0);
    await writeReply(page, sentBack.id, 'Said why the polarity changed.');

    await page.getByRole('button', { name: 'Submit for review' }).click();

    await expect(page).toHaveURL(overviewPath(sentBack.id));
    await expect(page.getByText('Update successfully submitted for review.')).toBeVisible();
    await expect(statusTags(page)).toHaveText([
      'Indicator status: Live indicator',
      'Publishing status: Update pending decision',
    ]);

    await openHistory(page, sentBack.id);
    const entry = historyEntries(page).first();
    await expect(entry.getByText('Update resubmitted for review.', { exact: true })).toBeVisible();
    await expect(entry.getByText(`By ${PUBLISHER.name}`)).toBeVisible();
    await expect(entry.getByRole('row').nth(1)).toHaveText(/^Update summary\s*Revisions made$/);
    await expect(entry.getByRole('row').nth(2)).toHaveText(
      /^Response to revisions or clarifications\s*Said why the polarity changed\.$/,
    );
  });
});

test.describe('IMRG review of an update', () => {
  test('the IMRG manager assigns a reviewer with "Assign reviewer to update", the banner reads "Reviewers successfully assigned to update", and the link becomes "Change reviewer for this update"', async ({
    browser,
  }, testInfo) => {
    await asUser(browser, PUBLISHER, (publisher) => submitUpdate(publisher, reviewed.id));
    await asUser(browser, ADMIN, (admin) => decide(admin, reviewed.id, 'IMRG review'));

    await asUser(browser, IMRG_MANAGER, async (manager) => {
      await manager.goto(overviewPath(reviewed.id));
      await manager.getByRole('button', { name: 'Assign reviewer to update' }).click();
      await addReviewer(manager, IMRG_REVIEWER.name);
      await manager.getByRole('button', { name: 'Continue' }).click();

      await expect(manager).toHaveURL(overviewPath(reviewed.id));
      await expect(manager.getByText('Reviewers successfully assigned to update')).toBeVisible();
      await expect(
        manager.getByRole('link', { name: 'Change reviewer for this update' }),
      ).toBeVisible();
      await expectNoAccessibilityViolations(manager, testInfo);
    });
  });

  test('the History tab shows "Update assigned for review by …"', async ({ page }) => {
    await openHistory(page, reviewed.id);

    await expect(historyEntries(page).first()).toHaveText(
      `${historyToday()} Update assigned for review by ${IMRG_REVIEWER.name}. By ${IMRG_MANAGER.name}`,
      { useInnerText: true },
    );
  });

  test('"Submit review response" on an update goes to "Can this update be published?", which errors "Select whether you approve this update for publishing" and "Select at least one kind of feedback"', async ({
    browser,
  }, testInfo) => {
    await asUser(browser, IMRG_REVIEWER, async (reviewer) => {
      await reviewer.goto(overviewPath(reviewed.id));
      await reviewer.getByRole('button', { name: 'Submit review response' }).click();

      await expect(
        reviewer.getByRole('heading', { level: 1, name: 'Can this update be published?' }),
      ).toBeVisible();
      await expect(reviewer.getByText(`Indicator name: ${reviewed.name}`)).toBeVisible();
      await expect(reviewer.getByText(/^Scheduled publication date: 1 April \d{4}/)).toBeVisible();
      await expectNoAccessibilityViolations(reviewer, testInfo);

      await reviewer.getByRole('button', { name: 'Continue' }).click();
      await expectErrorSummaryReady(reviewer);
      await expect(reviewer).toHaveTitle(/^Error: /);
      await expect(reviewer.getByRole('alert')).toContainText(
        'Select whether you approve this update for publishing',
      );

      await reviewer.getByLabel('No', { exact: true }).check();
      await expect(reviewer.getByRole('group', { name: 'Select reasons' })).toBeVisible();
      await reviewer.getByRole('button', { name: 'Continue' }).click();
      await expectErrorSummaryReady(reviewer);
      await expect(reviewer.getByRole('alert')).toContainText(
        'Select at least one kind of feedback',
      );
      await expectNoAccessibilityViolations(reviewer, testInfo);
    });
  });

  test('"No" with "Request for clarification" goes to "What needs to be revised or clarified?" with the Update summary task, and sends the update back as "Revisions or clarifications needed" with its banner', async ({
    browser,
  }, testInfo) => {
    await asUser(browser, IMRG_REVIEWER, async (reviewer) => {
      await reviewer.goto(`${overviewPath(reviewed.id)}/review/update-approval`);
      await reviewer.getByLabel('No', { exact: true }).check();
      await reviewer.getByLabel('Request for clarification').check();
      await reviewer.getByRole('button', { name: 'Continue' }).click();

      await expect(
        reviewer.getByRole('heading', { level: 1, name: 'What needs to be revised or clarified?' }),
      ).toBeVisible();
      await expect(
        reviewer
          .getByRole('group', { name: 'Publishing' })
          .getByLabel('Update summary', { exact: true }),
      ).toBeVisible();
      await reviewer.getByLabel('High-level clarification request').check();
      await reviewer
        .getByLabel('What are you requesting clarification about?')
        .fill('Which source says higher is better?');
      await reviewer.getByRole('button', { name: 'Continue' }).click();

      await expect(reviewer).toHaveURL(overviewPath(reviewed.id));
      await expect(
        reviewer.getByText('Revisions or clarifications requested before update can be published'),
      ).toBeVisible();
      await expect(statusTags(reviewer)).toHaveText([
        'Indicator status: Live indicator',
        'Publishing status: Revisions or clarifications needed',
      ]);
      await expectNoAccessibilityViolations(reviewer, testInfo);
    });
  });

  test('the publisher responds with "Respond to clarification request", and the resubmitted update goes back to "Update pending decision"', async ({
    page,
  }, testInfo) => {
    await page.goto(overviewPath(reviewed.id));
    await page.getByRole('button', { name: 'Respond to clarification request' }).click();

    await expect(page).toHaveURL(taskListPath(reviewed.id));
    const reply = taskRow(page, REPLY);
    await expect(reply).toContainText(`Comment from ${IMRG_REVIEWER.name}:`);
    await expect(reply).toContainText('Which source says higher is better?');
    await expect(taskStatus(page, 'Polarity')).toHaveText('Changed');
    await expectNoAccessibilityViolations(page, testInfo);

    await writeReply(page, reviewed.id, 'The source is the annual report.');
    await page.getByRole('button', { name: 'Submit for review' }).click();

    await expect(page).toHaveURL(overviewPath(reviewed.id));
    await expect(statusTags(page)).toHaveText([
      'Indicator status: Live indicator',
      'Publishing status: Update pending decision',
    ]);

    await openHistory(page, reviewed.id);
    await expect(historyEntries(page).nth(0)).toContainText('Update resubmitted for review.');
    await expect(historyEntries(page).nth(1)).toContainText(
      'Revisions or clarifications requested before update can be approved for publishing.',
    );
    await expect(historyEntries(page).nth(1)).toContainText(`By ${IMRG_REVIEWER.name}`);
  });

  test('sent to IMRG again and assigned, "Yes" approves the update: the banner reads "Update approved for publishing" and the update "Update pending scheduling"', async ({
    browser,
  }, testInfo) => {
    await asUser(browser, ADMIN, (admin) => decide(admin, reviewed.id, 'IMRG review'));
    await assignReviewers(browser, reviewed.id, [IMRG_REVIEWER.name]);

    await asUser(browser, IMRG_REVIEWER, async (reviewer) => {
      await reviewer.goto(overviewPath(reviewed.id));
      await reviewer.getByRole('button', { name: 'Submit review response' }).click();
      await reviewer.getByLabel('Yes', { exact: true }).check();
      await reviewer.getByRole('button', { name: 'Continue' }).click();

      await expect(reviewer).toHaveURL(overviewPath(reviewed.id));
      await expect(reviewer.getByRole('alert')).toContainText('Update approved for publishing');
      await expect(statusTags(reviewer)).toHaveText([
        'Indicator status: Live indicator',
        'Publishing status: Update pending scheduling',
      ]);
      await expectNoAccessibilityViolations(reviewer, testInfo);

      await openHistory(reviewer, reviewed.id);
      await expect(historyEntries(reviewer).first()).toHaveText(
        `${historyToday()} Update approved for publishing By ${IMRG_REVIEWER.name}`,
        { useInnerText: true },
      );
    });
  });
});
