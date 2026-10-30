import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { topicPageTests } from '../support/topic-page.ts';

test('shows a topic', async ({ page }) => {
  await page.goto('/topics/health-behaviours');

  await expect(page.getByRole('heading', { level: 1, name: 'Health behaviours' })).toBeVisible();
  await expect(page.getByText('Everyday behaviours that affect health')).toBeVisible();
});

test('answers a topic that does not exist with the not-found page', async ({ page }) => {
  const response = await page.goto('/topics/no-such-topic');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await page.goto('/topics/health-behaviours');

  await expectNoAccessibilityViolations(page, testInfo);
});

topicPageTests();
