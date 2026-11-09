import { setTimeout as sleep } from 'node:timers/promises';

import type { Logger } from '@fphd/logger';

/**
 * A service the server needs, such as its database. `checkDependencies` checks it at start-up and
 * keeps retrying until it answers.
 */
export interface Dependency {
  name: string;
  check: () => Promise<unknown>;
}

export interface CheckDependenciesOptions {
  retryAfterMs?: number;
}

/**
 * Checks each dependency, logging every failed check and retrying it until it passes. The error is
 * logged again on each retry, so an alert on "Dependency unreachable at start-up" keeps firing for
 * as long as the dependency is down. The returned promise never rejects, and the server goes on
 * serving requests while a dependency is down.
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
