import type { CatalogueEntry } from '@fphd/db';
import { describe, expect, it } from 'vitest';

import { toIndicatorDetail } from './indicators.ts';

const entry = {
  detail: {
    shortId: 108,
    slug: 'under-75-mortality',
    name: 'Under 75 mortality',
    valueType: 'Directly standardised rate',
    unit: 'per 100,000',
    polarity: 'lower-is-better',
    updateFrequency: 'annually',
    dataUpdatedAt: null,
    topics: [
      {
        slug: 'heart-and-kidney-disease',
        title: 'Heart and kidney disease',
        subtopics: [{ slug: 'stroke', title: 'Stroke', isPrimary: true }],
      },
    ],
    classifications: [{ dimension: 'life_stage', slug: 'life-stage-adults', name: 'Adults' }],
  },
  levels: [],
  periods: { count: 0, earliest: null, latest: null },
  dimensions: [
    { standardDimension: 'sex', typeSlug: null, valueSlug: 'm' },
    { standardDimension: 'sex', typeSlug: null, valueSlug: 'f' },
    { standardDimension: 'deprivation', typeSlug: 'imd2019-lsoa21-england', valueSlug: '1' },
    { standardDimension: null, typeSlug: 'tenure-4', valueSlug: 'owner-occupied' },
  ],
  notes: [],
} as unknown as CatalogueEntry;

describe('toIndicatorDetail', () => {
  it('lists topics, subtopics and classifications as tags', () => {
    expect(toIndicatorDetail(entry).tags).toEqual([
      {
        slug: 'heart-and-kidney-disease',
        name: 'Heart and kidney disease',
        type: 'topic',
        parent: null,
      },
      {
        slug: 'heart-and-kidney-disease-stroke',
        name: 'Stroke',
        type: 'subtopic',
        parent: 'heart-and-kidney-disease',
      },
      { slug: 'life-stage-adults', name: 'Adults', type: 'life-stage', parent: null },
    ]);
  });

  it('lists the dimensions the data uses, with schemes only for those that have them', () => {
    expect(toIndicatorDetail(entry).dimensions).toEqual([
      { slug: 'sex', schemes: [], values: ['f', 'm'] },
      { slug: 'deprivation', schemes: ['imd2019-lsoa21-england'], values: ['1'] },
      { slug: 'tenure-4', schemes: [], values: ['owner-occupied'] },
    ]);
  });
});
