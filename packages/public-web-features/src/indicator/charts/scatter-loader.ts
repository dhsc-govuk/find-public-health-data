import { pairedAreaSexValues } from '@fphd/utils/observation-series';
import { sameSegment } from '../data.ts';
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
  const [x, y] = scatterPair(selected, params);
  return pairedAreaSexValues(x?.areaData ?? [], y?.areaData ?? []);
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
  if (!sameSegment(first, second)) return undefined;
  if (
    [x, y].some(({ areaData }) =>
      areaData.some(({ observations }) => !observations.some(({ value }) => value !== null)),
    )
  )
    return undefined;
  const scatter = loadScatterComparison(selected, params);
  return !scatter?.points.some(({ code }) => code !== 'E92000001') &&
    [x, y].some(({ areaData }) => areaData.some(({ areaCode }) => areaCode !== 'E92000001'))
    ? undefined
    : scatter;
}
