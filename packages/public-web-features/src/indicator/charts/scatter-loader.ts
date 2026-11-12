import type { SelectedIndicator } from '../loader.ts';
import { pairedObservations, scatterPair } from './chart-data.ts';

export function loadScatterComparison(selected: SelectedIndicator[], params: URLSearchParams) {
  const [x, y] = scatterPair(selected, params);
  if (!x || !y) return undefined;
  return { points: pairedObservations(x.areaData, y.areaData) };
}

export type ScatterComparison = NonNullable<ReturnType<typeof loadScatterComparison>>;
