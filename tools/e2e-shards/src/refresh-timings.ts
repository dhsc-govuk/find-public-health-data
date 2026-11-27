// Rewrites e2e/shard-timings.json from one or more Playwright JSON reports, such as a local
// `pnpm test:e2e` run with the JSON reporter, or the test-timings artifacts of every shard in one
// CI run. Paths are relative to the directory the command was run from.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { JSONReport } from '@playwright/test/reporter';

import { timingsFromReports } from './report.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const timingsFile = path.join(repoRoot, 'e2e', 'shard-timings.json');

async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('Name the Playwright JSON report or reports to read the timings from.');
    process.exitCode = 1;
    return;
  }
  // pnpm runs the script from this package's directory and keeps the caller's in INIT_CWD.
  const from = process.env.INIT_CWD ?? process.cwd();
  const reports = await Promise.all(
    paths.map(
      async (report) =>
        JSON.parse(await readFile(path.resolve(from, report), 'utf8')) as JSONReport,
    ),
  );
  const timings = timingsFromReports(reports);
  await writeFile(timingsFile, `${JSON.stringify(timings, null, 2)}\n`);
  console.log(`Wrote the timings of ${Object.keys(timings).length} spec files to ${timingsFile}.`);
}

await main();
