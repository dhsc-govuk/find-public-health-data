import type { Shard } from './pack.ts';
import type { ReportedTest } from './report.ts';

/**
 * The shard total of ci.yml's e2e matrix, read from its `suite: <current>/<total>` entries. The
 * entries must agree on the total and number every shard from 1 up to it exactly once.
 */
export function readShardTotal(workflow: string): number {
  const entries = [...workflow.matchAll(/^\s*- suite: (\d+)\/(\d+)\s*$/gm)].map((match) => ({
    current: Number(match[1]),
    total: Number(match[2]),
  }));
  const totals = new Set(entries.map((entry) => entry.total));
  const [total] = totals;
  if (total === undefined) {
    throw new Error('ci.yml has no e2e matrix entry of the form `- suite: 1/4`.');
  }
  if (totals.size > 1) {
    throw new Error(`ci.yml's e2e shards disagree on their total: ${[...totals].join(', ')}.`);
  }
  const currents = entries.map((entry) => entry.current).sort((a, b) => a - b);
  const expected = Array.from({ length: total }, (_, index) => index + 1);
  if (currents.join() !== expected.join()) {
    throw new Error(
      `ci.yml's e2e shards are ${currents.map((current) => `${current}/${total}`).join(', ')}; ` +
        `they must be ${expected.map((current) => `${current}/${total}`).join(', ')}.`,
    );
  }
  return total;
}

/**
 * Problems with how the shards divide the suite: a test that no shard runs, a test that more than
 * one shard runs, and a test a shard runs that the whole suite doesn't have.
 */
export function findShardProblems(
  suite: readonly ReportedTest[],
  shards: readonly (readonly ReportedTest[])[],
): string[] {
  const shardsOf = new Map<string, number[]>();
  shards.forEach((tests, index) => {
    for (const test of tests) {
      shardsOf.set(test.id, [...(shardsOf.get(test.id) ?? []), index + 1]);
    }
  });
  const known = new Set(suite.map((test) => test.id));

  const unrun = suite
    .filter((test) => !shardsOf.has(test.id))
    .map((test) => `No shard runs ${test.label}`);
  const repeated = suite.flatMap((test) => {
    const runIn = shardsOf.get(test.id) ?? [];
    return runIn.length > 1 ? [`Shards ${runIn.join(' and ')} each run ${test.label}`] : [];
  });
  const unknown = shards.flatMap((tests, index) =>
    tests
      .filter((test) => !known.has(test.id))
      .map((test) => `Shard ${index + 1} runs ${test.label}, which the whole suite doesn't have`),
  );
  return [...unrun, ...repeated, ...unknown];
}

/**
 * Problems with which files each shard runs, against the split the timings give. A shard whose
 * files differ means the shard-by-time reporter did not divide the suite, for instance because
 * the Playwright config no longer lists it and Playwright split by test count instead.
 */
export function findMisplacedFiles(
  expected: readonly Shard[],
  shards: readonly (readonly ReportedTest[])[],
): string[] {
  return expected.flatMap((shard, index) => {
    const listed = new Set((shards[index] ?? []).map((test) => test.file));
    const missing = shard.files.filter((file) => !listed.has(file));
    const extra = [...listed].filter((file) => !shard.files.includes(file)).sort();
    return [
      ...missing.map((file) => `Shard ${index + 1} should run ${file} but doesn't`),
      ...extra.map((file) => `Shard ${index + 1} runs ${file}, which the timings put elsewhere`),
    ];
  });
}
