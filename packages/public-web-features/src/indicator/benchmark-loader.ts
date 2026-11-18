import {
  type areaLookupListSchema,
  indicatorRangeSchema,
  MAX_AREA_CODES_PER_REQUEST,
} from '@fphd/public-api-features/contract';
import { type ApiClient, apiPath } from '@fphd/web-server/api-client';
import { loadInBatches } from './batches.ts';
import { benchmarkRange, deprivationFor } from './benchmarks.ts';
import type { BenchmarkChoice } from './comparison.ts';
import type { BenchmarkGeography, IndicatorAreaData } from './loader.ts';

export function benchmarkMemberships(areas: typeof areaLookupListSchema._output) {
  return {
    deprivation: areas.flatMap(({ benchmarks }) => benchmarks?.deprivation ?? []),
    neighboursByCode: Object.fromEntries(
      areas.flatMap(({ code, benchmarks }) =>
        benchmarks?.neighbours.length ? [[code, benchmarks.neighbours]] : [],
      ),
    ),
    caByCode: Object.fromEntries(
      areas.flatMap(({ code, benchmarks }) =>
        benchmarks?.combinedAuthority ? [[code, benchmarks.combinedAuthority]] : [],
      ),
    ),
  };
}

export async function loadBenchmarkData(
  api: ApiClient,
  indicator: string,
  choices: readonly BenchmarkChoice[],
  geography: BenchmarkGeography,
  dataFor: (codes: string[]) => Promise<IndicatorAreaData[]>,
  loaded: IndicatorAreaData[],
  withRanges = true,
) {
  const codes = [
    ...new Set(
      choices.flatMap((choice) => {
        const code = choice.split(':')[1] ?? '';
        if (!(code in geography.levelByCode)) return [];
        if (choice.startsWith('neighbours:')) return geography.neighboursByCode?.[code] ?? [];
        if (choice.startsWith('ca:')) return geography.caByCode?.[code]?.code ?? [];
        return [];
      }),
    ),
  ];
  const missing = codes.filter((code) => !loaded.some(({ areaCode }) => areaCode === code));
  const categories = [
    ...new Set(
      choices.flatMap((choice) =>
        choice === 'imd2019' || choice === 'imd2025'
          ? Object.keys(geography.levelByCode).flatMap(
              (code) => deprivationFor(geography, code, choice)?.dimensionValueId ?? [],
            )
          : [],
      ),
    ),
  ];
  const rangeQueries = new Map(
    categories.map((category) => [category, `category=${encodeURIComponent(category)}`]),
  );
  for (const choice of choices) {
    if (choice !== 'england' && choice !== 'region') continue;
    for (const code of Object.keys(geography.levelByCode)) {
      const range = benchmarkRange(geography, code, choice);
      if (range) rangeQueries.set(range.key, range.query);
    }
  }
  const [data, ranges] = await Promise.all([
    loadInBatches(
      Array.from({ length: Math.ceil(missing.length / MAX_AREA_CODES_PER_REQUEST) }, (_, index) =>
        missing.slice(index * MAX_AREA_CODES_PER_REQUEST, (index + 1) * MAX_AREA_CODES_PER_REQUEST),
      ),
      dataFor,
    ),
    loadInBatches(withRanges ? [...rangeQueries] : [], async ([key, query]) => {
      const range = await api.get(
        `${apiPath`/api/indicators/${indicator}/range`}?${query}`,
        indicatorRangeSchema,
      );
      return [key, range.periods] as const;
    }),
  ]);
  return {
    benchmarkData: [...loaded.filter(({ areaCode }) => codes.includes(areaCode)), ...data.flat()],
    ranges: Object.fromEntries(ranges),
  };
}
