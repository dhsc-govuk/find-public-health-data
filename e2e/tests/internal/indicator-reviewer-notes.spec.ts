import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { asUser, inReview } from '../support/review-response.ts';
import {
  ADMIN,
  IMRG_MANAGER,
  IMRG_REVIEWER,
  PUBLISHER,
  SECOND_IMRG_REVIEWER,
} from '../support/sign-in.ts';

const NOTE_LABEL = 'Enter any notes as part of your indicator review';

function overviewPath(id: string) {
  return `/dashboard/indicators/${id}`;
}

/** Where a saved note lands: the overview's Actions tab, without the edit query. */
function savedOverview(id: string) {
  return new RegExp(`${overviewPath(id)}#actions$`);
}

/** The reader's own notes: the one table with Edit links. */
function notesTable(page: Page) {
  return page
    .getByRole('table')
    .filter({ has: page.getByRole('columnheader', { name: 'Edit link' }) });
}

/** The read-only section headed with another reviewer's name. */
function notesBy(page: Page, name: string) {
  return page.getByRole('heading', { level: 3, name: `${name}'s notes` }).locator('xpath=..');
}

async function addNote(page: Page, id: string, text: string) {
  await page.goto(overviewPath(id));
  await page.getByLabel(NOTE_LABEL).fill(text);
  await page.getByRole('button', { name: 'Add notes' }).click();
  await expect(page).toHaveURL(savedOverview(id));
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
    const { id } = await inReview(browser, 'reviewer adds a note');

    await page.goto(overviewPath(id));
    await expect(page.getByRole('heading', { level: 3, name: 'Your notes' })).toBeVisible();
    await expect(notesTable(page)).toHaveCount(0);
    await expectNoAccessibilityViolations(page, testInfo);

    await addNote(page, id, 'Check the dip in 2019.');

    await expect(page.getByRole('tab', { name: 'Actions', selected: true })).toBeVisible();
    await expect(notesTable(page)).toContainText('Check the dip in 2019.');
    await expect(page.getByLabel(NOTE_LABEL)).toHaveValue('');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test("a reviewer edits a note from its Edit link, and the button reads 'Update notes'", async ({
    browser,
    page,
  }, testInfo) => {
    const { id } = await inReview(browser, 'reviewer edits a note');
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
    const { id } = await inReview(browser, 'reviewer adds an empty note');

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
    const { id } = await inReview(browser, 'note edited in two tabs');
    await addNote(page, id, 'Original.');
    await page.getByRole('link', { name: /^Edit the note from/ }).click();

    // Not closed afterwards: closing a tab still starting its scripts after a save has hung the test.
    const other = await page.context().newPage();
    await other.goto(overviewPath(id));
    await editNote(other, 'From the other tab.');

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
      const { id } = await inReview(browser, 'notes without JavaScript');

      await addNote(page, id, 'Written without scripts.');
      await expect(notesTable(page)).toContainText('Written without scripts.');

      await editNote(page, 'Edited without scripts.');
      await expect(page).toHaveURL(savedOverview(id));
      await expect(notesTable(page)).toContainText('Edited without scripts.');
      await expect(notesTable(page)).not.toContainText('Written without scripts.');
    });
  });
});

