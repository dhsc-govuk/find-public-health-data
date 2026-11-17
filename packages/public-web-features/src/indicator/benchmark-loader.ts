import {
  areaDeprivationListSchema,
  areaNeighbourListSchema,
  areaParentListSchema,
  indicatorRangeSchema,
  MAX_AREA_CODES_PER_REQUEST,
} from '@fphd/public-api-features/contract';
import { type ApiClient, apiPath } from '@fphd/web-server/api-client';
import { loadInBatches } from './batches.ts';
import { deprivationFor } from './benchmarks.ts';
import type { BenchmarkChoice } from './comparison.ts';
import type { BenchmarkGeography, IndicatorAreaData } from './loader.ts';

export async function loadBenchmarkMemberships(api: ApiClient, codes: string[]) {
  const batches = Array.from(
    { length: Math.ceil(codes.length / MAX_AREA_CODES_PER_REQUEST) },
    (_, index) =>
      codes.slice(index * MAX_AREA_CODES_PER_REQUEST, (index + 1) * MAX_AREA_CODES_PER_REQUEST),
  );
  const results = await loadInBatches(batches, async (batch) => {
    const query = batch.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&');
    const [deprivation, neighbours, parents] = await Promise.all([
      api.get(`/api/areas/deprivation?${query}`, areaDeprivationListSchema),
      api.get(`/api/areas/neighbours?${query}`, areaNeighbourListSchema),
      api.get(
        `/api/areas/parents?${query}&parentType=${encodeURIComponent('Combined authorities')}`,
        areaParentListSchema,
      ),
    ]);
    return { deprivation, neighbours, parents };
  });
  return {
    deprivation: results.flatMap(({ deprivation }) => deprivation),
    neighboursByCode: Object.fromEntries(
      results.flatMap(({ neighbours }) =>
        neighbours.map(({ code, neighbours }) => [code, neighbours]),
      ),
    ),
    caByCode: Object.fromEntries(
      results.flatMap(({ parents }) =>
        parents.map(({ code, parentCode, parentName }) => [
          code,
          { code: parentCode, name: parentName },
        ]),
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
  const [data, ranges] = await Promise.all([
    loadInBatches(
      Array.from({ length: Math.ceil(missing.length / MAX_AREA_CODES_PER_REQUEST) }, (_, index) =>
        missing.slice(index * MAX_AREA_CODES_PER_REQUEST, (index + 1) * MAX_AREA_CODES_PER_REQUEST),
      ),
      dataFor,
    ),
    loadInBatches(withRanges ? categories : [], async (category) => {
      const range = await api.get(
        `${apiPath`/api/indicators/${indicator}/range`}?category=${encodeURIComponent(category)}`,
        indicatorRangeSchema,
      );
      return [category, range.periods] as const;
    }),
  ]);
  return {
    benchmarkData: [...loaded.filter(({ areaCode }) => codes.includes(areaCode)), ...data.flat()],
    ranges: Object.fromEntries(ranges),
  };
}
