import { readFileSync } from 'node:fs';

import { listTopicsForIndicator, schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { importCoreData } from './core-data.ts';
import { parseIndicatorTopicFile } from './indicator-topic-file.ts';
import { applyIndicatorTopics } from './indicator-topic-import.ts';

const { SYSTEM_USER_IDS } = schema;

const source = parseIndicatorTopicFile(
  JSON.parse(
    readFileSync(new URL('../data/published-indicator-topics.json', import.meta.url), 'utf8'),
  ),
);
const only = (ids: number[]) =>
  parseIndicatorTopicFile({
    indicators: ids,
    areaContextIndicators: source.areaContextIndicators.filter((id) => ids.includes(id)),
    indicatorTopics: source.indicatorTopics.filter(({ fingertipsId }) =>
      ids.includes(fingertipsId),
    ),
    indicatorSubtopics: source.indicatorSubtopics.filter(({ fingertipsId }) =>
      ids.includes(fingertipsId),
    ),
    indicatorClassifications: source.indicatorClassifications.filter(({ fingertipsId }) =>
      ids.includes(fingertipsId),
    ),
  });

let database: TestDb;
let sql: postgres.Sql;
beforeAll(async () => {
  database = await createTestDb({ template: 'seeded' });
  sql = database.sql;
});
afterAll(async () => {
  await database.drop();
});

describe('the V2 taxonomy import', () => {
  it('does not expose draft subtopic placements through the published view', async () => {
    const [identity] = await sql<{ id: string }[]>`SELECT id FROM indicator WHERE short_id = 108`;
    const [child] = await sql<
      { id: string; topic_id: string }[]
    >`SELECT id, topic_id FROM subtopic WHERE slug = 'dementia'`;
    const [draft] = await sql<
      { id: string }[]
    >`INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by) VALUES (${identity?.id ?? ''}, 'Taxonomy draft only', 'taxonomy-draft-only', ${SYSTEM_USER_IDS.pholioMigration}, ${SYSTEM_USER_IDS.pholioMigration}) RETURNING id`;
    await sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id, is_primary) VALUES (${draft?.id ?? ''}, ${child?.topic_id ?? ''}, true)`;
    await sql`INSERT INTO indicator_version_subtopic (indicator_version_id, topic_id, subtopic_id, is_primary) VALUES (${draft?.id ?? ''}, ${child?.topic_id ?? ''}, ${child?.id ?? ''}, true)`;
    expect(
      await sql`SELECT subtopic_id FROM published.indicator_subtopic WHERE indicator_id = ${identity?.id ?? ''} AND subtopic_id = ${child?.id ?? ''}`,
    ).toEqual([]);
  });

  it('refuses a subtopic attached to a different topic', async () => {
    const [version] = await sql<
      { id: string; topic_id: string }[]
    >`SELECT v.id, t.topic_id FROM indicator i JOIN current_published_version v ON v.indicator_id = i.id JOIN indicator_version_topic t ON t.indicator_version_id = v.id WHERE i.short_id = 108`;
    const [child] = await sql<{ id: string }[]>`SELECT id FROM subtopic WHERE slug = 'dementia'`;
    await expect(
      sql`INSERT INTO indicator_version_subtopic (indicator_version_id, topic_id, subtopic_id) VALUES (${version?.id ?? ''}, ${version?.topic_id ?? ''}, ${child?.id ?? ''})`,
    ).rejects.toThrow(/indicator_version_subtopic_subtopic_fk/);
  });
  it('imports only the 19 V2 topics and their 92 subtopics', async () => {
    expect((await sql`SELECT id FROM published.topic`).length).toBe(19);
    expect((await sql`SELECT id FROM topic`).length).toBe(19);
    expect((await sql`SELECT id FROM published.subtopic`).length).toBe(92);
    const imported = await importCoreData(sql);
    expect(imported.subtopics).toEqual({
      summary: { inserted: 0, updated: 0, unchanged: 92 },
      orphaned: [],
    });
    expect(imported.topics.summary).toEqual({ inserted: 0, updated: 0, unchanged: 19 });
  });

  it('reports subtopics missing from the file without deleting them', async () => {
    const [parent] = await sql<{ id: string }[]>`SELECT id FROM topic ORDER BY id LIMIT 1`;
    const [extra] = await sql<
      { id: string }[]
    >`INSERT INTO subtopic (topic_id, slug, title) VALUES (${parent?.id ?? ''}, 'unlisted-subtopic', 'Unlisted subtopic') RETURNING id`;
    const imported = await importCoreData(sql);
    expect(imported.subtopics.orphaned).toEqual([
      { id: extra?.id, topicId: parent?.id, slug: 'unlisted-subtopic', title: 'Unlisted subtopic' },
    ]);
    expect(await sql`SELECT id FROM subtopic WHERE id = ${extra?.id ?? ''}`).toHaveLength(1);
    await sql`DELETE FROM subtopic WHERE id = ${extra?.id ?? ''}`;
  });

  it('retains two subtopic placements within a single primary topic', async () => {
    const [indicator] = await sql<{ id: string }[]>`SELECT id FROM indicator WHERE short_id = 108`;
    const topics = await listTopicsForIndicator(database.db, indicator?.id ?? '');
    expect(topics).toEqual([
      {
        slug: 'mortality-and-life-expectancy',
        title: 'Mortality and life expectancy',
        isPrimary: true,
        subtopics: [
          {
            slug: 'all-cause-and-winter-mortality',
            title: 'All-cause and winter mortality',
            isPrimary: false,
          },
          {
            slug: 'preventable-mortality-and-deaths-under-75',
            title: 'Preventable mortality and deaths under 75',
            isPrimary: true,
          },
        ],
      },
    ]);
  });

  it('removes stale topic and classification guesses from area-context indicators without changing observations', async () => {
    const [before] = await sql<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM observation o JOIN indicator i ON i.id = o.indicator_id WHERE i.short_id = 92708`;
    await sql`INSERT INTO indicator_version_topic (indicator_version_id, topic_id) SELECT v.id, t.id FROM indicator i JOIN current_published_version v ON v.indicator_id = i.id CROSS JOIN topic t WHERE i.short_id = 92708 AND t.slug = 'diabetes'`;
    await sql`INSERT INTO indicator_version_classification (indicator_version_id, classification_id) SELECT v.id, c.id FROM indicator i JOIN current_published_version v ON v.indicator_id = i.id CROSS JOIN classification c WHERE i.short_id = 92708 AND c.slug = 'indicator-type-outcome'`;
    const applied = await applyIndicatorTopics(database.db, only([92708]));
    expect(applied).toMatchObject({
      links: 0,
      subtopicLinks: 0,
      classificationLinks: 0,
      unknownIndicators: [],
    });
    const [after] = await sql<
      { context: boolean; topics: number; classifications: number; observations: number }[]
    >`
      SELECT v.is_area_context AS context,
        (SELECT count(*)::int FROM indicator_version_topic t WHERE t.indicator_version_id = v.id) AS topics,
        (SELECT count(*)::int FROM indicator_version_classification c WHERE c.indicator_version_id = v.id) AS classifications,
        (SELECT count(*)::int FROM observation o WHERE o.indicator_id = i.id) AS observations
      FROM indicator i JOIN current_published_version cpv ON cpv.indicator_id = i.id JOIN indicator_version v ON v.id = cpv.id WHERE i.short_id = 92708
    `;
    expect(after).toEqual({
      context: true,
      topics: 0,
      classifications: 0,
      observations: before?.count,
    });
    expect(after?.observations).toBeGreaterThan(0);
  });

  it('imports life stage and programme tags without deriving them from a title', async () => {
    const [identity] = await sql<
      { id: string }[]
    >`INSERT INTO indicator (short_id) VALUES (383) RETURNING id`;
    await sql`INSERT INTO indicator_version (indicator_id, status, published_at, name, slug, created_by, updated_by) VALUES (${identity?.id ?? ''}, 'published', now(), 'Taxonomy dementia fixture', 'taxonomy-dementia-fixture', ${SYSTEM_USER_IDS.pholioMigration}, ${SYSTEM_USER_IDS.pholioMigration})`;
    await applyIndicatorTopics(database.db, only([383]));
    const rows = await sql<{ dimension: string; name: string }[]>`
      SELECT c.dimension, c.name FROM published.indicator_classification ic JOIN published.classification c ON c.id = ic.classification_id WHERE ic.indicator_id = ${identity?.id ?? ''} ORDER BY c.dimension
    `;
    expect(rows).toEqual([
      { dimension: 'framework', name: 'MSF dementia and frailty (suggested)' },
      { dimension: 'indicator_type', name: 'Outcome' },
      { dimension: 'life_stage', name: 'Older people' },
    ]);
    const [flags] = await sql<
      { has_life_stage: boolean; has_framework: boolean }[]
    >`SELECT has_life_stage, has_framework FROM indicator_version WHERE indicator_id = ${identity?.id ?? ''}`;
    expect(flags).toEqual({ has_life_stage: true, has_framework: true });
  });
});
