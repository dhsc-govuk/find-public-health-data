import { readdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

import { findSecretsReachingBuilds } from './builds.ts';
import { capture, run } from './exec.ts';
import { findInternalReferences } from './internal.ts';
import { findOperationsPackages } from './operations.ts';
import { collectRouteFiles } from './routes.ts';
import { collectSourcemapSources } from './sourcemaps.ts';
import { extractImportSpecifiers } from './specifiers.ts';
import { findPackagesKeptFromWorker } from './worker.ts';
import { collectDependencyClosure, readWorkspacePackages } from './workspace.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');

/** Every reference to a public app — pnpm filter, dist path, log line — derives from these. */
type PublicApp = { pkg: string; dir: string; bundled: boolean };

const PUBLIC_WEB: PublicApp = { pkg: '@fphd/public-web', dir: 'apps/public-web', bundled: true };
const PUBLIC_API: PublicApp = { pkg: '@fphd/public-api', dir: 'apps/public-api', bundled: false };
const PUBLIC_APPS = [PUBLIC_WEB, PUBLIC_API];

const INTERNAL_WORKER = '@fphd/internal-worker';

/** The apps that serve requests. Only the operations image may change a database. */
const SERVER_APPS: Pick<PublicApp, 'pkg' | 'bundled'>[] = [
  PUBLIC_WEB,
  PUBLIC_API,
  { pkg: '@fphd/internal-web', bundled: true },
  { pkg: '@fphd/internal-api', bundled: false },
  { pkg: INTERNAL_WORKER, bundled: false },
];

type Violation = {
  check: string;
  detail: string;
  references: string[];
};

/** Cheapest check first, so the common failure is reported without waiting for a build. */
async function main(): Promise<void> {
  const violations: Violation[] = [
    ...(await checkImageBuildInputs()),
    ...(await checkDependencyClosures()),
    ...(await checkOperationsClosures()),
    ...(await checkWorkerClosure()),
    ...checkWebRouteTable(),
    ...(await checkApiOutput()),
    ...(await checkWebBundle()),
  ];

  if (violations.length === 0) {
    console.log('\nNothing crossed an artefact boundary.');
    return;
  }

  console.error('\nCrossed an artefact boundary:\n');
  for (const violation of violations) {
    console.error(`  ${violation.check}: ${violation.detail}`);
    for (const reference of violation.references) {
      console.error(`    - ${reference}`);
    }
  }
  process.exitCode = 1;
}

/**
 * Checks workflow YAML only, following a `uses:` into the repository's own composite actions. It
 * refuses the route in, whatever the value looks like; Trivy, in CI, checks the built bytes for the
 * patterns it knows.
 */
async function checkImageBuildInputs(): Promise<Violation[]> {
  console.log('Checking the workflows’ image builds for secrets…');
  const builds = await findSecretsReachingBuilds(repoRoot);
  return builds.map(({ file, job, step, references }) => ({
    check: 'image build inputs',
    detail: `${file} job ${job}, step ${step}`,
    references,
  }));
}

async function checkDependencyClosures(): Promise<Violation[]> {
  console.log('Checking the public apps’ workspace dependency closures…');
  const packages = await readWorkspacePackages(repoRoot);

  return PUBLIC_APPS.flatMap(({ pkg, bundled }) => {
    const references = findInternalReferences(collectDependencyClosure(pkg, packages, { bundled }));
    return references.length === 0
      ? []
      : [{ check: 'dependency closure', detail: pkg, references }];
  });
}

async function checkOperationsClosures(): Promise<Violation[]> {
  console.log('Checking the server apps’ workspace dependency closures for database operations…');
  const packages = await readWorkspacePackages(repoRoot);

  return SERVER_APPS.flatMap(({ pkg, bundled }) => {
    const references = findOperationsPackages(
      collectDependencyClosure(pkg, packages, { bundled }),
      packages,
    );
    return references.length === 0
      ? []
      : [{ check: 'operations closure', detail: pkg, references }];
  });
}

