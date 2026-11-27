import type { JSONReport, JSONReportSuite } from '@playwright/test/reporter';

import type { Timings } from './pack.ts';

/** One test in a Playwright JSON report, under the spec file Playwright loaded it from. */
export type ReportedTest = {
  /** Unique within the report: the project and the spec's id. */
  id: string;
  /** Project, spec file, and the test's own location and title, for messages. */
  label: string;
  /** The spec file's path under the config's rootDir, e2e/tests. */
  file: string;
  /** Time spent across every result of the test, in seconds. */
  seconds: number;
};

/**
 * Every test in the report. A test written in a shared helper is reported against the helper's
 * path, so each test is credited to the top-level file suite it sits under, which is the spec file
 * Playwright loaded and the unit the shards are made of.
 */
export function reportedTests(report: JSONReport): ReportedTest[] {
  return report.suites.flatMap((fileSuite) => testsUnder(fileSuite, fileSuite.file));
}

function testsUnder(suite: JSONReportSuite, file: string): ReportedTest[] {
  const own = suite.specs.flatMap((spec) =>
    spec.tests.map((test) => ({
      id: `${test.projectName} ${spec.id}`,
      label: `[${test.projectName}] ${file} › ${spec.file}:${spec.line} › ${spec.title}`,
      file,
      seconds: test.results.reduce((total, result) => total + result.duration, 0) / 1000,
    })),
  );
  return [...own, ...(suite.suites ?? []).flatMap((child) => testsUnder(child, file))];
}

/**
 * Each spec file's total test time across the reports, to the nearest tenth of a second. Several
 * reports are added together, so the reports from every shard of one run make one set of
 * timings. Files whose tests took no time, such as those only listed, are left out, and so are
 * setup files (`*.setup.ts`): every shard runs its setup projects in full, so they are never
 * divided between shards, and adding up each shard's run of them would count them several times.
 */
export function timingsFromReports(reports: readonly JSONReport[]): Timings {
  const totals = new Map<string, number>();
  for (const test of reports.flatMap(reportedTests).filter((test) => !isSetupFile(test.file))) {
    totals.set(test.file, (totals.get(test.file) ?? 0) + test.seconds);
  }
  return Object.fromEntries(
    [...totals]
      .map(([file, seconds]) => [file, Math.round(seconds * 10) / 10] as const)
      .filter(([, seconds]) => seconds > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function isSetupFile(file: string): boolean {
  return file.endsWith('.setup.ts');
}
