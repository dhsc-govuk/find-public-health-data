import { type Browser, expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { assignReviewers } from '../support/assign-reviewers.ts';
import { submitNewIndicator } from '../support/complete-draft.ts';
import { uniqueIndicatorName } from '../support/create-indicator.ts';
import {
  IMRG_MANAGER,
  IMRG_REVIEWER,
  PUBLISHER,
  SECOND_IMRG_REVIEWER,
  type SignedInUser,
} from '../support/sign-in.ts';

const NOTE_LABEL = 'Enter any notes as part of your indicator review';

function overviewPath(id: string) {
  return `/dashboard/indicators/${id}`;
}

/** The overview without the edit query; a save from an Edit link keeps its fragment. */
function savedOverview(id: string) {
  return new RegExp(`${overviewPath(id)}(#reviewerNote-input)?$`);
}

/** A new indicator, submitted and in review with the named reviewers. */
async function inReview(
  browser: Browser,
  label: string,
  reviewers: readonly string[] = [IMRG_REVIEWER.name],
) {
  const id = await submitNewIndicator(browser, uniqueIndicatorName(label), PUBLISHER);
  await assignReviewers(browser, id, reviewers);
  return id;
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

function notesTable(page: Page) {
  return page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Notes' }) });
}

async function addNote(page: Page, id: string, text: string) {
  await page.goto(overviewPath(id));
  await page.getByLabel(NOTE_LABEL).fill(text);
  await page.getByRole('button', { name: 'Add notes' }).click();
  await expect(page).toHaveURL(overviewPath(id));
}

async function editNote(page: Page, text: string) {
  await page.getByRole('link', { name: /^Edit the note from/ }).click();
  await expect(page.getByRole('button', { name: 'Update notes' })).toBeVisible();
  await page.getByLabel(NOTE_LABEL).fill(text);
  await page.getByRole('button', { name: 'Update notes' }).click();
}

test.describe('as an assigned IMRG reviewer', () => {
  test.use({ storageState: IMRG_REVIEWER.storageState });

  test('a reviewer adds a note, which is listed under Your notes', async ({
    browser,
    page,
  }, testInfo) => {
    const id = await inReview(browser, 'reviewer adds a note');

    await page.goto(overviewPath(id));
    await expect(page.getByRole('heading', { level: 3, name: 'Your notes' })).toBeVisible();
    await expect(notesTable(page)).toHaveCount(0);
    await expectNoAccessibilityViolations(page, testInfo);

    await addNote(page, id, 'Check the dip in 2019.');

    await expect(notesTable(page)).toContainText('Check the dip in 2019.');
    await expect(page.getByLabel(NOTE_LABEL)).toHaveValue('');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test("a reviewer edits a note from its Edit link, and the button reads 'Update notes'", async ({
    browser,
    page,
  }, testInfo) => {
    const id = await inReview(browser, 'reviewer edits a note');
    await addNote(page, id, 'First thought.');

    await page.getByRole('link', { name: /^Edit the note from/ }).click();
    await expect(page.getByLabel(NOTE_LABEL)).toHaveValue('First thought.');
    await expectNoAccessibilityViolations(page, testInfo);
    await page.getByLabel(NOTE_LABEL).fill('Settled thought.');
    await page.getByRole('button', { name: 'Update notes' }).click();

    await expect(page).toHaveURL(savedOverview(id));
    await expect(notesTable(page).getByRole('row')).toHaveCount(2);
    await expect(notesTable(page)).toContainText('Settled thought.');
    await expect(page.getByRole('button', { name: 'Add notes' })).toBeVisible();
  });

  test('an empty note is refused with an error summary', async ({ browser, page }, testInfo) => {
    const id = await inReview(browser, 'reviewer adds an empty note');

    await page.goto(overviewPath(id));
    await page.getByRole('button', { name: 'Add notes' }).click();

    await expect(page).toHaveTitle(/^Error: /);
    await expect(page.getByRole('alert')).toContainText('Enter your notes');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('a note edited in another tab since the form was filled is refused as changed', async ({
    browser,
    page,
  }) => {
    const id = await inReview(browser, 'note edited in two tabs');
    await addNote(page, id, 'Original.');
    await page.getByRole('link', { name: /^Edit the note from/ }).click();

    const other = await page.context().newPage();
    await other.goto(overviewPath(id));
    await editNote(other, 'From the other tab.');
    await other.close();

    await page.getByLabel(NOTE_LABEL).fill('From this tab.');
    await page.getByRole('button', { name: 'Update notes' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'This note has changed since you opened it. Check it, then edit it again.',
    );
    await expect(notesTable(page)).toContainText('From the other tab.');
    await expect(page.getByLabel(NOTE_LABEL)).toHaveValue('From this tab.');
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('a reviewer adds and edits a note with the same forms', async ({ browser, page }) => {
      const id = await inReview(browser, 'notes without JavaScript');

      await addNote(page, id, 'Written without scripts.');
      await expect(notesTable(page)).toContainText('Written without scripts.');

      await editNote(page, 'Edited without scripts.');
      await expect(page).toHaveURL(savedOverview(id));
      await expect(notesTable(page)).toContainText('Edited without scripts.');
      await expect(notesTable(page)).not.toContainText('Written without scripts.');
    });
  });
});

test.describe("the reviewer's notes are private", () => {
  test.use({ storageState: SECOND_IMRG_REVIEWER.storageState });

  test("another assigned reviewer sees none of the reviewer's notes", async ({ browser, page }) => {
    const id = await inReview(browser, 'notes kept from Robin', [
      IMRG_REVIEWER.name,
      SECOND_IMRG_REVIEWER.name,
    ]);
    await as(browser, IMRG_REVIEWER, (jamie) => addNote(jamie, id, "Jamie's private note."));

    await page.goto(overviewPath(id));

    await expect(page.getByRole('heading', { level: 3, name: 'Your notes' })).toBeVisible();
    await expect(page.getByText("Jamie's private note.")).toHaveCount(0);
    await expect(notesTable(page)).toHaveCount(0);
  });

  for (const user of [PUBLISHER, IMRG_MANAGER]) {
    test(`the overview of ${user.name} shows no reviewer's notes`, async ({ browser }) => {
      const id = await inReview(browser, `notes kept from ${user.name}`);
      await as(browser, IMRG_REVIEWER, (jamie) => addNote(jamie, id, "Jamie's private note."));

      await as(browser, user, async (other) => {
        await other.goto(overviewPath(id));
        await expect(other.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(other.getByRole('heading', { name: 'Your notes' })).toHaveCount(0);
        await expect(other.getByText("Jamie's private note.")).toHaveCount(0);
      });
    });
  }
});
