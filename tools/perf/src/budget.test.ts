import { describe, expect, it } from 'vitest';

import {
  acceptRun,
  allowance,
  compareToBaseline,
  overDatabaseBudget,
  percentile,
  serialiseBaseline,
  type Work,
} from './budget.ts';

const work = (overrides: Partial<Work> = {}): Work => ({
  statements: 3,
  buffers: 400,
  rows: 50,
  bytes: 20_000,
  ...overrides,
});

describe('allowance', () => {
  it('allows no extra statements', () => {
    expect(allowance('statements', 3)).toBe(3);
  });

  it('adds the ratio and the slack for the other metrics', () => {
    expect(allowance('buffers', 400)).toBe(500);
    expect(allowance('bytes', 20_000)).toBe(23_024);
  });
});

describe('compareToBaseline', () => {
  it('passes a route that matches its baseline', () => {
    expect(compareToBaseline({ 'GET /a': work() }, { 'GET /a': work() })).toEqual({
      failures: [],
      notices: [],
    });
  });

  it('fails one extra statement', () => {
    const { failures } = compareToBaseline(
      { 'GET /a': work({ statements: 4 }) },
      { 'GET /a': work() },
    );
    expect(failures).toEqual(['GET /a statements: 4, over the budget of 3 (baseline 3)']);
  });

  it('passes a rise within the tolerance and fails one beyond it', () => {
    expect(
      compareToBaseline({ 'GET /a': work({ buffers: 500 }) }, { 'GET /a': work() }).failures,
    ).toEqual([]);
    expect(
      compareToBaseline({ 'GET /a': work({ buffers: 501 }) }, { 'GET /a': work() }).failures,
    ).toEqual(['GET /a buffers: 501, over the budget of 500 (baseline 400)']);
  });

  it('notes a metric now well under its baseline without failing', () => {
    const comparison = compareToBaseline(
      { 'GET /a': work({ statements: 1 }) },
      { 'GET /a': work() },
    );
    expect(comparison.failures).toEqual([]);
    expect(comparison.notices).toEqual(['GET /a statements: 1, well under the baseline of 3']);
  });

  it('fails a measured route with no baseline and a baseline route no longer measured', () => {
    expect(compareToBaseline({ 'GET /new': work() }, { 'GET /old': work() }).failures).toEqual([
      'GET /new has no baseline',
      'GET /old is in the baseline but no longer measured',
    ]);
  });
});

describe('overDatabaseBudget', () => {
  it('names routes over budget on statements, buffers or rows', () => {
    const baseline = { 'GET /a': work(), 'GET /b': work(), 'GET /c': work(), 'GET /d': work() };
    const run = {
      'GET /a': work({ statements: 4 }),
      'GET /b': work({ buffers: 501 }),
      'GET /c': work({ rows: 81 }),
      'GET /d': work(),
    };

    expect(overDatabaseBudget(run, baseline)).toEqual(['GET /a', 'GET /b', 'GET /c']);
  });

  it('leaves out a route over budget only on bytes, and one with no baseline', () => {
    expect(
      overDatabaseBudget(
        { 'GET /a': work({ bytes: 23_025 }), 'GET /new': work({ statements: 99 }) },
        { 'GET /a': work() },
      ),
    ).toEqual([]);
  });
});

