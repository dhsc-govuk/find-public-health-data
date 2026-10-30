import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import { ADMIN } from '../support/sign-in.ts';

// Every write here creates its own topic under a slug no other spec or run can hold, so the
// shared seeded database is only ever added to and the seeded topics stay as other specs expect.
function uniqueSlug() {
  return `e2e-${test.info().parallelIndex}-${Date.now().toString(36)}`;
}

async function createTopic(page: Page, values: { title: string; slug: string }) {
  await page.goto('/manage/topics/new');
  await page.getByLabel('Topic name').fill(values.title);
  await page.getByLabel('Slug').fill(values.slug);
  await page.getByLabel('Description').fill(`About ${values.title}.`);
  await page.getByRole('button', { name: 'Create topic' }).click();
  await expect(page).toHaveURL(/\/manage\/topics\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Topic created')).toBeVisible();
}

// Seeded indicators link to it, so it can never be deleted and no spec here changes it.
const LINKED_TOPIC = 'Diabetes';

async function openLinkedTopic(page: Page) {
  await page.goto('/manage/topics');
  await page.getByRole('link', { name: LINKED_TOPIC, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Edit topic' })).toBeVisible();
}

test.use({ storageState: ADMIN.storageState });

test.describe('the topic list', () => {
  test('lists topics for an admin', async ({ page }) => {
    await page.goto('/manage/topics');
    await expect(page.getByRole('heading', { level: 1, name: 'Manage topics' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cancer', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a topic' })).toBeVisible();
  });

  test('opens a topic for editing', async ({ page }) => {
    await page.goto('/manage/topics');
    await page.getByRole('link', { name: 'Cancer', exact: true }).click();

    await expect(page).toHaveURL(/\/manage\/topics\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Edit topic' })).toBeVisible();
    await expect(page.getByLabel('Slug')).toHaveValue('cancer');
  });

  test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
    await page.goto('/manage/topics');
    await expectNoAccessibilityViolations(page, testInfo);
  });
});

test.describe('adding a topic', () => {
  test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
    await page.goto('/manage/topics/new');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('rejects an empty submission, naming every field', async ({ page }) => {
    await page.goto('/manage/topics/new');
    await page.getByRole('button', { name: 'Create topic' }).click();

    await expect(page).toHaveURL('/manage/topics/new');
    await expect(page).toHaveTitle(/^Error: /);
    const summary = page.getByRole('alert');
    await expect(summary.getByRole('link')).toHaveText([
      'Enter a topic name',
      'Enter a slug',
      'Enter a description',
    ]);

    await expectErrorSummaryReady(page);
    await summary.getByRole('link', { name: 'Enter a slug' }).click();
    await expect(page.getByLabel('Slug')).toBeFocused();
  });

  test('rejects a malformed slug and keeps what was typed', async ({ page }) => {
    await page.goto('/manage/topics/new');
    await page.getByLabel('Topic name').fill('Bad slug');
    await page.getByLabel('Slug').fill('Not A Slug');
    await page.getByLabel('Description').fill('A topic whose slug has spaces.');
    await page.getByRole('button', { name: 'Create topic' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'Slug must be lowercase letters or numbers, separated by hyphens',
    );
    await expect(page).toHaveTitle(/^Error: /);
    await expectErrorSummaryReady(page);
    await page
      .getByRole('alert')
      .getByRole('link', {
        name: 'Slug must be lowercase letters or numbers, separated by hyphens',
      })
      .click();
    await expect(page.getByLabel('Slug')).toBeFocused();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Topic name')).toHaveValue('Bad slug');
    await expect(page.getByLabel('Slug')).toHaveValue('Not A Slug');
    await expect(page.getByLabel('Description')).toHaveValue('A topic whose slug has spaces.');
  });

  test('rejects a slug another topic already uses', async ({ page }) => {
    await page.goto('/manage/topics/new');
    await page.getByLabel('Topic name').fill('Another cancer');
    await page.getByLabel('Slug').fill('cancer');
    await page.getByLabel('Description').fill('Duplicates the seeded topic.');
    await page.getByRole('button', { name: 'Create topic' }).click();

    await expect(page).toHaveURL('/manage/topics/new');
    await expect(page.getByRole('alert')).toContainText('This slug is already used');
    await expect(page).toHaveTitle(/^Error: /);
    await expect(page.getByLabel('Slug')).toHaveValue('cancer');
  });

  test('has no WCAG 2.2 AA violations when the submission is rejected', async ({
    page,
  }, testInfo) => {
    await page.goto('/manage/topics/new');
    await page.getByRole('button', { name: 'Create topic' }).click();
    await expect(page.getByRole('alert')).toContainText('Enter a topic name');
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('creates the topic and lands on its edit page', async ({ page }) => {
    const slug = uniqueSlug();

    await createTopic(page, { title: `Created ${slug}`, slug });

    await expect(page.getByRole('heading', { level: 1, name: 'Edit topic' })).toBeVisible();
    await expect(page.getByLabel('Slug')).toHaveValue(slug);
  });

  test('shows the confirmation once', async ({ page }) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Once ${slug}`, slug });

    await page.reload();

    await expect(page.getByRole('heading', { level: 1, name: 'Edit topic' })).toBeVisible();
    await expect(page.getByText('Topic created')).toHaveCount(0);
  });

  test('lists the new topic and publishes it', async ({ page }) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Listed ${slug}`, slug });

    await page.getByRole('link', { name: 'Return to topic list' }).click();
    await expect(page).toHaveURL('/manage/topics');
    await expect(page.getByRole('link', { name: `Listed ${slug}` })).toBeVisible();

    await page.goto(`/topics/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: `Listed ${slug}` })).toBeVisible();
    await expect(page.getByText(`About Listed ${slug}.`)).toBeVisible();
  });
});

test.describe('editing a topic', () => {
  test('saves a change and reports it', async ({ page }) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Edit ${slug}`, slug });

    await page.getByLabel('Topic name').fill(`Edited ${slug}`);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Topic updated')).toBeVisible();
    await expect(page.getByLabel('Topic name')).toHaveValue(`Edited ${slug}`);
  });

  test('reports a save that changes nothing', async ({ page }) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Same ${slug}`, slug });

    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('No changes were made')).toBeVisible();
  });

  test('changes the slug and moves the public page with it', async ({ page }) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Moved ${slug}`, slug });
    const editUrl = page.url();

    await page.getByLabel('Slug').fill(`${slug}-moved`);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(editUrl);
    await expect(page.getByText('Topic updated')).toBeVisible();
    await expect(page.getByLabel('Slug')).toHaveValue(`${slug}-moved`);

    await page.goto(`/topics/${slug}-moved`);
    await expect(page.getByRole('heading', { level: 1, name: `Moved ${slug}` })).toBeVisible();
    const response = await page.goto(`/topics/${slug}`);
    expect(response?.status()).toBe(404);
  });

  test('rejects a slug another topic already uses', async ({ page }) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Clash ${slug}`, slug });

    await page.getByLabel('Slug').fill('cancer');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('alert')).toContainText('This slug is already used');
    await expect(page).toHaveTitle(/^Error: /);
    await expect(page.getByLabel('Slug')).toHaveValue('cancer');
  });

  test('refuses a save of a topic someone else changed since, keeping what was typed', async ({
    page,
  }) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Shared ${slug}`, slug });
    const editUrl = page.url();
    const other = await page.context().newPage();
    await other.goto(editUrl);
    await other.getByLabel('Topic name').fill(`Theirs ${slug}`);
    await other.getByRole('button', { name: 'Save' }).click();
    await expect(other.getByText('Topic updated')).toBeVisible();

    await page.getByLabel('Topic name').fill(`Mine ${slug}`);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'Someone else has changed this topic since you opened this page.',
    );
    await expect(page.getByLabel('Topic name')).toHaveValue(`Mine ${slug}`);

    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Topic updated')).toBeVisible();
    await expect(page.getByLabel('Topic name')).toHaveValue(`Mine ${slug}`);
  });

  test('answers a topic that does not exist with the not-found page', async ({ page }) => {
    for (const path of [
      '/manage/topics/not-an-id',
      '/manage/topics/00000000-0000-7000-8000-000000000000',
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    }
  });

  test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Scan ${slug}`, slug });
    await expectNoAccessibilityViolations(page, testInfo);
  });
});

test.describe('deleting a topic', () => {
  test('asks for confirmation, then removes the topic from the list', async ({ page }) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Delete ${slug}`, slug });

    await page.getByRole('link', { name: 'Delete topic' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Delete topic' })).toBeVisible();
    await expect(page.getByText(`Are you sure you want to delete Delete ${slug}?`)).toBeVisible();
    await page.getByRole('button', { name: 'Delete topic' }).click();

    await expect(page).toHaveURL('/manage/topics');
    await expect(page.getByText('Topic deleted')).toBeVisible();
    await expect(page.getByRole('link', { name: `Delete ${slug}` })).toHaveCount(0);

    const response = await page.goto(`/topics/${slug}`);
    expect(response?.status()).toBe(404);
  });

  test('can be cancelled', async ({ page }) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Keep ${slug}`, slug });
    const editUrl = page.url();

    await page.getByRole('link', { name: 'Delete topic' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Delete topic' })).toBeVisible();
    await page.getByRole('link', { name: 'Cancel' }).click();

    await expect(page).toHaveURL(editUrl);
    await expect(page.getByLabel('Topic name')).toHaveValue(`Keep ${slug}`);
  });

  test('shows the Delete topic link when no indicators link to the topic', async ({ page }) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Unlinked ${slug}`, slug });

    await expect(page.getByText('No indicators are linked to this topic.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Delete topic' })).toBeVisible();
  });

  test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
    const slug = uniqueSlug();
    await createTopic(page, { title: `Scan delete ${slug}`, slug });
    await page.getByRole('link', { name: 'Delete topic' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Delete topic' })).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });
});

