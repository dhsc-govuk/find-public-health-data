import { setTimeout as sleep } from 'node:timers/promises';

import type { Logger } from '@fphd/logger';

/** Something an API serves data from, checked from start-up until it answers. */
export interface Dependency {
  name: string;
  check: () => Promise<unknown>;
}

export interface CheckDependenciesOptions {
  retryAfterMs?: number;
}

/**
 * Logs each failed check and retries it until it passes, so the alert on the line stays fired while
 * the dependency is down. Never rejects: the API serves on regardless.
 */
export async function checkDependencies(
  logger: Logger,
  dependencies: readonly Dependency[],
  { retryAfterMs = 60_000 }: CheckDependenciesOptions = {},
): Promise<void> {
  await Promise.all(
    dependencies.map((dependency) => checkUntilReachable(logger, dependency, retryAfterMs)),
  );
}

async function checkUntilReachable(
  logger: Logger,
  { name, check }: Dependency,
  retryAfterMs: number,
): Promise<void> {
  for (let failures = 0; ; failures += 1) {
    try {
      await check();
      if (failures > 0) logger.info({ dependency: name, failures }, 'Dependency reachable');
      return;
    } catch (error) {
      logger.error({ dependency: name, err: error }, 'Dependency unreachable at start-up');
    }
    // Unref'd, so a retry pending at shutdown does not hold the process open.
    await sleep(retryAfterMs, undefined, { ref: false });
  }
}
