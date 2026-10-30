import { type Database, schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listTagOptions } from './tag-repository.ts';

const ACTOR = schema.SYSTEM_USER_IDS.testSeed;

let testDb: TestDb;
let db: Database;

/** Each inserted row's id by the name the page shows. */
const ids = new Map<string, string>();

function idOf(name: string): string {
  const id = ids.get(name);
  if (id === undefined) throw new Error(`inserted nothing named ${name}`);
  return id;
}

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;

  const topics = await db
    .insert(schema.topic)
    .values(
      [
        { slug: 'smoking', title: 'Smoking', description: 'About smoking.' },
        { slug: 'alcohol', title: 'Alcohol', description: 'About alcohol.' },
      ].map((record) => ({ ...record, createdBy: ACTOR, updatedBy: ACTOR })),
    )
    .returning({ id: schema.topic.id, name: schema.topic.title });
  const classifications = await db
    .insert(schema.classification)
    .values([
      { dimension: 'indicator_type', slug: 'indicator-type-outcome', name: 'Outcome' },
      {
        dimension: 'indicator_type',
        slug: 'indicator-type-healthcare-utilisation',
        name: 'Healthcare utilisation',
      },
      { dimension: 'life_stage', slug: 'life-stage-children', name: 'Children' },
      { dimension: 'life_stage', slug: 'life-stage-older-people', name: 'Older people' },
      {
        dimension: 'framework',
        slug: 'framework-public-health-outcomes-framework',
        name: 'Public Health Outcomes Framework',
      },
      { dimension: 'population', slug: 'population-all-ages', name: 'All ages' },
      { dimension: 'inequality', slug: 'inequality-sex', name: 'Sex' },
    ])
    .returning({ id: schema.classification.id, name: schema.classification.name });

  for (const { id, name } of [...topics, ...classifications]) ids.set(name, id);
  const children = await db
    .insert(schema.subtopic)
    .values([
      { topicId: idOf('Smoking'), slug: 'prevention', title: 'Prevention' },
      { topicId: idOf('Alcohol'), slug: 'treatment', title: 'Treatment' },
    ])
    .returning({ id: schema.subtopic.id, name: schema.subtopic.title });
  for (const { id, name } of children) ids.set(name, id);
});

afterAll(async () => {
  await testDb.drop();
});

describe('listTagOptions', () => {
  it('lists the topics and each tagged dimension by name, leaving the other dimensions out', async () => {
    const option = (name: string) => ({ id: idOf(name), name });

    await expect(listTagOptions(db)).resolves.toEqual({
      topics: [option('Alcohol'), option('Smoking')],
      subtopics: [
        { ...option('Prevention'), topicId: idOf('Smoking') },
        { ...option('Treatment'), topicId: idOf('Alcohol') },
      ],
      indicatorTypes: [option('Healthcare utilisation'), option('Outcome')],
      lifeStages: [option('Children'), option('Older people')],
      frameworks: [option('Public Health Outcomes Framework')],
    });
  });
});
