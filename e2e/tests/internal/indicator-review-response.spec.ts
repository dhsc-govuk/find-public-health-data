import { type Browser, expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { assignReviewers } from '../support/assign-reviewers.ts';
import { submitDraft, submitNewIndicator } from '../support/complete-draft.ts';
import { uniqueIndicatorName } from '../support/create-indicator.ts';
import {
  ADMIN,
  IMRG_MANAGER,
  IMRG_REVIEWER,
  PUBLISHER,
  PUBLISHER_AND_REVIEWER,
  SECOND_IMRG_REVIEWER,
  type SignedInUser,
  TEAM_C_PUBLISHER,
} from '../support/sign-in.ts';

const NOT_WAITING = 'This indicator is no longer waiting for a review response.';

function overviewPath(id: string) {
  return `/dashboard/indicators/${id}`;
}

function publishingTag(page: Page) {
  return page.getByRole('main').locator('h1 ~ p .govuk-tag').nth(1);
}

/** A day counted from today in the UK, as the date page takes it. */
function ukDay(offset: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date(Date.now() + offset * 24 * 60 * 60 * 1000));
  const part = (type: string) => parts.find((each) => each.type === type)?.value ?? '';
  return { day: part('day'), month: part('month'), year: part('year') };
}

/** A new indicator, submitted by `publisher` and in review with the named reviewers. */
async function inReview(
  browser: Browser,
  label: string,
  reviewers: readonly string[] = [IMRG_REVIEWER.name],
  publisher: SignedInUser = PUBLISHER,
) {
  const name = uniqueIndicatorName(label);
  const id = await submitNewIndicator(browser, name, publisher);
  await assignReviewers(browser, id, reviewers);
  return { id, name };
}

/** The notes under a flagged task's box on the revisions page. */
function flagNotes(page: Page, task: string) {
  return page.locator(`textarea[name="flags.${task}"]`);
}

/** Opens the overview and starts the response, landing on the response type page. */
async function startResponse(page: Page, id: string) {
  await page.goto(overviewPath(id));
  await page.getByRole('button', { name: 'Submit review response' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'What response are you submitting?' }),
  ).toBeVisible();
}