test.describe('a topic that indicators link to', () => {
  test('shows the number of linked indicators on the edit page', async ({ page }) => {
    await openLinkedTopic(page);

    await expect(page.getByText(/^\d+ indicators? (is|are) linked to this topic\./)).toBeVisible();
  });

  test('has no Delete topic link on the edit page, and says why', async ({ page }) => {
    await openLinkedTopic(page);

    await expect(
      page.getByText('You cannot delete a topic while indicators are linked to it.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Delete topic' })).toHaveCount(0);
  });

  test('explains on the delete page why it cannot be deleted', async ({ page }) => {
    await openLinkedTopic(page);

    await page.goto(`${page.url()}/delete`);

    await expect(page.getByRole('heading', { level: 1, name: 'Delete topic' })).toBeVisible();
    await expect(
      page.getByText(
        new RegExp(`^You cannot delete ${LINKED_TOPIC} because \\d+ indicators? (is|are) linked`),
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete topic' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Return to edit topic' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Edit topic' })).toBeVisible();
  });

  test('has no WCAG 2.2 AA violations on the edit page', async ({ page }, testInfo) => {
    await openLinkedTopic(page);
    await expectNoAccessibilityViolations(page, testInfo);
  });

  test('has no WCAG 2.2 AA violations on the delete page', async ({ page }, testInfo) => {
    await openLinkedTopic(page);
    await page.goto(`${page.url()}/delete`);
    await expect(page.getByText(/^You cannot delete/)).toBeVisible();
    await expectNoAccessibilityViolations(page, testInfo);
  });
});
