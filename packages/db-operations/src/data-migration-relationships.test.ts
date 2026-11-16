import { describe, expect, it } from 'vitest';

import { parseDataMigrationRelationships } from './data-migration-relationships.ts';

const relationships = {
  approval: {
    approvedBy: 'reviewer',
    approvedAt: '2026-09-21T10:00:00Z',
    basis: 'Reviewed topics',
  },
  indicators: [108],
  indicatorTopics: [{ topicId: '11111111-1111-7111-8111-111111111111', fingertipsId: 108 }],
  indicatorDataUpdatedAt: {},
  indicatorClassifications: [],
};

describe('parseDataMigrationRelationships', () => {
  it('accepts pointers within the reviewed indicator coverage', () => {
    expect(parseDataMigrationRelationships(relationships)).toEqual({
      ...relationships,
      areaContextIndicators: [],
      indicatorSubtopics: [],
    });
  });
  it('refuses duplicate coverage IDs', () => {
    expect(() =>
      parseDataMigrationRelationships({ ...relationships, indicators: [108, 108] }),
    ).toThrow('coverage contains duplicate indicators');
  });
  it.each([
    { indicatorTopics: [{ ...relationships.indicatorTopics[0], fingertipsId: 109 }] },
    {
      indicatorClassifications: [
        { classificationId: '11111111-1111-7111-8111-111111111111', fingertipsId: 109 },
      ],
    },
    { indicatorDataUpdatedAt: { 109: '2026-01-02T03:04:05Z' } },
    { areaContextIndicators: [109] },
  ])('refuses relationship pointers outside declared coverage: %j', (pointers) => {
    expect(() => parseDataMigrationRelationships({ ...relationships, ...pointers })).toThrow(
      'relationships name indicators outside coverage: 109',
    );
  });
});
