import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { followShownLink, INVITEE_EMAIL, NO_ACCESS, requestLink } from '../support/private-beta.ts';

/** The return address as the private beta carries it: hex, which DAC's App Gateway lets through. */
function hex(path: string) {
  return Buffer.from(path).toString('hex');
}

test.describe('without access', () => {
  test.use({ storageState: NO_ACCESS });

  test('sends a visitor to the private beta page, and the link back to where they were going', async ({
    page,
  }) => {
    await page.goto('/topics?page=1');
    await expect(page).toHaveURL(`/private-beta?returnTo=${hex('/topics?page=1')}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in to the private beta' }),
    ).toBeVisible();

    await requestLink(page, INVITEE_EMAIL);
    await followShownLink(page);

    await expect(page).toHaveURL('/topics?page=1');
    await expect(page.getByRole('heading', { level: 1, name: 'Topics' })).toBeVisible();
  });

  // DAC's App Gateway refuses a query value holding many characters such as -, = and &, which a
  // filtered search's address is full of, so the return address goes as hex.
  test('returns a visitor to a filtered search, carrying it in a form the gateway lets through', async ({
    page,
  }) => {
    const search =
      '/search?q=smoking&t=mental-health-and-wellbeing&it=indicator-type-risk-factor&ls=life-stage-working-age-adults';
    await page.goto(search);
    await expect(page).toHaveURL(`/private-beta?returnTo=${hex(search)}`);

    await requestLink(page, INVITEE_EMAIL);
    const link = new URL(
      (await page.getByRole('link', { name: 'Sign in', exact: true }).getAttribute('href')) ?? '',
    );
    expect(link.searchParams.get('returnTo')).toMatch(/^[0-9a-f]+$/);
    await followShownLink(page);

    await expect(page).toHaveURL(search);
  });

  test('answers an address that was not invited the same way, with no link', async ({ page }) => {
    await page.goto('/private-beta');
    await requestLink(page, 'not-invited@example.com');

    await expect(page.getByText('not-invited@example.com')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
  });

  // The link loads the page's data with a request that lists its routes' ids in _routes. DAC's App
  // Gateway refuses a query value containing ../, the word src, or 12 or more characters such as -,
  // and such a request never reaches the app there.
  test('offers another link from the check your email page', async ({ page }) => {
    await page.goto(`/private-beta?returnTo=${hex('/topics')}`);
    await requestLink(page, INVITEE_EMAIL);
    const dataRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/private-beta.data',
    );

    await page.getByRole('link', { name: 'ask for another link' }).click();

    const routes = new URL((await dataRequest).url()).searchParams.get('_routes') ?? '';
    expect(routes).not.toMatch(/\.\.\/|\bsrc\b|-/);
    await expect(page).toHaveURL(`/private-beta?returnTo=${hex('/topics')}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in to the private beta' }),
    ).toBeVisible();
  });

  test('asks for an address in the correct format', async ({ page }) => {
    await page.goto('/private-beta');
    await page.getByLabel('Email address').fill('developer');
    await page.getByRole('button', { name: 'Send sign-in link' }).click();

    await expect(page).toHaveTitle(/^Error: /);
    await expect(page.getByRole('alert')).toContainText(
      'Enter an email address in the correct format, like name@example.com',
    );
  });

  test('sends a link that is not valid back to ask for another', async ({ page }) => {
    await page.goto(`/private-beta/sign-in?token=not-a-token&returnTo=${hex('/topics')}`);

    await expect(page).toHaveURL(`/private-beta?link=rejected&returnTo=${hex('/topics')}`);
    await expect(page.getByText('That sign-in link has expired or is not valid.')).toBeVisible();
  });

  test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
    await page.goto('/private-beta?link=rejected');
    await expectNoAccessibilityViolations(page, testInfo);

    await page.getByRole('button', { name: 'Send sign-in link' }).click();
    await expect(page.getByRole('alert')).toContainText('Enter your email address');
    await expectNoAccessibilityViolations(page, testInfo);

    await requestLink(page, INVITEE_EMAIL);
    await expectNoAccessibilityViolations(page, testInfo);
  });
});
