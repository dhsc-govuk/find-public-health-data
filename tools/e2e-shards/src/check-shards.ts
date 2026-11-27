// Checks that ci.yml's e2e shards run every test of `pnpm test:e2e` exactly once, and that each
// shard runs the spec files e2e/shard-timings.json gives it. Only lists the tests, so it needs
// neither a browser nor the stack. The listings go through the Playwright config's own reporters,
// as CI's runs do, so a config that stops loading the shard-by-time reporter fails here.
// `--no-deps` leaves out the sign-in setup projects, which every shard runs in full.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { JSONReport } from '@playwright/test/reporter';

import {
  findMisplacedFiles,
  findShardProblems,
  findUnmatchedTimings,
  readShardTotal,
} from './check.ts';
import { packFiles, type Timings } from './pack.ts';
import { type ReportedTest, reportedTests } from './report.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');

async function main(): Promise<void> {
  const total = readShardTotal(
    await readFile(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8'),
  );
  const timings = JSON.parse(
    await readFile(path.join(repoRoot, 'e2e', 'shard-timings.json'), 'utf8'),
  ) as Timings;
  const dir = await mkdtemp(path.join(tmpdir(), 'e2e-shards-'));
  try {
    const suite = await listTests(dir, 'suite', []);
    if (suite.length === 0) {
      throw new Error('`pnpm test:e2e --list` found no tests; nothing can be checked.');
    }
    const shards: ReportedTest[][] = [];
    for (let current = 1; current <= total; current++) {
      shards.push(await listTests(dir, `shard-${current}`, [`--shard=${current}/${total}`]));
    }

    const expected = packFiles(
      suite.map((test) => test.file),
      timings,
      total,
    );
    const problems = [
      ...findUnmatchedTimings(
        suite.map((test) => test.file),
        timings,
      ),
      ...findShardProblems(suite, shards),
      ...findMisplacedFiles(expected, shards),
    ];
    if (problems.length === 0) {
      const sizes = shards.map((tests, index) => `${index + 1}/${total}: ${tests.length}`);
      console.log(`Each of the ${suite.length} tests runs in one shard (${sizes.join(', ')}).`);
      return;
    }
    console.error('\nThe e2e shards do not divide the suite as the timings say:\n');
    for (const problem of problems) {
      console.error(`  ${problem}`);
    }
    process.exitCode = 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The tests `pnpm test:e2e` would run with these extra arguments, listed without running them.
 * CI=1 picks the config's CI reporters, whose JSON report the environment variable redirects.
 */
async function listTests(dir: string, name: string, args: string[]): Promise<ReportedTest[]> {
  const outputFile = path.join(dir, `${name}.json`);
  execFileSync(
    'pnpm',
    ['--filter', '@fphd/e2e', 'run', 'test:e2e', '--list', '--no-deps', ...args],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        CI: '1',
        PLAYWRIGHT_JSON_OUTPUT_FILE: outputFile,
        PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(dir, `${name}-html`),
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  return reportedTests(JSON.parse(await readFile(outputFile, 'utf8')) as JSONReport);
}

await main();
