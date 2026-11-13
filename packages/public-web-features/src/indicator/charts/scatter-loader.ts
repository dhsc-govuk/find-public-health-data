import { sameSegment } from '../data.ts';
import type { SelectedIndicator } from '../loader.ts';
import { pairedObservations, scatterPair } from './chart-data.ts';

export function loadScatterComparison(selected: SelectedIndicator[], params: URLSearchParams) {
  const [x, y] = scatterPair(selected, params);
  if (!x || !y) return undefined;
  return { points: pairedObservations(x.areaData, y.areaData) };
}

export type ScatterComparison = NonNullable<ReturnType<typeof loadScatterComparison>>;

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
