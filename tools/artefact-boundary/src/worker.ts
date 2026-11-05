import type { WorkspacePackage } from './workspace.ts';

/**
 * Packages the internal worker must not ship: the internal API's routes and uploads, the API
 * server and the sign-in code. It publishes through `@fphd/internal-workflow` alone.
 */
const KEPT_FROM_WORKER = ['@fphd/api-server', '@fphd/auth', '@fphd/internal-api-features'];

/**
 * A name missing from the workspace throws rather than matching nothing: after a rename, an empty
 * result is indistinguishable from a clean one, so the check would silently stop checking.
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
