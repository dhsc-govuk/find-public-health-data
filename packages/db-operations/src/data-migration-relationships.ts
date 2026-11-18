import { z } from '@fphd/config';

import {
  assertValidIndicatorRelationships,
  indicatorTopicFileSchema,
} from './indicator-topic-file.ts';

export const dataMigrationRelationshipsSchema = indicatorTopicFileSchema.extend({
  indicators: z.array(z.number().int().positive()),
});

export type DataMigrationRelationships = z.infer<typeof dataMigrationRelationshipsSchema>;

export function parseDataMigrationRelationships(value: unknown): DataMigrationRelationships {
  const result = dataMigrationRelationshipsSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid data migration relationships:\n${z.prettifyError(result.error)}`);
  }
  assertValidIndicatorRelationships(result.data);
  const declared = new Set(result.data.indicators);
  if (declared.size !== result.data.indicators.length) {
    throw new Error('Data migration relationship coverage contains duplicate indicators');
  }
  const outsideCoverage = [
    ...result.data.indicatorTopics.map(({ fingertipsId }) => fingertipsId),
    ...result.data.indicatorSubtopics.map(({ fingertipsId }) => fingertipsId),
    ...result.data.areaContextIndicators,
    ...result.data.indicatorClassifications.map(({ fingertipsId }) => fingertipsId),
    ...Object.keys(result.data.indicatorDataUpdatedAt).map(Number),
  ].filter((id) => !declared.has(id));
  if (outsideCoverage.length > 0) {
    throw new Error(
      `Data migration relationships name indicators outside coverage: ${[...new Set(outsideCoverage)].join(', ')}`,
    );
  }
  return result.data;
}