async function enterReviewDate(page: Page, { day, month, year } = ukDay(0)) {
  await page.getByLabel('Day').fill(day);
  await page.getByLabel('Month').fill(month);
  await page.getByLabel('Year').fill(year);
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** Takes the response through the decision pages, from the response type page to the approval. */
async function decide(page: Page) {
  await page.getByLabel('IMRG review decision').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await enterReviewDate(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Was this indicator approved for publishing?' }),
  ).toBeVisible();
}

/** Runs `act` as `user`, in a browser context of their own. */
async function as<T>(browser: Browser, user: SignedInUser, act: (page: Page) => Promise<T>) {
  const context = await browser.newContext({ storageState: user.storageState });
  try {
    return await act(await context.newPage());
  } finally {
    await context.close();
  }
}

test.describe('as an assigned IMRG reviewer', () => {
  test.use({ storageState: IMRG_REVIEWER.storageState });

  test('pre-IMRG feedback flags a task and asks for clarification, landing on the overview with its banner', async ({
    browser,
    page,
  }, testInfo) => {
    const { id } = await inReview(browser, 'pre-IMRG feedback');

    await page.goto(overviewPath(id));
    await expect(
      page.getByRole('tabpanel', { name: 'Actions' }).getByRole('heading', { level: 2 }),
    ).toHaveText(['Review']);
    await startResponse(page, id);
    await expectNoAccessibilityViolations(page, testInfo);
    await page.getByLabel('Pre-IMRG meeting feedback').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'What needs to be revised or clarified?' }),
    ).toBeVisible();
    await page.getByLabel('High-level clarification request').check();
    await page
      .getByLabel('What are you requesting clarification about?')
      .fill('Which years does the data table cover?');
    await page.getByLabel('Polarity').check();
    await flagNotes(page, 'polarity').fill('Check whether higher is better.');
    await expectNoAccessibilityViolations(page, testInfo);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(overviewPath(id));
    await expect(page.getByRole('region', { name: 'Important' })).toContainText(
      'Revisions or clarifications advised before indicator submitted for IMRG review',
    );
    await expect(publishingTag(page)).toHaveText(
      'Publishing status: Revisions or clarifications advised',
    );
    await expect(page.getByRole('button', { name: 'Submit review response' })).toHaveCount(0);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('an IMRG decision of minor revisions is dated, then flags a task, landing on the overview with its banner', async ({
    browser,
    page,
  }, testInfo) => {
    const { id, name } = await inReview(browser, 'minor revisions');

    await startResponse(page, id);
    await page.getByLabel('IMRG review decision').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'When was this indicator reviewed by IMRG?' }),
    ).toBeVisible();
    await expect(page.getByText(`Indicator name: ${name}`)).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
    await enterReviewDate(page);

    await page.getByLabel('No', { exact: true }).check();
    await page.getByLabel('Minor revisions needed').check();
    await expectNoAccessibilityViolations(page, testInfo);
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Data table').check();
    await flagNotes(page, 'data-table').fill('Add the 2024 figures.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(overviewPath(id));
    await expect(page.getByRole('region', { name: 'Important' })).toContainText(
      'Indicator requires minor revisions to be approved for publishing',
    );
    await expect(publishingTag(page)).toHaveText('Publishing status: Minor revisions needed');
    await expect(page.getByRole('button', { name: 'Submit review response' })).toHaveCount(0);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('an IMRG decision of major revisions lands on the overview with the red banner', async ({
    browser,
    page,
  }, testInfo) => {
    const { id } = await inReview(browser, 'major revisions');

    await startResponse(page, id);
    await decide(page);
    await page.getByLabel('No', { exact: true }).check();
    await page.getByLabel('Major revisions needed').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('High-level clarification request').check();
    await page
      .getByLabel('What are you requesting clarification about?')
      .fill('How is the denominator chosen?');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('region', { name: 'Important' })).toContainText(
      'Indicator requires major revisions to be approved for publishing',
    );
    await expect(publishingTag(page)).toHaveText('Publishing status: Major revisions needed');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('approval lands on the overview with the success banner and Publishing scheduled', async ({
    browser,
    page,
  }, testInfo) => {
    const { id } = await inReview(browser, 'approved');

    await startResponse(page, id);
    await decide(page);
    await page.getByLabel('Yes', { exact: true }).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(overviewPath(id));
    await expect(page.getByRole('alert')).toContainText('Indicator approved for publishing');
    await expect(publishingTag(page)).toHaveText('Publishing status: Publishing scheduled');
    await expect(page.getByText(/^Scheduled publication date:/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit review response' })).toHaveCount(0);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('the date page refuses a date in the future and one before the first submission', async ({
    browser,
    page,
  }, testInfo) => {
    const { id } = await inReview(browser, 'review date errors');

    await startResponse(page, id);
    await page.getByLabel('IMRG review decision').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveTitle(/^Error: When was this indicator reviewed by IMRG\?/);
    await expect(page.getByRole('alert').getByRole('link')).toHaveText([
      'Enter the date this indicator was reviewed by IMRG',
    ]);
    await expectNoAccessibilityViolations(page, testInfo);

    await enterReviewDate(page, ukDay(1));
    await expect(page.getByRole('alert')).toContainText(
      'Date reviewed by IMRG must be today or in the past',
    );

    await enterReviewDate(page, ukDay(-1));
    await expect(page.getByRole('alert')).toContainText(
      'Date reviewed by IMRG must be on or after',
    );
  });

  test('the revisions page asks for something to revise or clarify when nothing is ticked', async ({
    browser,
    page,
  }, testInfo) => {
    const { id } = await inReview(browser, 'nothing ticked');

    await startResponse(page, id);
    await page.getByLabel('Pre-IMRG meeting feedback').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveTitle(/^Error: What needs to be revised or clarified\?/);
    await expect(page.getByRole('alert').getByRole('link')).toHaveText([
      'Select what needs to be revised or clarified',
    ]);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('a response page opened before a resubmission is refused with the changed banner', async ({
    browser,
    page,
  }) => {
    const { id } = await inReview(browser, 'resubmitted meanwhile');

    await startResponse(page, id);
    await page.getByLabel('Pre-IMRG meeting feedback').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await as(browser, PUBLISHER, async (publisher) => {
      await publisher.goto(overviewPath(id));
      await publisher.getByRole('link', { name: 'Withdraw submission' }).click();
      await publisher.getByRole('button', { name: 'Withdraw submission' }).click();
      await submitDraft(publisher, id);
    });

    await page.getByLabel('High-level clarification request').check();
    await page.getByLabel('What are you requesting clarification about?').fill('Too late.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(overviewPath(id));
    await expect(page.getByRole('region', { name: 'Important' })).toContainText(
      'This indicator has been resubmitted since you opened this page.',
    );
    await expect(publishingTag(page)).toHaveText('Publishing status: Pending approval');
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('posts the same forms to approve the indicator', async ({ browser, page }) => {
      const { id } = await inReview(browser, 'no script approval');

      await startResponse(page, id);
      await decide(page);
      await page.getByLabel('Yes', { exact: true }).check();
      await page.getByRole('button', { name: 'Continue' }).click();

      await expect(page).toHaveURL(overviewPath(id));
      await expect(publishingTag(page)).toHaveText('Publishing status: Publishing scheduled');
    });

    test('re-renders the revisions page with its error summary when nothing is ticked', async ({
      browser,
      page,
    }) => {
      const { id } = await inReview(browser, 'no script nothing ticked');

      await startResponse(page, id);
      await page.getByLabel('Pre-IMRG meeting feedback').check();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();

      await expect(page.getByRole('alert')).toContainText(
        'Select what needs to be revised or clarified',
      );
    });

    test('posts the same forms to send minor revisions', async ({ browser, page }) => {
      const { id } = await inReview(browser, 'no script');

      await startResponse(page, id);
      await decide(page);
      await page.getByLabel('No', { exact: true }).check();
      await page.getByLabel('Minor revisions needed').check();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByLabel('Tagging').check();
      await flagNotes(page, 'tagging').fill('Add a topic.');
      await page.getByRole('button', { name: 'Continue' }).click();

      await expect(page).toHaveURL(overviewPath(id));
      await expect(publishingTag(page)).toHaveText('Publishing status: Minor revisions needed');
    });
  });
});

test.describe('with two reviewers assigned', () => {
  test.use({ storageState: SECOND_IMRG_REVIEWER.storageState });

  test("once one reviewer has responded, the other's button is gone and their open page is refused", async ({
    browser,
    page,
  }) => {
    const { id } = await inReview(browser, 'two reviewers', [
      IMRG_REVIEWER.name,
      SECOND_IMRG_REVIEWER.name,
    ]);

    await startResponse(page, id);
    await page.getByLabel('Pre-IMRG meeting feedback').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await as(browser, IMRG_REVIEWER, async (jamie) => {
      await startResponse(jamie, id);
      await decide(jamie);
      await jamie.getByLabel('Yes', { exact: true }).check();
      await jamie.getByRole('button', { name: 'Continue' }).click();
      await expect(jamie.getByRole('alert')).toContainText('Indicator approved for publishing');
    });

    await page.getByLabel('High-level clarification request').check();
    await page.getByLabel('What are you requesting clarification about?').fill('Too late.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(overviewPath(id));
    await expect(page.getByRole('region', { name: 'Important' })).toContainText(NOT_WAITING);
    await expect(page.getByRole('button', { name: 'Submit review response' })).toHaveCount(0);
  });

  test('an unassigned reviewer gets the not-found page', async ({ browser, page }) => {
    const { id } = await inReview(browser, 'not assigned to Robin');

    const response = await page.goto(overviewPath(id));

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});

test.describe("the overview's Actions tab", () => {
  test.describe('for a publisher assigned to review a teammate’s indicator', () => {
    test.use({ storageState: PUBLISHER_AND_REVIEWER.storageState });

    test('shows the Review section, then the Actions section with the editor’s response once the draft is sent back', async ({
      browser,
      page,
    }, testInfo) => {
      const { id } = await inReview(
        browser,
        'reviewed by a teammate',
        [PUBLISHER_AND_REVIEWER.name],
        TEAM_C_PUBLISHER,
      );

      await page.goto(overviewPath(id));
      const sections = page.getByRole('tabpanel', { name: 'Actions' }).getByRole('heading', {
        level: 2,
      });
      await expect(sections).toHaveText(['Review', 'Actions']);
      await expect(page.getByRole('link', { name: 'Withdraw submission' })).toBeVisible();

      await page.getByRole('button', { name: 'Submit review response' }).click();
      await page.getByLabel('Pre-IMRG meeting feedback').check();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByLabel('Name', { exact: true }).check();
      await flagNotes(page, 'name').fill('A shorter name, please.');
      await page.getByRole('button', { name: 'Continue' }).click();

      await expect(sections).toHaveText(['Review', 'Actions']);
      await expect(
        page.getByRole('button', { name: 'Respond to advised revisions' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Submit review response' })).toHaveCount(0);
      await expectNoAccessibilityViolations(page, testInfo);
    });
  });

  test.describe('for the IMRG manager', () => {
    test.use({ storageState: IMRG_MANAGER.storageState });

    test('shows only the Actions section, with the reviewer assignment link', async ({
      browser,
      page,
    }) => {
      const { id } = await inReview(browser, 'seen by the manager');

      await page.goto(overviewPath(id));

      await expect(
        page.getByRole('tabpanel', { name: 'Actions' }).getByRole('heading', { level: 2 }),
      ).toHaveText(['Actions']);
      await expect(
        page.getByRole('link', { name: 'Change reviewers for this indicator' }),
      ).toBeVisible();
    });
  });

  test.describe('for an admin', () => {
    test.use({ storageState: ADMIN.storageState });

    test('shows the Actions section with the no-actions text on a new indicator', async ({
      browser,
      page,
    }) => {
      const { id } = await inReview(browser, 'seen by an admin');

      await page.goto(overviewPath(id));

      await expect(
        page.getByRole('tabpanel', { name: 'Actions' }).getByRole('heading', { level: 2 }),
      ).toHaveText(['Actions']);
      await expect(
        page.getByText('There are no actions available for this indicator yet.'),
      ).toBeVisible();
    });
  });
});
