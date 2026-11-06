// End-to-end tests. Specs drive the running apps over HTTP against the base URLs below —
// they never import app code, and nothing here starts the stack: locally that is `pnpm dev`
// (or any dev:mixed split) in another terminal, in CI the compose containers.
//
// Specs run in parallel workers against one shared seeded database, which makes one rule
// load-bearing: a spec never mutates data another spec reads. A test of a write flow creates
// its own rows and asserts on those; a flow that genuinely cannot own its data gets a serial
// project then, not speculatively now.
import { defineConfig, devices } from '@playwright/test';

import { INVITEE_STORAGE_STATE } from './tests/support/private-beta.ts';

// Default to 127.0.0.1: the apps listen on IPv4 and the request client tries ::1 first.
const internalUse = {
  ...devices['Desktop Chrome'],
  baseURL: process.env.INTERNAL_WEB_URL ?? 'http://127.0.0.1:3001',
};
const publicUse = {
  ...devices['Desktop Chrome'],
  baseURL: process.env.PUBLIC_WEB_URL ?? 'http://127.0.0.1:3000',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // A flaky test is a bug in the test; retries would teach us to live with it.
  retries: 0,
  // Playwright's default; on the 4-core CI runner, 4 workers per shard measured no faster than 2.
  workers: '50%',
  // A stray .only must not quietly shrink the suite where nobody is watching.
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    // Signs the invitee in to the private beta once a run, saving the access the public specs use.
    {
      name: 'public sign-in',
      testDir: './tests/public',
      testMatch: 'private-beta.setup.ts',
      use: publicUse,
    },
    {
      name: 'public',
      testDir: './tests/public',
      dependencies: ['public sign-in'],
      use: { ...publicUse, storageState: INVITEE_STORAGE_STATE },
    },
    // Signs each internal user in once a run, saving the sessions the internal specs start from.
    {
      name: 'internal sign-in',
      testDir: './tests/internal',
      testMatch: 'sign-in.setup.ts',
      use: internalUse,
    },
    {
      name: 'internal',
      testDir: './tests/internal',
      dependencies: ['internal sign-in'],
      use: internalUse,
    },
  ],
});
