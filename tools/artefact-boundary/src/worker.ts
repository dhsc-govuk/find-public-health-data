import type { WorkspacePackage } from './workspace.ts';

/**
 * Packages that must not be in the internal worker's image: the internal API's routes and upload
 * handling (`@fphd/internal-api-features`), the API server (`@fphd/api-server`) and the session
 * and sign-in code (`@fphd/auth`). The worker publishes through `@fphd/internal-workflow` alone.
 */
const KEPT_FROM_WORKER = ['@fphd/api-server', '@fphd/auth', '@fphd/internal-api-features'];

/**
 * Returns the packages in the worker's dependency closure that the worker must not ship, sorted.
 * It throws if any of those package names is missing from the workspace. Otherwise, after one of
 * them was renamed, the check would find nothing and pass without checking anything.
 */
export function findPackagesKeptFromWorker(
  closure: readonly string[],
  packages: ReadonlyMap<string, WorkspacePackage>,
): string[] {
  for (const name of KEPT_FROM_WORKER) {
    if (!packages.has(name)) {
      throw new Error(`${name} is not a workspace package; the worker check cannot run.`);
    }
  }
  return [...new Set(closure.filter((name) => KEPT_FROM_WORKER.includes(name)))].sort();
}
