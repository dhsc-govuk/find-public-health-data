import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  allowance,
  type Baseline,
  compareToBaseline,
  overDatabaseBudget,
  percentile,
  serialiseBaseline,
  type Work,
} from './budget.ts';
import { deleteDataTableDraft } from './fixtures.ts';
import { connect, measureWork, prepare, request, type Sessions, signIn } from './measure.ts';
import { ROUTES, type Route, routeKey } from './routes.ts';
import { describeStatements, type Statement } from './statements.ts';

const baselinePath = path.resolve(import.meta.dirname, '..', 'baseline.json');

/** Requests before anything is recorded: connection pools, prepared statements and JIT warm up. */
const WARM_UP = 3;
/** Sequential timed requests per route; the median is what the limit is checked against. */
const SAMPLES = 15;

type Timing = { median: number; p95: number };
type Result = { route: Route; work: Work; statements: Statement[]; timing: Timing };
/** A route over budget on database work, and the queries behind that work. */
type Breakdown = { route: string; lines: string[] };

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      measured: { type: 'string' },
    },
  });

  const sessions = await signIn();
  const sql = connect();
  const results: Result[] = [];
  try {
    await prepare(sql);
    for (const route of ROUTES) {
      for (let i = 0; i < WARM_UP; i++) await request(route, sessions);
      const timing = await time(route, sessions);
      // The timed requests warm each pooled connection before its database work is counted.
      const { work, statements } = await measureWork(sql, route, sessions);
      results.push({ route, work, statements, timing });
      console.log(`${routeKey(route)}: ${describe(work)}, median ${timing.median} ms`);
    }
  } finally {
    await deleteDataTableDraft(sql);
    await sql.end();
  }

  const measured: Baseline = Object.fromEntries(results.map((r) => [routeKey(r.route), r.work]));
  if (values.measured) {
    await mkdir(path.dirname(values.measured), { recursive: true });
    await writeFile(values.measured, serialiseBaseline(measured));
  }

  const baseline = await readBaseline();
  const { failures, notices } = compareToBaseline(measured, baseline);
  const slow = results
    .filter(({ route, timing }) => timing.median > route.limitMs)
    .map(
      ({ route, timing }) =>
        `${routeKey(route)} median ${timing.median} ms, over its ${route.limitMs} ms limit`,
    );

  const breakdowns = overDatabaseBudget(measured, baseline).map(
    (key): Breakdown => ({
      route: key,
      lines: describeStatements(
        results.find(({ route }) => routeKey(route) === key)?.statements ?? [],
      ),
    }),
  );

  await writeSummary(results, baseline, failures, slow, notices, breakdowns);

  for (const notice of notices) console.log(`note: ${notice}`);
  if (failures.length === 0 && slow.length === 0) {
    console.log('\nEvery route is within its budget and time limit.');
    return;
  }
  console.error('\nRoute budgets exceeded:\n');
  for (const failure of [...failures, ...slow]) console.error(`  ${failure}`);
  for (const { route, lines } of breakdowns) {
    console.error(`\nStatements behind ${route}:\n`);
    for (const line of lines) console.error(`  ${line}`);
  }
  for (const line of advice(failures, slow)) console.error(`\n${line}`);
  process.exitCode = 1;
}

async function time(route: Route, sessions: Sessions): Promise<Timing> {
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const response = await request(route, sessions);
    if (response.status !== 200) {
      throw new Error(`${routeKey(route)} answered ${response.status}`);
    }
    samples.push(response.ms);
  }
  return { median: Math.round(percentile(samples, 50)), p95: Math.round(percentile(samples, 95)) };
}

async function readBaseline(): Promise<Baseline> {
  try {
    return JSON.parse(await readFile(baselinePath, 'utf8')) as Baseline;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

function describe(work: Work): string {
  return `${work.statements} statements, ${work.buffers} buffers, ${work.rows} rows, ${work.bytes} bytes`;
}

const runId = process.env.GITHUB_RUN_ID ?? '<run-id>';

/** Accepting a run adopts its counts only: a time limit is raised in routes.ts. */
function advice(failures: string[], slow: string[]): string[] {
  return [
    ...(failures.length > 0
      ? [
          `If the change is intended, \`pnpm perf:accept ${runId}\` takes this run’s numbers for the failing routes. Commit tools/perf/baseline.json and say why under a "## Route budgets" heading in the pull request body.`,
        ]
      : []),
    ...(slow.length > 0
      ? ['If a route is meant to be slower, raise its `limitMs` in tools/perf/src/routes.ts.']
      : []),
  ];
}

/** The job summary: every route's numbers against its budget, then what failed. */
async function writeSummary(
  results: Result[],
  baseline: Baseline,
  failures: string[],
  slow: string[],
  notices: string[],
  breakdowns: Breakdown[],
): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const cell = (metric: keyof Work, value: number, expected: Work | undefined) =>
    expected === undefined ? `${value}` : `${value} / ${allowance(metric, expected[metric])}`;
  const lines = [
    '### Route budgets',
    '',
    'Measured / budget. Time is the median of sequential requests against the route’s limit.',
    '',
    '| Route | Statements | Buffers | Rows | Bytes | Median ms | p95 ms |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(({ route, work, timing }) => {
      const expected = baseline[routeKey(route)];
      return `| \`${routeKey(route)}\` | ${cell('statements', work.statements, expected)} | ${cell('buffers', work.buffers, expected)} | ${cell('rows', work.rows, expected)} | ${cell('bytes', work.bytes, expected)} | ${timing.median} / ${route.limitMs} | ${timing.p95} |`;
    }),
    '',
  ];
  if (failures.length > 0 || slow.length > 0) {
    lines.push(
      '**Failures**',
      '',
      ...[...failures, ...slow].map((f) => `- ${f}`),
      '',
      ...breakdowns.flatMap(({ route, lines }) => [
        `<details><summary>Statements behind <code>${route}</code></summary>`,
        '',
        '```',
        ...lines,
        '```',
        '',
        '</details>',
        '',
      ]),
      ...advice(failures, slow).flatMap((line) => [line, '']),
    );
  }
  if (notices.length > 0) {
    lines.push(
      '**Could be tightened**',
      '',
      ...notices.map((n) => `- ${n}`),
      '',
      `\`pnpm perf:accept ${runId} --all\` takes every route’s numbers from this run, including any over budget.`,
      '',
    );
  }
  await appendFile(file, `${lines.join('\n')}\n`);
}

await main();
