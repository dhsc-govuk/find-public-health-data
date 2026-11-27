import { percentile } from './budget.ts';

export type Summary = { n: number; median: number; p95: number; min: number };

/** One case run by one variant: every kept sample, in milliseconds. */
export type Measurement = { case: string; variant: string; samples: number[] };

export function summarise(samples: readonly number[]): Summary {
  if (samples.length === 0) throw new Error('summary of an empty sample');
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[middle] as number)
      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
  return { n: sorted.length, median, p95: percentile(sorted, 95), min: sorted[0] as number };
}

/**
 * The variants in the order a round runs them. Each round starts one further along, so no variant
 * always runs first, straight after another variant's burst of work, or last.
 */
export function roundOrder<T>(variants: readonly T[], round: number): T[] {
  const start = variants.length === 0 ? 0 : round % variants.length;
  return [...variants.slice(start), ...variants.slice(0, start)];
}

function milliseconds(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

/**
 * A Markdown table with a row per case and variant. The last column compares each median with the
 * first variant measured for the same case, which is postgres.js as installed.
 */
export function markdownTable(measurements: readonly Measurement[]): string {
  const baselines = new Map<string, number>();
  const rows = measurements.map((measurement) => {
    const summary = summarise(measurement.samples);
    const baseline = baselines.get(measurement.case) ?? summary.median;
    baselines.set(measurement.case, baseline);
    const ratio = baseline === 0 ? '' : `${(summary.median / baseline).toFixed(2)}×`;
    return `| ${measurement.case} | ${measurement.variant} | ${summary.n} | ${milliseconds(summary.median)} | ${milliseconds(summary.p95)} | ${milliseconds(summary.min)} | ${ratio} |`;
  });
  return [
    '| Case | Variant | Samples | Median (ms) | p95 (ms) | Min (ms) | Median against postgres.js |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
  ].join('\n');
}