async function checkWorkerClosure(): Promise<Violation[]> {
  console.log(`Checking ${INTERNAL_WORKER}’s workspace dependency closure…`);
  const packages = await readWorkspacePackages(repoRoot);
  const references = findPackagesKeptFromWorker(
    collectDependencyClosure(INTERNAL_WORKER, packages, { bundled: false }),
    packages,
  );
  return references.length === 0
    ? []
    : [{ check: 'worker closure', detail: INTERNAL_WORKER, references }];
}

/**
 * React Router declares route modules as path strings, not imports, so a route pointing at an
 * internal package is invisible to an import linter. The route table names those paths directly,
 * which catches the reference without waiting for a build — and reports it as the path the author
 * wrote rather than as a bundle chunk.
 */
function checkWebRouteTable(): Violation[] {
  console.log(`Checking ${PUBLIC_WEB.pkg}’s route table…`);
  const output = capture(
    'pnpm',
    ['--filter', PUBLIC_WEB.pkg, 'exec', 'react-router', 'routes', '--json'],
    repoRoot,
  );

  const files = collectRouteFiles(output);
  if (files.length === 0) {
    throw new Error(`No route modules were found in the route table:\n${output}`);
  }

  const references = findInternalReferences(files);
  return references.length === 0
    ? []
    : [{ check: 'public-web route table', detail: 'src/routes.ts', references }];
}

async function checkApiOutput(): Promise<Violation[]> {
  console.log(`Building ${PUBLIC_API.pkg}…`);
  run('pnpm', ['--filter', `${PUBLIC_API.pkg}...`, 'run', 'build'], repoRoot);

  const dist = path.join(repoRoot, PUBLIC_API.dir, 'dist');
  const files = await findFiles(dist, '.js');
  if (files.length === 0) {
    throw new Error(`No JavaScript was emitted to ${dist}; the output cannot be inspected.`);
  }

  const violations: Violation[] = [];
  for (const file of files) {
    const specifiers = extractImportSpecifiers(await readFile(file, 'utf8'));
    const references = findInternalReferences(specifiers);
    if (references.length > 0) {
      violations.push({
        check: 'public-api output',
        detail: path.relative(repoRoot, file),
        references,
      });
    }
  }
  return violations;
}

/**
 * The bundle is minified, so module identity survives only in the sourcemaps. `hidden` emits them
 * without the `sourceMappingURL` comment that would otherwise point at them, which is what lets
 * this read the module graph out of the real build and then delete the maps: what remains in
 * `dist/` is byte-identical to a plain `react-router build`.
 */
async function checkWebBundle(): Promise<Violation[]> {
  console.log(`Building ${PUBLIC_WEB.pkg} and its dependencies, with sourcemaps…`);
  run('pnpm', ['--filter', `${PUBLIC_WEB.pkg}^...`, 'run', 'build'], repoRoot);
  run(
    'pnpm',
    [
      '--filter',
      PUBLIC_WEB.pkg,
      'exec',
      'react-router',
      'build',
      '--sourcemapClient',
      'hidden',
      '--sourcemapServer',
      'hidden',
    ],
    repoRoot,
  );

  const dist = path.join(repoRoot, PUBLIC_WEB.dir, 'dist');
  const maps = await findFiles(dist, '.map');
  try {
    if (maps.length === 0) {
      throw new Error(`No sourcemaps were emitted to ${dist}; the bundle cannot be inspected.`);
    }

    const violations: Violation[] = [];
    for (const map of maps) {
      const references = findInternalReferences(
        collectSourcemapSources(await readFile(map, 'utf8'), map),
      );
      if (references.length > 0) {
        violations.push({
          check: 'public-web bundle',
          detail: path.relative(dist, map),
          references,
        });
      }
    }
    return violations;
  } finally {
    await Promise.all(maps.map((map) => unlink(map)));
  }
}

async function findFiles(dir: string, extension: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

await main();
