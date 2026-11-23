import type { IndicatorAreaData } from '@fphd/public-api-features/contract';
import { englandObservations } from './no-england.ts';

/**
 * What a Geographies panel says about the area types an indicator has no data for:
 * `england-only` when England is the only geography with a value, and `others-unavailable` when
 * the indicator lacks some of the area types the public site offers.
 */
export type AreaTypeNotice = 'england-only' | 'others-unavailable';

export const ENGLAND_ONLY_MESSAGE = 'Data only available for England';
export const OTHER_AREA_TYPES_UNAVAILABLE_MESSAGE = 'Data unavailable for other area types';

/**
 * The public area types whose absence the Geographies panel points out. An
 * indicator that lacks only MSOAs has no notice.
 */
const NOTICED_LEVELS = [
  'Integrated care boards (ICBs)',
  'Upper-tier local authorities',
  'Lower-tier local authorities',
  'NHS regions',
  'Statistical regions',
];

/**
 * The notice for an indicator with data for `indicatorLevels`, out of the public area types the
 * area catalogue holds (`catalogueLevels`). An indicator with no area types and no England value
 * has no notice, as it has no data to show for any geography.
 */
export function areaTypeNotice({
  catalogueLevels,
  indicatorLevels,
  areaData,
}: {
  catalogueLevels: string[];
  indicatorLevels: string[];
  areaData: Pick<IndicatorAreaData, 'areaCode' | 'observations'>[];
}): AreaTypeNotice | undefined {
  if (indicatorLevels.length === 0) {
    return englandObservations(areaData).some(({ value }) => value !== null)
      ? 'england-only'
      : undefined;
  }
  return NOTICED_LEVELS.some(
    (level) => catalogueLevels.includes(level) && !indicatorLevels.includes(level),
  )
    ? 'others-unavailable'
    : undefined;
}
