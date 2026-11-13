import type { IndicatorDetail, IndicatorObservation, SelectedIndicator } from './loader.ts';

/**
 * An indicator as the public API's detail answers it, published with a calendar year and no
 * sources, topics or area types, unless `overrides` say otherwise.
 */
export function indicatorDetail(
  shortId = 108,
  overrides: Partial<IndicatorDetail> = {},
): IndicatorDetail {
  return {
    shortId,
    slug: `indicator-${shortId}`,
    name: `Indicator ${shortId}`,
    valueType: 'Crude rate',
    unit: '%',
    yearType: { value: 'calendar', label: 'Calendar year' },
    updateFrequency: 'annually',
    updateFrequencyReason: null,
    polarity: 'higher-is-better',
    ciMethod: null,
    ciConfidenceLevel: '95',
    comparatorMethod: 'Confidence intervals overlapping reference value',
    dataUpdatedAt: null,
    firstPublishedAt: '2026-01-02T00:00:00.000Z',
    lastPublishedAt: '2026-01-02T00:00:00.000Z',
    definition: null,
    rationale: null,
    methodology: null,
    numeratorDefinition: null,
    denominatorDefinition: null,
    disclosureControl: null,
    caveats: null,
    notes: null,
    dataSource: null,
    numeratorSources: [],
    denominatorSources: [],
    areaTypes: [],
    topics: [],
    classifications: [],
    updateSummaries: [],
    ...overrides,
  };
}

export function observation(
  value = 12,
  dimensions: IndicatorObservation['dimensions'] = [],
): IndicatorObservation {
  return {
    fromDate: '2024-01-01',
    toDate: '2024-12-31',
    value,
    count: value * 100,
    numerator: null,
    denominator: null,
    lowerCi95: value - 1,
    upperCi95: value + 1,
    lowerCi998: value - 2,
    upperCi998: value + 2,
    notes: [],
    dimensions,
  };
}

export const sex = (value: string): IndicatorObservation['dimensions'][number] => ({
  type: 'Sex',
  value,
  dimensionClass: 'core',
  sortOrder: value === 'Female' ? 1 : 2,
});
export const deprivation: IndicatorObservation['dimensions'][number] = {
  type: 'Deprivation decile',
  value: 'Most deprived',
  dimensionClass: 'inequality',
  sortOrder: 1,
};

export function selected(shortId = 108): SelectedIndicator {
  return {
    detail: {
      shortId,
      name: `Indicator ${shortId}`,
      slug: `indicator-${shortId}`,
      unit: '%',
      yearType: null,
      polarity: 'higher-is-better',
      comparatorMethod: 'Confidence intervals overlapping reference value',
    } as IndicatorDetail,
    areaData: [
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [
          observation(40, [sex('Male')]),
          { ...observation(41, [sex('Male')]), fromDate: '2023-01-01', toDate: '2023-12-31' },
          observation(20, [sex('Female')]),
        ],
      },
      {
        areaCode: 'E06000052',
        areaName: 'Cornwall',
        observations: [
          observation(30, [sex('Female')]),
          observation(32, [sex('Female'), deprivation]),
        ],
      },
    ],
  };
}
