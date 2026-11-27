import { defineConfig } from 'vitest/config';
import type { TestModule } from 'vitest/node';
import type { Reporter } from 'vitest/reporters';

/**
 * Prints, for each test file, when it started and ended relative to the start of the run, which
 * worker slot ran it, and how its time split between preparing the worker, importing the file
 * (collect), and running hooks and tests.
 */
function fileTimingReporter(): Reporter {
  let runStartedAt = 0;
  const startedAt = new Map<string, number>();
  const lines: string[] = [];
  return {
    onTestRunStart() {
      runStartedAt = performance.now();
    },
    onTestModuleStart(module: TestModule) {
      startedAt.set(module.moduleId, performance.now());
    },
    onTestModuleEnd(module: TestModule) {
      const end = performance.now() - runStartedAt;
      const start = (startedAt.get(module.moduleId) ?? runStartedAt) - runStartedAt;
      const diagnostic = module.diagnostic();
      const seconds = (ms: number) => (ms / 1000).toFixed(1);
      lines.push(
        [
          `[file-timing] start_s=${seconds(start)} end_s=${seconds(end)}`,
          `slot=${diagnostic.concurrencyId}`,
          `prepare_s=${seconds(diagnostic.prepareDuration)}`,
          `environment_s=${seconds(diagnostic.environmentSetupDuration)}`,
          `setup_s=${seconds(diagnostic.setupDuration)}`,
          `collect_s=${seconds(diagnostic.collectDuration)}`,
          `tests_s=${seconds(diagnostic.duration)}`,
          `${module.project.name} ${module.relativeModuleId}`,
        ].join(' '),
      );
    },
    onTestRunEnd() {
      console.log(['', '[file-timing] per file, in order of finishing', ...lines].join('\n'));
    },
  };
}

export default defineConfig({
  test: {
    // Runs once per vitest invocation; a no-op unless INTEGRATION_DB=1 (set by
    // test:integration), where it builds the template databases.
    globalSetup: ['./vitest.global-setup.ts'],
    // A projects glob rejects any non-config file it matches, and both workspace directories hold
    // shared tsconfigs and `apps/web-config.ts` alongside the package directories.
    projects: ['apps/*', 'packages/*', 'tools/*', '!**/*.json', '!**/*.ts'],
    reporters: ['default', fileTimingReporter()],
  },
});
