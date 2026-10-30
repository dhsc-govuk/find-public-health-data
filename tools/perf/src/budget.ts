/** The work one request to a route did: counted by Postgres and by the response, not timed. */
export type Work = {
  /** SQL statements the APIs executed. */
  statements: number;
  /** Shared buffers (8 kB pages) those statements touched, from cache or disk alike. */
  buffers: number;
  /** Rows those statements returned or affected. */
  rows: number;
  /** Decoded response body size. */
  bytes: number;
};

export type Baseline = Record<string, Work>;

/**
 * How far each metric may rise above its baseline before the route fails: a ratio plus a small
 * absolute allowance, so a tiny baseline is not failed by a handful of extra pages or bytes.
 * Statements have none: one more statement per request is the N+1 signal this exists to catch.
 */
export const TOLERANCES: Record<keyof Work, { ratio: number; slack: number }> = {
  statements: { ratio: 1, slack: 0 },
  buffers: { ratio: 1.2, slack: 20 },
  rows: { ratio: 1.2, slack: 20 },
  bytes: { ratio: 1.1, slack: 1024 },
};

const METRICS = Object.keys(TOLERANCES) as (keyof Work)[];

export type Comparison = {
  /** Budgets exceeded, routes with no baseline, and baseline entries no longer measured. */
  failures: string[];
  /** Metrics now well under their baseline, so the baseline could be tightened. */
  notices: string[];
};

export function allowance(metric: keyof Work, baseline: number): number {
  const { ratio, slack } = TOLERANCES[metric];
  return Math.floor(baseline * ratio) + slack;
}

function exceeds(metric: keyof Work, measured: number, baseline: number): boolean {
  return measured > allowance(metric, baseline);
}

export function compareToBaseline(measured: Baseline, baseline: Baseline): Comparison {
  const failures: string[] = [];
  const notices: string[] = [];

  for (const [route, work] of Object.entries(measured)) {
    const expected = baseline[route];
    if (expected === undefined) {
      failures.push(`${route} has no baseline`);
      continue;
    }
    for (const metric of METRICS) {
      if (exceeds(metric, work[metric], expected[metric])) {
        failures.push(
          `${route} ${metric}: ${work[metric]}, over the budget of ${allowance(metric, expected[metric])} (baseline ${expected[metric]})`,
        );
      } else if (exceeds(metric, expected[metric], work[metric])) {
        notices.push(
          `${route} ${metric}: ${work[metric]}, well under the baseline of ${expected[metric]}`,
        );
      }
    }
  }

  for (const route of Object.keys(baseline)) {
    if (!(route in measured)) {
      failures.push(`${route} is in the baseline but no longer measured`);
    }
  }

  return { failures, notices };
}

/** The metrics Postgres counts, as opposed to the response size. */
const DATABASE_METRICS: (keyof Work)[] = ['statements', 'buffers', 'rows'];

/** Routes over budget on what Postgres counted, whose statements are worth listing. */
export function overDatabaseBudget(measured: Baseline, baseline: Baseline): string[] {
  return Object.entries(measured)
    .filter(([route, work]) => {
      const expected = baseline[route];
      return (
        expected !== undefined &&
        DATABASE_METRICS.some((metric) => exceeds(metric, work[metric], expected[metric]))
      );
    })
    .map(([route]) => route);
}

export type Acceptance = {
  baseline: Baseline;
  /** Routes in both whose numbers were taken from the run. */
  updated: string[];
  added: string[];
  removed: string[];
};

/**
 * The baseline after accepting a run. By default it takes only routes over budget, new or gone,
 * so drift on passing routes is never adopted; `all` takes every route's numbers.
 */
export function acceptRun(
  run: Baseline,
  baseline: Baseline,
  { all }: { all: boolean },
): Acceptance {
  const changed = (work: Work, expected: Work) =>
    METRICS.some((metric) =>
      all ? work[metric] !== expected[metric] : exceeds(metric, work[metric], expected[metric]),
    );
  type Status = 'added' | 'updated' | 'kept';
  const decisions = Object.entries(run).map(
    ([route, work]): { route: string; work: Work; status: Status } => {
      const expected = baseline[route];
      if (expected === undefined) return { route, work, status: 'added' };
      if (changed(work, expected)) return { route, work, status: 'updated' };
      return { route, work: expected, status: 'kept' };
    },
  );
  const withStatus = (status: Status) =>
    decisions.filter((d) => d.status === status).map((d) => d.route);
  return {
    baseline: Object.fromEntries(decisions.map(({ route, work }) => [route, work])),
    updated: withStatus('updated'),
    added: withStatus('added'),
    removed: Object.keys(baseline).filter((route) => !(route in run)),
  };
}

/** Keys in code-point order, so the file diffs only where a number changed, whatever the locale. */
export function serialiseBaseline(baseline: Baseline): string {
  const sorted = Object.fromEntries(
    Object.entries(baseline).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/** Nearest-rank percentile of a non-empty sample. */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) throw new Error('percentile of an empty sample');
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(rank, 1) - 1] as number;
}
