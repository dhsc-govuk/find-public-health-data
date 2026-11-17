import { dimensionValues, sameSegment } from '../data.ts';
import type { SelectedIndicator } from '../loader.ts';
import { pairedObservations, scatterPair } from './chart-data.ts';

export function loadScatterComparison(selected: SelectedIndicator[], params: URLSearchParams) {
  const [x, y] = scatterPair(selected, params);
  if (!x || !y) return undefined;
  return { points: pairedObservations(x.areaData, y.areaData) };
}

export type ScatterComparison = NonNullable<ReturnType<typeof loadScatterComparison>> & {
  variants?: {
    sex: string;
    axisSexes: string[];
    points: ReturnType<typeof pairedObservations>;
  }[];
};

export function scatterSexComparisons(
  selected: SelectedIndicator[],
  params: URLSearchParams,
): ScatterComparison {
  const pair = scatterPair(selected, params).filter((entry) => entry !== undefined);
  const sexesByIndicator = pair.map(({ areaData }) =>
    dimensionValues(
      areaData.flatMap(({ observations }) => observations),
      'Sex',
    ),
  );
  const sexes = (sexesByIndicator.find((values) => values.length) ?? []).filter((sex) =>
    sexesByIndicator.every((values) => !values.length || values.includes(sex)),
  );
  sexes.sort((a, b) => (a === 'Female' ? -1 : b === 'Female' ? 1 : 0));
  const variants = sexes.map((sex) => {
    const areas = pair.map(({ areaData }, index) =>
      areaData.map((area) => ({
        ...area,
        observations: area.observations
          .filter(
            ({ dimensions }) =>
              !sexesByIndicator[index]?.length ||
              dimensions.some((dimension) => dimension.type === 'Sex' && dimension.value === sex),
          )
          .map((point) => ({
            ...point,
            dimensions: point.dimensions.filter(({ type }) => type !== 'Sex'),
          })),
      })),
    );
    return {
      sex,
      axisSexes: sexesByIndicator.map((values) => (values.length ? sex : '')),
      points: pairedObservations(areas[0] ?? [], areas[1] ?? []),
    };
  });
  return { points: loadScatterComparison(selected, params)?.points ?? [], variants };
}

export function loadRankingScatterComparison(
  selected: SelectedIndicator[],
  params: URLSearchParams,
) {
  const [x, y] = scatterPair(selected, params);
  if (!x || !y) return undefined;
  const reference = (indicator: SelectedIndicator) =>
    indicator.areaData.flatMap((area) => area.observations).find(({ value }) => value !== null);
  const first = reference(x),
    second = reference(y);
  if (!first || !second) return undefined;
  // Sex variants can elect a different headline after history is bounded.
  if ([first, second].some(({ dimensions }) => dimensions.some(({ type }) => type === 'Sex')))
    return undefined;
  if (!sameSegment(first, second)) {
    const populations = [x, y].map(({ areaData }) =>
      areaData.every(({ populationKeys }) => populationKeys !== undefined)
        ? new Set(areaData.flatMap(({ populationKeys }) => populationKeys ?? []))
        : undefined,
    );
    const [firstKeys, secondKeys] = populations;
    return firstKeys && secondKeys && ![...firstKeys].some((key) => secondKeys.has(key))
      ? { points: [] }
      : undefined;
  }
  const periods = [x, y].map(
    ({ areaData }) =>
      new Set(
        areaData.flatMap(({ observations }) =>
          observations
            .filter(({ value }) => value !== null)
            .map(({ fromDate, toDate }) => `${fromDate}|${toDate}`),
        ),
      ),
  );
  if (
    periods.some((periods) => periods.size !== 1) ||
    [...(periods[0] ?? [])][0] !== [...(periods[1] ?? [])][0]
  )
    return undefined;
  const scatter = loadScatterComparison(selected, params);
  // Disjoint latest local values can still have a paired period further back.
  if (
    !scatter?.points.some(({ code }) => code !== 'E92000001') &&
    [x, y].some(({ areaData }) => areaData.some(({ areaCode }) => areaCode !== 'E92000001'))
  )
    return undefined;
  return scatter;
}
