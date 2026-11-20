import { publicCouncilTier } from '../geography/groups.ts';
import type { BenchmarkChoice } from './comparison.ts';
import type {
  BenchmarkGeography,
  IndicatorAreaData,
  IndicatorDetail,
  IndicatorObservation,
} from './loader.ts';

export interface BenchmarkOption {
  value: BenchmarkChoice;
  label: string;
}

export type DeprivationMembership = NonNullable<BenchmarkGeography['deprivation']>[number];

export function benchmarkRange(
  geography: BenchmarkGeography,
  code: string,
  choice: 'england' | 'region',
) {
  const level = geography.levelByCode[code] ?? '';
  const publicTier = publicCouncilTier(code, level);
  const tier = publicTier ? (geography.tierByCode?.[code] ?? publicTier) : undefined;
  const parent = choice === 'region' ? geography.regionByCode[code]?.code : undefined;
  if (choice === 'region' && !parent) return undefined;
  if (tier)
    return {
      key: parent ? `region:${parent}:${tier}` : `england:${tier}`,
      query: `tier=${tier}${parent ? `&parent=${encodeURIComponent(parent)}` : ''}`,
    };
  const displayGroup = choice === 'region' ? 'Statistical regions' : level;
  return { key: displayGroup, query: `displayGroup=${encodeURIComponent(displayGroup)}` };
}

export function deprivationType(membership: DeprivationMembership): string {
  return `${membership.tier === 'upper' ? 'County' : 'District'} & UA deprivation deciles in England (${membership.scheme}, 4/23 geography)`;
}

export function deprivationFor(
  geography: BenchmarkGeography,
  code: string,
  choice: 'imd2019' | 'imd2025',
): DeprivationMembership | undefined {
  const level = geography.levelByCode[code] ?? '';
  const tier =
    geography.tierByCode?.[code] ??
    (level.toLowerCase().includes('lower') || /^E07/.test(code) ? 'lower' : 'upper');
  return geography.deprivation?.find(
    (entry) => entry.code === code && entry.scheme.toLowerCase() === choice && entry.tier === tier,
  );
}

const BENCHMARK_ORDER = ['england', 'region', 'imd2019', 'imd2025', 'goal', 'neighbours', 'ca'];

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
  context?: {
    areas: IndicatorAreaData[];
    geography: BenchmarkGeography;
    englandObservations: IndicatorObservation[];
    goal: IndicatorDetail['goal'];
  },
): BenchmarkOption[] {
  return [
    // England is no benchmark for an indicator without an England value.
    ...(context && context.englandObservations.length === 0
      ? []
      : [{ value: 'england' as const, label: 'England' }]),
    ...(region ? [{ value: 'region' as const, label: 'Statistical regions' }] : []),
    ...(['imd2025', 'imd2019'] as const).flatMap((value) =>
      context?.areas.some(({ areaCode }) => {
        const membership = deprivationFor(context.geography, areaCode, value);
        return (
          membership &&
          context.englandObservations.some(({ dimensions }) =>
            dimensions.some(({ type }) => type === deprivationType(membership)),
          )
        );
      })
        ? [
            {
              value,
              label: `Areas with similar deprivation to the selected area (Index of Multiple Deprivation (IMD) ${value.slice(3)})`,
            },
          ]
        : [],
    ),
    ...(context?.goal ? [{ value: 'goal' as const, label: 'Policy goal' }] : []),
    ...(context?.areas.flatMap(({ areaCode, areaName }) =>
      context.geography.neighboursByCode?.[areaCode]?.length
        ? [
            {
              value: `neighbours:${areaCode}` as const,
              label: `Statistical neighbours (${areaName})`,
            },
          ]
        : [],
    ) ?? []),
    ...(context?.areas.flatMap(({ areaCode, areaName }) =>
      context.geography.caByCode?.[areaCode]
        ? [{ value: `ca:${areaCode}` as const, label: `Combined authority (${areaName})` }]
        : [],
    ) ?? []),
  ];
}

export function isRangeBenchmark(choice: BenchmarkChoice): boolean {
  return ['england', 'region', 'imd2019', 'imd2025'].includes(choice);
}
