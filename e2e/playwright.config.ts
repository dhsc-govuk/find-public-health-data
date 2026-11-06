// End-to-end tests. Specs drive the running apps over HTTP against the base URLs below —
// they never import app code, and nothing here starts the stack: locally that is `pnpm dev`
// (or any dev:mixed split) in another terminal, in CI the compose containers.
//
// Specs run in parallel workers against one shared seeded database, which makes one rule
// load-bearing: a spec never mutates data another spec reads. A test of a write flow creates
// its own rows and asserts on those; a flow that genuinely cannot own its data gets a serial
// project, which exists only when `E2E_PUBLISHING=1`, as `test:e2e:publishing` sets it, so neither
// `test:e2e` nor a bare `playwright test` runs it.
import { defineConfig, devices } from '@playwright/test';

import { INTERNAL_WEB_URL, PUBLIC_WEB_URL } from './tests/support/web-urls.ts';

const internalUse = { ...devices['Desktop Chrome'], baseURL: INTERNAL_WEB_URL };

// Publishing changes what other specs read (the public search total, a topic's indicators), so
// this project runs on its own, one test at a time, once the others have finished.
const publishing = {
  name: 'publishing',
  testDir: './tests/publishing',
  dependencies: ['internal sign-in'],
  fullyParallel: false,
  workers: 1,
  use: internalUse,
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
    {
      name: 'public',
      testDir: './tests/public',
      use: { ...devices['Desktop Chrome'], baseURL: PUBLIC_WEB_URL },
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
    ...(process.env.E2E_PUBLISHING === '1' ? [publishing] : []),
  ],
});
