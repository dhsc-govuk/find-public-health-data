import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { capture } from './exec.ts';
import { isPageModule } from './modules.ts';
import { collectRoutes } from './routes.ts';
import {
  type AppSpecs,
  type ClassifiedRoute,
  findSpecsWithoutScan,
  findStaleEntries,
  findUncoveredRoutes,
} from './specs.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const specsRoot = path.join(repoRoot, 'e2e', 'tests');

/** A web app, its React Router app directory, and the Playwright project directory holding its specs. */
type WebApp = { pkg: string; appDir: string; specDir: string };

const WEB_APPS: WebApp[] = [
  { pkg: '@fphd/public-web', appDir: 'apps/public-web/src', specDir: 'public' },
  { pkg: '@fphd/internal-web', appDir: 'apps/internal-web/src', specDir: 'internal' },
];

async function main(): Promise<void> {
  const problems: string[] = [];

  // Every app is read before any is checked: a shared route may be covered by another app's spec.
  const read: Array<{ app: WebApp } & AppSpecs> = [];
  for (const app of WEB_APPS) {
    console.log(`Reading ${app.pkg}’s routes and e2e/tests/${app.specDir}…`);
    read.push({ app, routes: await readRoutes(app), specs: await listSpecs(app.specDir) });
  }

  for (const { app, routes, specs } of read) {
    const others = read.filter((other) => other.app !== app);

    for (const { route, problem } of findUncoveredRoutes({ routes, specs }, others)) {
      problems.push(`${app.pkg} ${route} ${problem}`);
    }

    const sources = await Promise.all(
      specs.map(async (name) => ({
        name,
        source: await readFile(path.join(specsRoot, app.specDir, name), 'utf8'),
      })),
    );
    for (const name of findSpecsWithoutScan(sources, routes)) {
      problems.push(`e2e/tests/${app.specDir}/${name} never calls expectNoAccessibilityViolations`);
    }
  }

  const declared = read.flatMap(({ routes }) => routes.map((route) => route.path));
  for (const route of findStaleEntries(declared)) {
    problems.push(`tools/e2e-coverage/src/specs.ts lists ${route}, which neither app declares`);
  }

  if (problems.length === 0) {
    console.log(
      '\nEvery page route has a spec, and every spec scans for accessibility violations.',
    );
    return;
  }

  console.error('\nThe e2e coverage checks failed:\n');
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exitCode = 1;
}

/** The app's routes, each classified by reading the module React Router would render it with. */
async function readRoutes(app: WebApp): Promise<ClassifiedRoute[]> {
  const output = capture(
    'pnpm',
    ['--filter', app.pkg, 'exec', 'react-router', 'routes', '--json'],
    repoRoot,
  );
  const routes = collectRoutes(output);
  if (routes.length === 0) {
    throw new Error(`No routes were found in ${app.pkg}’s route table:\n${output}`);
  }
  return Promise.all(
    routes.map(async ({ path: routePath, file }) => {
      const module = path.join(app.appDir, file);
      return {
        path: routePath,
        module,
        page: isPageModule(await readFile(path.join(repoRoot, module), 'utf8')),
      };
    }),
  );
}

/** Spec files under one Playwright project directory, relative to it. */
async function listSpecs(specDir: string): Promise<string[]> {
  const dir = path.join(specsRoot, specDir);
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const specs = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
  if (specs.length === 0) {
    throw new Error(`No specs were found under ${dir}; nothing can be checked.`);
  }
  return specs;
}

await main();
