import { pairedAreaValues } from '@fphd/utils/observation-series';
import { expandedPeriodLabel, periodLabel, shortPeriodLabel } from '@fphd/utils/period-label';
import { type ConfidenceLevel, sameSegment, trendSeries } from '../data.ts';
import type { IndicatorAreaData, IndicatorDetail, IndicatorObservation } from '../loader.ts';

export const englandCode = 'E92000001';
export const quintileColours = ['#c5eee9', '#84cac2', '#27a096', '#027068', '#004842'] as const;

export function quintileParam(indicator: number | 'compare') {
  return `quintile-${indicator}`;
}

export function areaQuintile(
  value: number | null | undefined,
  cutoffs: number[] | null | undefined,
) {
  if (value == null || !cutoffs) return null;
  return cutoffs.filter((cutoff) => value > cutoff).length + 1;
}

export function quintileLabel(group: number) {
  return `Quintile ${group}${group === 1 ? ' (lowest)' : group === 5 ? ' (highest)' : ''}`;
}

export function periodKey({ fromDate, toDate }: Pick<IndicatorObservation, 'fromDate' | 'toDate'>) {
  return `${fromDate}|${toDate}`;
}

export function bounds(observation: IndicatorObservation | undefined, confidence: ConfidenceLevel) {
  if (!observation || confidence === 'none') return null;
  const lower = confidence === '95' ? observation.lowerCi95 : observation.lowerCi998;
  const upper = confidence === '95' ? observation.upperCi95 : observation.upperCi998;
  return lower === null || upper === null ? null : ([lower, upper] as const);
}

export function errorOffsets(value: number | null, interval: ReturnType<typeof bounds>) {
  if (value === null || !interval) return undefined;
  return [Math.max(0, value - interval[0]), Math.max(0, interval[1] - value)] as [number, number];
}

export function alignedSeries(areas: IndicatorAreaData[]) {
  const first = areas.find(({ observations }) => observations.some(({ value }) => value !== null));
  const reference = first && trendSeries(first.observations)[0];
  return areas.map(({ areaCode, areaName, observations }) => ({
    code: areaCode,
    name: areaName,
    observations: new Map(
      observations
        .filter((observation) => reference && sameSegment(observation, reference))
        .map((observation) => [periodKey(observation), observation]),
    ),
  }));
}

export function sparklineModel(areas: IndicatorAreaData[], yearType: IndicatorDetail['yearType']) {
  const primary = alignedSeries(areas).find(({ observations }) => observations.size > 0);
  return {
    areaName: primary?.name ?? areas[0]?.areaName ?? 'England',
    points: [...(primary?.observations.values() ?? [])]
      .sort((a, b) => periodKey(a).localeCompare(periodKey(b)))
      .slice(-8)
      .map((observation) => ({
        label: expandedPeriodLabel(observation, yearType),
        shortLabel: shortPeriodLabel(observation, yearType),
        value: observation.value,
      })),
  };
}

export function chartPeriods(
  series: ReturnType<typeof alignedSeries>,
  yearType: IndicatorDetail['yearType'],
) {
  const observations = new Map(series.flatMap(({ observations }) => [...observations]));
  return [...observations]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, observation]) => ({
      key,
      label: periodLabel(observation, yearType),
    }));
}

export const pairedObservations = pairedAreaValues;

export function regression(points: { x: number; y: number }[]) {
  if (points.length < 3) return null;
  const meanX = points.reduce((sum, { x }) => sum + x, 0) / points.length;
  const meanY = points.reduce((sum, { y }) => sum + y, 0) / points.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const { x, y } of points) {
    xx += (x - meanX) ** 2;
    xy += (x - meanX) * (y - meanY);
    yy += (y - meanY) ** 2;
  }
  if (xx === 0 || yy === 0) return null;
  const slope = xy / xx;
  const rSquared = xy ** 2 / (xx * yy);
  return {
    rSquared,
    adjustedRSquared: 1 - ((1 - rSquared) * (points.length - 1)) / (points.length - 2),
    at: (x: number) => meanY + slope * (x - meanX),
  };
}

export function scatterPair<T extends { detail: { shortId: number } }>(
  indicators: T[],
  params: URLSearchParams,
) {
  const byId = new Map(indicators.map((entry) => [String(entry.detail.shortId), entry]));
  const x = byId.get(params.get('scatter-x') ?? '') ?? indicators[0];
  const y = byId.get(params.get('scatter-y') ?? '');
  return [x, y && y !== x ? y : indicators.find((entry) => entry !== x)] as const;
}
