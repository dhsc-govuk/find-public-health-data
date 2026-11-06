import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';

test('answers an unknown path with the not-found page', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});

test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
  await page.goto('/no-such-page');
  await expectNoAccessibilityViolations(page, testInfo);
});

test('has no sign-in: the fake sign-in paths are only the not-found page', async ({ request }) => {
  const responses = await Promise.all([
    request.post('/auth/sign-in', { form: { userId: 'anyone' }, maxRedirects: 0 }),
    request.get('/auth/callback?code=anything', { maxRedirects: 0 }),
    request.post('/auth/sign-out', { maxRedirects: 0 }),
  ]);

  // The not-found page has no action, so React Router answers a POST to any unknown path 405.
  expect(responses.map((response) => response.status())).toEqual([405, 404, 405]);
  expect(responses.map((response) => response.headers()['set-cookie'])).toEqual([
    undefined,
    undefined,
    undefined,
  ]);
});
