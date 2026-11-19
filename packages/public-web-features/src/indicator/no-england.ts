import type { IndicatorAreaData, IndicatorObservation } from '@fphd/public-api-features/contract';
import { ENGLAND_CODE } from './paths.ts';

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