test.describe("the reviewers' notes are shared", () => {
  test.use({ storageState: SECOND_IMRG_REVIEWER.storageState });

  test("another assigned reviewer sees the reviewer's notes read only, under the reviewer's name", async ({
    browser,
    page,
  }, testInfo) => {
    const { id } = await inReview(browser, 'notes shared with Robin', [
      IMRG_REVIEWER.name,
      SECOND_IMRG_REVIEWER.name,
    ]);
    await asUser(browser, IMRG_REVIEWER, async (jamie) => {
      await addNote(jamie, id, "Jamie's shared note.");
      await expect(notesBy(jamie, SECOND_IMRG_REVIEWER.name)).toContainText('No notes added');
    });

    await page.goto(overviewPath(id));

    await expect(page.getByRole('heading', { level: 3, name: 'Your notes' })).toBeVisible();
    await expect(notesTable(page)).toHaveCount(0);
    await expect(notesBy(page, IMRG_REVIEWER.name)).toContainText("Jamie's shared note.");
    await expect(page.getByRole('link', { name: /^Edit the note from/ })).toHaveCount(0);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test("another reviewer cannot edit the reviewer's note, from its address or by posting", async ({
    browser,
    page,
  }) => {
    const { id } = await inReview(browser, 'note Robin cannot edit', [
      IMRG_REVIEWER.name,
      SECOND_IMRG_REVIEWER.name,
    ]);
    // The note's id and version as Jamie's own edit form sends them.
    const { editPath, noteId, version } = await asUser(browser, IMRG_REVIEWER, async (jamie) => {
      await addNote(jamie, id, "Jamie's own words.");
      await jamie.getByRole('link', { name: /^Edit the note from/ }).click();
      await expect(jamie.getByRole('button', { name: 'Update notes' })).toBeVisible();
      const hidden = (name: string) =>
        jamie.locator(`input[type="hidden"][name="${name}"]`).inputValue();
      return {
        editPath: jamie.url(),
        noteId: await hidden('noteId'),
        version: await hidden('version'),
      };
    });

    await page.goto(editPath);
    await expect(page.getByLabel(NOTE_LABEL)).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Add notes' })).toBeVisible();

    const response = await page.request.post(overviewPath(id), {
      form: { reviewerNote: 'Overwritten by Robin.', noteId, version },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);

    await page.goto(overviewPath(id));
    await expect(notesBy(page, IMRG_REVIEWER.name)).toContainText("Jamie's own words.");
    await expect(page.getByText('Overwritten by Robin.')).toHaveCount(0);
  });

  test("a reviewer's notes stay visible under their name once they are unassigned", async ({
    browser,
    page,
  }) => {
    const { id } = await inReview(browser, 'notes outlast Jamie', [
      IMRG_REVIEWER.name,
      SECOND_IMRG_REVIEWER.name,
    ]);
    await asUser(browser, IMRG_REVIEWER, (jamie) => addNote(jamie, id, 'Written before leaving.'));
    await asUser(browser, IMRG_MANAGER, async (manager) => {
      await manager.goto(`${overviewPath(id)}/assign-reviewers`);
      await manager.getByRole('button', { name: `Remove reviewer ${IMRG_REVIEWER.name}` }).click();
      await manager.getByRole('button', { name: 'Continue' }).click();
      await expect(manager).toHaveURL(overviewPath(id));
    });

    await page.goto(overviewPath(id));

    await expect(notesBy(page, IMRG_REVIEWER.name)).toContainText('Written before leaving.');
  });

  for (const user of [IMRG_MANAGER, ADMIN]) {
    test(`${user.name} sees every reviewer's notes read only`, async ({ browser }, testInfo) => {
      const { id } = await inReview(browser, `notes read by ${user.name}`, [
        IMRG_REVIEWER.name,
        SECOND_IMRG_REVIEWER.name,
      ]);
      await asUser(browser, IMRG_REVIEWER, (jamie) => addNote(jamie, id, "Jamie's note."));

      await asUser(browser, user, async (reader) => {
        await reader.goto(overviewPath(id));
        await expect(
          reader.getByRole('heading', { level: 2, name: "Reviewers' notes" }),
        ).toBeVisible();
        await expect(notesBy(reader, IMRG_REVIEWER.name)).toContainText("Jamie's note.");
        await expect(notesBy(reader, SECOND_IMRG_REVIEWER.name)).toContainText('No notes added');
        await expect(reader.getByRole('heading', { name: 'Your notes' })).toHaveCount(0);
        await expect(reader.getByLabel(NOTE_LABEL)).toHaveCount(0);
        await expect(reader.getByRole('link', { name: /^Edit the note from/ })).toHaveCount(0);
        await expectNoAccessibilityViolations(reader, testInfo);
      });
    });
  }

  test("the publisher's overview shows no reviewer's notes", async ({ browser }) => {
    const { id } = await inReview(browser, 'notes kept from the publisher');
    await asUser(browser, IMRG_REVIEWER, (jamie) => addNote(jamie, id, 'Not for the publisher.'));

    await asUser(browser, PUBLISHER, async (publisher) => {
      await publisher.goto(overviewPath(id));
      await expect(publisher.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(publisher.getByRole('heading', { name: "Reviewers' notes" })).toHaveCount(0);
      await expect(publisher.getByRole('heading', { name: 'Your notes' })).toHaveCount(0);
      await expect(publisher.getByText('Not for the publisher.')).toHaveCount(0);
    });
  });
});
