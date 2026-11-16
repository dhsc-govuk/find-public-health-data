import { type Database, schema } from '@fphd/db';
import {
  type ClassificationDimension,
  TAGGING_DIMENSIONS,
} from '@fphd/utils/classification-dimension';
import { asc, inArray } from 'drizzle-orm';

import type { TagOptions } from './contract.ts';

const { classification, subtopic, topic } = schema;

/**
 * Every topic and tagging classification, each list in the order the page shows it: topics and
 * subtopics by name, and classifications in the order of the core data file, then by name.
 */
export async function listTagOptions(db: Database): Promise<TagOptions> {
  const [topics, subtopics, classifications] = await Promise.all([
    db.select({ id: topic.id, name: topic.title }).from(topic).orderBy(asc(topic.title)),
    db
      .select({ id: subtopic.id, name: subtopic.title, topicId: subtopic.topicId })
      .from(subtopic)
      .orderBy(asc(subtopic.title)),
    db
      .select({
        id: classification.id,
        name: classification.name,
        dimension: classification.dimension,
      })
      .from(classification)
      .where(inArray(classification.dimension, [...TAGGING_DIMENSIONS]))
      .orderBy(asc(classification.position), asc(classification.name)),
  ]);
  const ofDimension = (dimension: ClassificationDimension) =>
    classifications
      .filter((row) => row.dimension === dimension)
      .map(({ id, name }) => ({ id, name }));

  return {
    topics,
    subtopics,
    indicatorTypes: ofDimension('indicator_type'),
    frameworks: ofDimension('framework'),
    lifeStages: ofDimension('life_stage'),
    riskFactors: ofDimension('risk_factor'),
  };
}
