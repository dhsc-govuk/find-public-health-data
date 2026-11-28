import { defineConfig } from 'vitest/config';

import { SlowestFirstSequencer } from './vitest.sequencer.ts';

export default defineConfig({
  test: {
    // Runs once per vitest invocation; a no-op unless INTEGRATION_DB=1 (set by
    // test:integration), where it builds the template databases.
    globalSetup: ['./vitest.global-setup.ts'],
    // A projects glob rejects any non-config file it matches, and both workspace directories hold
    // shared tsconfigs and `apps/web-config.ts` alongside the package directories.
    projects: ['apps/*', 'packages/*', 'tools/*', '!**/*.json', '!**/*.ts'],
    sequence: { sequencer: SlowestFirstSequencer },
  },
});
