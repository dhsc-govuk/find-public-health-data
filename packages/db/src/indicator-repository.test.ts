import { describe, expect, it } from 'vitest';
import { completeIndicatorDetail, type FoundIndicatorDetail } from './indicator-repository.ts';

const found: FoundIndicatorDetail = {
  goal: null,
  shortId: 108,
  slug: 'under-75-mortality-rate-from-all-causes',
  name: 'Under 75 mortality rate from all causes',
  valueType: 'Directly standardised rate',
  unit: null,
  yearType: null,
  updateFrequency: 'annually',
  updateFrequencyReason: null,
  updateFrequencyText: null,
  updateFrequencyYears: null,
  polarity: 'lower-is-better',
  ciMethod: null,
  ciConfidenceLevel: null,
  comparatorMethod: null,
  dataUpdatedAt: null,
  firstPublishedAt: '2026-04-20T16:25:18.000Z',
  lastPublishedAt: '2026-04-20T16:25:18.000Z',
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
  unanswered: [],
};

describe('completeIndicatorDetail', () => {
  it('returns the detail without its unanswered list, keeping a null unit as no unit', () => {
    const { unanswered: _unanswered, ...detail } = found;

    expect(completeIndicatorDetail(found)).toEqual(detail);
  });

  it.each([
    ['value type', { valueType: null, unanswered: ['valueType' as const] }],
    ['unit', { unanswered: ['unit' as const] }],
    ['polarity', { polarity: null, unanswered: ['polarity' as const] }],
  ])('returns undefined for a detail with no %s', (_question, missing) => {
    expect(completeIndicatorDetail({ ...found, ...missing })).toBeUndefined();
  });

  it('completes an indicator imported without an update frequency', () => {
    expect(
      completeIndicatorDetail({
        ...found,
        updateFrequency: null,
        unanswered: ['updateFrequency'],
      }),
    ).toMatchObject({ updateFrequency: null });
  });
});
