import { type Browser, expect, type Page } from '@playwright/test';

import { assignReviewers } from './assign-reviewers.ts';
import { submitNewIndicator } from './complete-draft.ts';
import { uniqueIndicatorName } from './create-indicator.ts';
import { IMRG_REVIEWER, PUBLISHER, type SignedInUser } from './sign-in.ts';

/** Runs `act` as `user`, in a browser context of their own. */
export async function asUser<T>(
  browser: Browser,
  user: SignedInUser,
  act: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ storageState: user.storageState });
  try {
    return await act(await context.newPage());
  } finally {
    await context.close();
  }
}

/** A new indicator, submitted by `publisher` and in review with the named reviewers. */
export async function inReview(
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

/** A task the reviewer flags, by its key and its title on the revisions page, with their notes. */
export interface FlaggedTask {
  key: string;
  title: string;
  notes: string;
}

/** A review response as the reviewer gives it through the response pages. */
export type ReviewResponseChoice =
  | { kind: 'approved' }
  | {
      kind: 'pre_imrg_feedback' | 'minor_revisions' | 'major_revisions';
      flags?: readonly FlaggedTask[];
      clarification?: string;
    };

/** Today in the UK, as the date page takes it. */
function ukToday() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((each) => each.type === type)?.value ?? '';
  return { day: part('day'), month: part('month'), year: part('year') };
}

/**
 * Responds to the round in review as `reviewer`, in a browser context of their own, through the
 * response pages, landing on the overview. For tests whose user is the publisher.
 */
export async function respondToReview(
  browser: Browser,
  id: string,
  response: ReviewResponseChoice,
  reviewer: SignedInUser = IMRG_REVIEWER,
) {
  await asUser(browser, reviewer, async (page) => {
    await page.goto(`/dashboard/indicators/${id}`);
    await page.getByRole('button', { name: 'Submit review response' }).click();
    const decision = response.kind !== 'pre_imrg_feedback';
    await page.getByLabel(decision ? 'IMRG review decision' : 'Pre-IMRG meeting feedback').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    if (decision) {
      const { day, month, year } = ukToday();
      await page.getByLabel('Day').fill(day);
      await page.getByLabel('Month').fill(month);
      await page.getByLabel('Year').fill(year);
      await page.getByRole('button', { name: 'Continue' }).click();
      if (response.kind === 'approved') {
        await page.getByLabel('Yes', { exact: true }).check();
      } else {
        await page.getByLabel('No', { exact: true }).check();
        await page
          .getByLabel(
            response.kind === 'minor_revisions'
              ? 'Minor revisions needed'
              : 'Major revisions needed',
          )
          .check();
      }
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    if (response.kind !== 'approved') {
      if (response.clarification !== undefined) {
        await page.getByLabel('High-level clarification request').check();
        await page
          .getByLabel('What are you requesting clarification about?')
          .fill(response.clarification);
      }
      for (const { key, title, notes } of response.flags ?? []) {
        await page.getByLabel(title, { exact: true }).check();
        await page.locator(`textarea[name="flags.${key}"]`).fill(notes);
      }
      await page.getByRole('button', { name: 'Continue' }).click();
    }

    await expect(page).toHaveURL(`/dashboard/indicators/${id}`);
  });
}
