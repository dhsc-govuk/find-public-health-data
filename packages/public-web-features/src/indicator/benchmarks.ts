import type { BenchmarkChoice } from './comparison.ts';

const BENCHMARK_ORDER = ['england', 'region', 'imd2019', 'imd2025', 'neighbours', 'ca', 'goal'];

function benchmarkOrder(choice: BenchmarkChoice): number {
  return BENCHMARK_ORDER.indexOf(choice.split(':')[0] ?? '');
}

export function canonicalBenchmarks(choices: readonly BenchmarkChoice[]): BenchmarkChoice[] {
  return [...new Set(choices)].sort(
    (a, b) => benchmarkOrder(a) - benchmarkOrder(b) || a.localeCompare(b),
  );
}

export function selectedBenchmarks(
  params: URLSearchParams,
  scope: number | 'compare',
): BenchmarkChoice[] {
  return canonicalBenchmarks(
    params
      .getAll(`cmp-${scope}`)
      .filter(
        (value): value is BenchmarkChoice =>
          ['england', 'region', 'imd2019', 'imd2025', 'goal'].includes(value) ||
          /^(neighbours|ca):[A-Z]\d{8}$/.test(value),
      ),
  );
}

export function setBenchmarkParams(
  params: URLSearchParams,
  scope: number | 'compare',
  choices: readonly BenchmarkChoice[],
): void {
  const key = `cmp-${scope}`;
  params.delete(key);
  const values = canonicalBenchmarks(choices);
  for (const value of values.length ? values : ['']) params.append(key, value);
}

export function benchmarkCheckboxOptions(
  region: boolean,
): { value: BenchmarkChoice; label: string }[] {
  return [
    { value: 'england' as const, label: 'England' },
    ...(region ? [{ value: 'region' as const, label: 'Statistical regions' }] : []),
  ];
}

export function isRangeBenchmark(choice: BenchmarkChoice): boolean {
  return ['england', 'region', 'imd2019', 'imd2025'].includes(choice);
}