describe('acceptRun', () => {
  const baseline = { 'GET /a': work(), 'GET /b': work() };

  it('takes a route over its allowance on any metric', () => {
    const run = { 'GET /a': work({ bytes: 23_025 }), 'GET /b': work() };
    expect(acceptRun(run, baseline, { all: false })).toEqual({
      baseline: run,
      updated: ['GET /a'],
      added: [],
      removed: [],
    });
  });

  it('takes every metric of an over-allowance route, not only the one over', () => {
    const run = { 'GET /a': work({ statements: 4, buffers: 410 }), 'GET /b': work() };
    expect(acceptRun(run, baseline, { all: false }).baseline['GET /a']).toEqual(
      work({ statements: 4, buffers: 410 }),
    );
  });

  it('keeps the committed numbers of a route within its allowance', () => {
    const committed = { 'GET /a': { bytes: 20_000, rows: 50, buffers: 400, statements: 3 } };
    const accepted = acceptRun({ 'GET /a': work({ buffers: 500 }) }, committed, { all: false });
    expect(accepted.updated).toEqual([]);
    expect(accepted.baseline['GET /a']).toBe(committed['GET /a']);
  });

  it('does not tighten a metric well under its baseline', () => {
    const accepted = acceptRun({ 'GET /a': work({ statements: 1 }), 'GET /b': work() }, baseline, {
      all: false,
    });
    expect(accepted.baseline).toEqual(baseline);
    expect(accepted.updated).toEqual([]);
  });

  it('adds a route new to the run and drops one the run no longer measures', () => {
    const run = { 'GET /a': work(), 'GET /c': work({ rows: 7 }) };
    expect(acceptRun(run, baseline, { all: false })).toEqual({
      baseline: run,
      updated: [],
      added: ['GET /c'],
      removed: ['GET /b'],
    });
  });

  it('takes every route with all, tightening as well as loosening', () => {
    const run = { 'GET /a': work({ statements: 1 }), 'GET /b': work({ bytes: 20_001 }) };
    expect(acceptRun(run, baseline, { all: true })).toEqual({
      baseline: run,
      updated: ['GET /a', 'GET /b'],
      added: [],
      removed: [],
    });
  });

  it('adds and removes routes with all as well', () => {
    const run = { 'GET /a': work({ rows: 51 }), 'GET /c': work() };
    expect(acceptRun(run, baseline, { all: true })).toEqual({
      baseline: run,
      updated: ['GET /a'],
      added: ['GET /c'],
      removed: ['GET /b'],
    });
  });

  it('changes exactly the routes compareToBaseline fails', () => {
    const committed = {
      'GET /over': work(),
      'GET /drift': work(),
      'GET /under': work(),
      'GET /same': work(),
      'GET /gone': work(),
    };
    const run = {
      'GET /over': work({ statements: 4, bytes: 19_000 }),
      'GET /drift': work({ buffers: 480, rows: 60 }),
      'GET /under': work({ buffers: 10 }),
      'GET /same': work(),
      'GET /new': work(),
    };
    const { failures } = compareToBaseline(run, committed);
    const failed = [...Object.keys(run), ...Object.keys(committed)].filter((route) =>
      failures.some((failure) => failure.startsWith(`${route} `)),
    );
    const { updated, added, removed } = acceptRun(run, committed, { all: false });
    expect([...updated, ...added, ...removed].sort()).toEqual([...new Set(failed)].sort());
    expect(updated).toEqual(['GET /over']);
  });

  it('reports a route as updated with all only when a number differs', () => {
    expect(acceptRun(baseline, baseline, { all: true }).updated).toEqual([]);
  });

  it('changes nothing when no route failed', () => {
    const run = { 'GET /a': work({ buffers: 450 }), 'GET /b': work({ bytes: 21_000 }) };
    const accepted = acceptRun(run, baseline, { all: false });
    expect(accepted).toEqual({ baseline, updated: [], added: [], removed: [] });
    expect(serialiseBaseline(accepted.baseline)).toBe(serialiseBaseline(baseline));
  });
});

describe('serialiseBaseline', () => {
  it('sorts routes and ends with a newline', () => {
    const text = serialiseBaseline({ 'GET /b': work(), 'GET /a': work() });
    expect(Object.keys(JSON.parse(text))).toEqual(['GET /a', 'GET /b']);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('sorts by code point, where a locale would put a query before a subpath', () => {
    const text = serialiseBaseline({ 'GET /a?q=1': work(), 'GET /a/b': work() });
    expect(Object.keys(JSON.parse(text))).toEqual(['GET /a/b', 'GET /a?q=1']);
  });
});

describe('percentile', () => {
  it('takes the nearest rank', () => {
    const samples = [5, 1, 4, 2, 3];
    expect(percentile(samples, 50)).toBe(3);
    expect(percentile(samples, 95)).toBe(5);
    expect(percentile(samples, 0)).toBe(1);
  });
});
