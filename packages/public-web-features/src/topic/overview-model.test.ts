import { expect, it } from 'vitest';
import type { SelectedIndicator } from '../indicator/loader.ts';
import { topicOverviewModel } from './overview-model.ts';

const selected = {
  detail: {
    shortId: 1,
    name: 'Indicator',
    slug: 'indicator',
    unit: '%',
    yearType: null,
    polarity: 'lower-is-better',
    definition: 'Unused metadata',
  },
  areaData: [
    {
      areaCode: 'E12000001',
      areaName: 'North East',
      observations: [2023, 2024].map((year, index) => ({
        fromDate: `${year}-01-01`,
        toDate: `${year}-12-31`,
        value: index === 0 ? 10 : 0,
        count: null,
        numerator: index === 0 ? 100 : null,
        dimensions: [],
        notes: [],
      })),
    },
  ],
} as unknown as SelectedIndicator;

it('returns the displayed headline and available measures without raw data or metadata', () => {
  const [highlight] = topicOverviewModel([selected]);
  expect(highlight).toMatchObject({
    shortId: 1,
    name: 'Indicator',
    slug: 'indicator',
    unit: '%',
    areaName: 'North East',
    period: '2024',
    value: 0,
    hasTrend: true,
    measures: [{ label: 'Numerator', value: null }],
  });
  expect(JSON.stringify(highlight)).not.toMatch(/observations|definition|Unused metadata/);
});

it('keeps the Count and England fallbacks when a highlight has no observations', () => {
  expect(topicOverviewModel([{ ...selected, areaData: [] }])[0]).toMatchObject({
    areaName: 'England',
    period: 'No data',
    value: null,
    hasTrend: false,
    measures: [{ label: 'Count', value: null }],
  });
});
