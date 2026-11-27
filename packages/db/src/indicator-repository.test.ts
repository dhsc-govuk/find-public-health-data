import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';

import {
  completeIndicatorDetail,
  type FoundIndicatorDetail,
  methodologyShown,
} from './indicator-repository.ts';

const found: FoundIndicatorDetail = {
  goal: null,
  shortId: 108,
  slug: 'under-75-mortality-rate-from-all-causes',
  name: 'Under 75 mortality rate from all causes',
  valueType: 'Directly standardised rate',
  valueMeasure: null,
  unit: null,
  yearType: null,
  timePeriods: null,
  rollingFrequency: null,
  valuesCumulative: null,
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
  numeratorDisclosureControl: null,
  denominatorDefinition: null,
  denominatorDisclosureControl: null,
  caveats: null,
  notes: null,
  dataSource: null,
  numeratorSources: [],
  denominatorSources: [],
  dataValues: [],
  areaTypes: [],
  topics: [],
  classifications: [],
  updateSummaries: [],
  publishedGroupings: [],
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

describe('methodologyShown', () => {
  const proportion = VALUE_TYPE_IDS.proportion;

  it("shows the value type's standard method when the publisher used it", () => {
    expect(
      methodologyShown({ valueTypeId: proportion, standardMethodUsed: true, methodology: null }),
    ).toBe(
      'The numerator is divided by the denominator. It can then be multiplied by 100 to be presented as a percentage.',
    );
  });

  it.each([false, null])(
    "shows the publisher's own methodology when the standard method answer is %s",
    (standardMethodUsed) => {
      expect(
        methodologyShown({ valueTypeId: proportion, standardMethodUsed, methodology: 'Our own' }),
      ).toBe('Our own');
    },
  );

  it('shows nothing for a standard method its value type does not have', () => {
    expect(
      methodologyShown({
        valueTypeId: VALUE_TYPE_IDS.score,
        standardMethodUsed: true,
        methodology: null,
      }),
    ).toBeNull();
  });
});
