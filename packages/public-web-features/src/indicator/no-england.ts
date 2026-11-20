import type { IndicatorAreaData, IndicatorObservation } from '@fphd/public-api-features/contract';
import { normalizePublicLevels, publicGeographyLevels } from '../geography/groups.ts';
import { filterObservations, type PeriodType } from './data.ts';
import { ENGLAND_CODE, requestedAreaCodes, requestedAreaLevels } from './paths.ts';

/**
 * The geography levels an indicator page opens on, in order of preference, when the indicator has
 * no England value and nothing is chosen. Each holds few enough areas to show them all.
 */
export const NO_ENGLAND_LEVELS = ['Statistical regions', 'NHS regions'] as const;

/** What the Indicator and Inequalities tabs say when there is no England value and nothing else to show. */
export const NO_ENGLAND_MESSAGE =
  'This indicator has no England-level figure. Choose areas to see data.';

/**
 * England's observations, or none when the indicator has no England value. The API answers a
 * request for England with an empty list rather than leaving England out.
 */
export function englandObservations(
  areaData: Pick<IndicatorAreaData, 'areaCode' | 'observations'>[],
): IndicatorObservation[] {
  return areaData.find(({ areaCode }) => areaCode === ENGLAND_CODE)?.observations ?? [];
}

/**
 * Whether a page address chooses nothing the indicator has: no area, and no level among
 * `indicatorLevels`, the indicator's display groups. Only then can the default level apply.
 */
export function choosesNothing(params: URLSearchParams, indicatorLevels: string[]): boolean {
  const levels = normalizePublicLevels(requestedAreaLevels(params));
  return (
    requestedAreaCodes(params).length === 0 &&
    !publicGeographyLevels(indicatorLevels).some((level) => levels.includes(level))
  );
}

/**
 * The observations the Sex options are read from: England's, or with no England value those of
 * every area shown. Only those of the period type shown count, so a sex published only in the
 * other period type is not offered.
 */
export function sexObservations(
  areaData: Pick<IndicatorAreaData, 'areaCode' | 'observations'>[],
  periodType: PeriodType = 'all',
): IndicatorObservation[] {
  const england = englandObservations(areaData);
  return filterObservations(
    england.length > 0 ? england : areaData.flatMap(({ observations }) => observations),
    { periodType },
  );
}

/**
 * The level a page opens on when nothing is chosen: none when England has a value, otherwise the
 * first of `NO_ENGLAND_LEVELS` that the indicator has data for.
 */
export function noEnglandLevel(
  england: Pick<IndicatorAreaData, 'observations'> | undefined,
  levels: string[],
): string | undefined {
  if (england && england.observations.length > 0) return undefined;
  return NO_ENGLAND_LEVELS.find((level) => levels.includes(level));
}

/**
 * The observations the page summary describes. "Period covered" spans England's values, or with
 * no England value those of every area shown. The trend is England's; it is null with no England
 * value, whatever areas are shown, as each area's own trend is in the table.
 */
export function summaryObservations(
  areaData: Pick<IndicatorAreaData, 'areaCode' | 'observations'>[],
): { period: IndicatorObservation[]; trend: IndicatorObservation[] | null } {
  const england = englandObservations(areaData);
  if (england.length > 0) return { period: england, trend: england };
  return {
    period: areaData
      .filter(({ areaCode }) => areaCode !== ENGLAND_CODE)
      .flatMap(({ observations }) => observations),
    trend: null,
  };
}
