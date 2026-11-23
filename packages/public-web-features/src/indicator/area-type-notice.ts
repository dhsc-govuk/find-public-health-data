import type { IndicatorAreaData, IndicatorDetail } from '@fphd/public-api-features/contract';
import { englandObservations } from './no-england.ts';

/**
 * What a Geographies panel says about the area types an indicator has no data for:
 * `england-only` when England has a value and the indicator's data covers no other area, and
 * `others-unavailable` when the indicator lacks some of the area types the public site offers.
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
 * area catalogue holds (`catalogueLevels`). `areaTypes` are all the area types its data covers,
 * including those the public site doesn't offer, such as GP practices and trusts. An indicator
 * with data for those alone, or without an England value, has no notice.
 */
export function areaTypeNotice({
  catalogueLevels,
  indicatorLevels,
  areaTypes,
  areaData,
}: {
  catalogueLevels: string[];
  indicatorLevels: string[];
  areaTypes: Pick<IndicatorDetail['areaTypes'][number], 'name'>[];
  areaData: Pick<IndicatorAreaData, 'areaCode' | 'observations'>[];
}): AreaTypeNotice | undefined {
  if (indicatorLevels.length === 0) {
    const coversEnglandAlone = areaTypes.length === 1 && areaTypes[0]?.name === 'England';
    return coversEnglandAlone && englandObservations(areaData).some(({ value }) => value !== null)
      ? 'england-only'
      : undefined;
  }
  return NOTICED_LEVELS.some(
    (level) => catalogueLevels.includes(level) && !indicatorLevels.includes(level),
  )
    ? 'others-unavailable'
    : undefined;
}
