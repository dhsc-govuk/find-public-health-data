import type { Logger } from '@fphd/logger';

/** Something an API serves data from, tried once at start-up. */
export interface Dependency {
  name: string;
  check: () => Promise<unknown>;
}

/** Logs each dependency that fails its check, and never rejects: the API serves on regardless. */
export async function checkDependencies(
  logger: Logger,
  dependencies: readonly Dependency[],
): Promise<void> {
  await Promise.all(
    dependencies.map(async ({ name, check }) => {
      try {
        await check();
      } catch (error) {
        logger.error({ dependency: name, err: error }, 'Dependency unreachable at start-up');
      }
    }),
  );
}
