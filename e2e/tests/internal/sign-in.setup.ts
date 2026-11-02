import { test as setup } from '@playwright/test';

import {
  ADMIN,
  IMRG_MANAGER,
  IMRG_REVIEWER,
  PUBLISHER,
  PUBLISHER_AND_REVIEWER,
  signInAs,
  TEAM_B_PUBLISHER,
  TEAMS_A_AND_B_PUBLISHER,
} from '../support/sign-in.ts';

for (const user of [
  PUBLISHER,
  TEAM_B_PUBLISHER,
  TEAMS_A_AND_B_PUBLISHER,
  IMRG_MANAGER,
  IMRG_REVIEWER,
  PUBLISHER_AND_REVIEWER,
  ADMIN,
]) {
  setup(`signs in as ${user.name}`, async ({ page }) => {
    await signInAs(page, user.name);
    await page.context().storageState({ path: user.storageState });
  });
}
