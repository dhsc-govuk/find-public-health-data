// Shards the suite by measured run time instead of Playwright's default of equal test counts, which
// cuts the projects in file order and gave one shard every public spec. On a run with --shard,
// it packs whole spec files into the shards by the times in shard-timings.json and leaves this
// shard only its own files. Every shard computes the same packing, so between them they run every
// file once. Setup projects are left alone: Playwright runs them in full wherever they're needed.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { packFiles, type Timings } from '@fphd/e2e-shards';
import type { FullConfig, Reporter, Suite, TestRun } from '@playwright/test/reporter';

const TIMINGS_FILE = path.join(import.meta.dirname, 'shard-timings.json');

export default class ShardByTime implements Reporter {
  async preprocess({
    config,
    suite,
    testRun,
  }: {
    config: FullConfig;
    suite: Suite;
    testRun: TestRun;
  }): Promise<void> {
    if (!config.shard) {
      return;
    }
    testRun.skipSharding();

    const setupProjects = new Set(
      suite.suites.flatMap((projectSuite) => projectSuite.project()?.dependencies ?? []),
    );
    const fileSuites = suite.suites
      .filter((projectSuite) => !setupProjects.has(projectSuite.project()?.name ?? ''))
      .flatMap((projectSuite) => projectSuite.suites);
    const fileOf = (fileSuite: Suite) =>
      path
        .relative(config.rootDir, fileSuite.location?.file ?? '')
        .split(path.sep)
        .join('/');

    const { current, total } = config.shard;
    const shard = packFiles(fileSuites.map(fileOf), readTimings(), total)[current - 1];
    const keep = new Set(shard?.files);
    for (const fileSuite of fileSuites) {
      if (!keep.has(fileOf(fileSuite))) {
        testRun.exclude(fileSuite);
      }
    }
    console.log(
      `Shard ${current} of ${total} runs ${keep.size} spec files, measured at about ` +
        `${Math.round(shard?.seconds ?? 0)} s of test time.`,
    );
  }

  printsToStdio(): boolean {
    return false;
  }
}

function readTimings(): Timings {
  return JSON.parse(readFileSync(TIMINGS_FILE, 'utf8')) as Timings;
}
