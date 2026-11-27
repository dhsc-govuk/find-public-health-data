import type { JSONReport, JSONReportSpec, JSONReportSuite } from '@playwright/test/reporter';
import { describe, expect, it } from 'vitest';

import { reportedTests, timingsFromReports } from './report.ts';

const spec = (id: string, file: string, durations: number[], project = 'public'): JSONReportSpec =>
  ({
    id,
    file,
    line: 3,
    title: `test ${id}`,
    tests: [{ projectName: project, results: durations.map((duration) => ({ duration })) }],
  }) as unknown as JSONReportSpec;

const fileSuite = (
  file: string,
  specs: JSONReportSpec[],
  suites: JSONReportSuite[] = [],
): JSONReportSuite => ({ title: file, file, line: 0, column: 0, specs, suites });

const report = (...suites: JSONReportSuite[]) => ({ suites }) as unknown as JSONReport;

describe('reportedTests', () => {
  it('credits a test written in a shared helper to the spec file that loaded it', () => {
    const tests = reportedTests(
      report(
        fileSuite(
          'public/topic.spec.ts',
          [],
          [fileSuite('support/topic-page.ts', [spec('1', 'support/topic-page.ts', [1500])])],
        ),
      ),
    );

    expect(tests).toEqual([
      {
        id: 'public 1',
        label: '[public] public/topic.spec.ts › support/topic-page.ts:3 › test 1',
        file: 'public/topic.spec.ts',
        seconds: 1.5,
      },
    ]);
  });
});

describe('timingsFromReports', () => {
  it('adds up every result of every test in each spec file, to a tenth of a second', () => {
    const timings = timingsFromReports([
      report(
        fileSuite('public/b.spec.ts', [spec('1', 'public/b.spec.ts', [1000, 240])]),
        fileSuite(
          'public/a.spec.ts',
          [spec('2', 'public/a.spec.ts', [330])],
          [fileSuite('public/a.spec.ts', [spec('3', 'public/a.spec.ts', [1000])])],
        ),
      ),
    ]);

    expect(timings).toEqual({ 'public/a.spec.ts': 1.3, 'public/b.spec.ts': 1.2 });
    expect(Object.keys(timings)).toEqual(['public/a.spec.ts', 'public/b.spec.ts']);
  });

  it('combines the reports of several shards into one set of timings', () => {
    const timings = timingsFromReports([
      report(fileSuite('public/a.spec.ts', [spec('1', 'public/a.spec.ts', [2000])])),
      report(fileSuite('internal/b.spec.ts', [spec('2', 'internal/b.spec.ts', [500], 'internal')])),
    ]);

    expect(timings).toEqual({ 'internal/b.spec.ts': 0.5, 'public/a.spec.ts': 2 });
  });

  it('leaves out setup files, which every shard runs in full', () => {
    const timings = timingsFromReports([
      report(
        fileSuite('internal/sign-in.setup.ts', [spec('1', 'internal/sign-in.setup.ts', [4000])]),
        fileSuite('internal/a.spec.ts', [spec('2', 'internal/a.spec.ts', [1000])]),
      ),
      report(
        fileSuite('internal/sign-in.setup.ts', [spec('1', 'internal/sign-in.setup.ts', [4000])]),
      ),
    ]);

    expect(timings).toEqual({ 'internal/a.spec.ts': 1 });
  });

  it('leaves out files whose tests were only listed, not run', () => {
    const timings = timingsFromReports([
      report(fileSuite('public/listed.spec.ts', [spec('1', 'public/listed.spec.ts', [])])),
    ]);

    expect(timings).toEqual({});
  });
});
