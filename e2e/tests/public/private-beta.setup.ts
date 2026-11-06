import { test as setup } from '@playwright/test';

import {
  followShownLink,
  INVITEE_EMAIL,
  INVITEE_STORAGE_STATE,
  requestLink,
} from '../support/private-beta.ts';

setup('signs in to the private beta as the invitee', async ({ page }) => {
  await page.goto('/private-beta');
  await requestLink(page, INVITEE_EMAIL);
  await followShownLink(page);
  await page.context().storageState({ path: INVITEE_STORAGE_STATE });
});
