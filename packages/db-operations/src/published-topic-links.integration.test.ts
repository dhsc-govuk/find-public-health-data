import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseIndicatorTopicFile } from './indicator-topic-file.ts';
import { applyIndicatorTopics } from './indicator-topic-import.ts';

const { SYSTEM_USER_IDS } = schema;

const ACTOR = SYSTEM_USER_IDS.pholioMigration;

let database: TestDb;
let sql: postgres.Sql;

beforeAll(async () => {
  database = await createTestDb({ template: 'seeded' });
  sql = database.sql;
});

afterAll(async () => {
  await database.drop();
});

describe('published workbook topic links', () => {
  it('applies explicit memberships to imported Fingertips indicators', async () => {
    const path = fileURLToPath(new URL('../data/published-indicator-topics.json', import.meta.url));
    const file = parseIndicatorTopicFile(JSON.parse(readFileSync(path, 'utf-8')));
    const summary = await applyIndicatorTopics(database.db, file);
    const [row] = await sql<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM indicator_version_topic`;

    expect(summary.unknownTopics).toEqual([]);
    expect(summary.links).toBe(14);
    expect(summary.subtopicLinks).toBe(15);
    expect(row?.count).toBe(summary.links);
  });
});

describe('an indicator with only a draft', () => {
  it.each(['2026-01-02T03:04:05', '2026-01-02T03:04:05Z'])(
    'takes its memberships and data timestamp %s on the draft',
    async (timestamp) => {
      const [topic] = await sql<{ id: string }[]>`SELECT id FROM topic LIMIT 1`;
      const [identity] = await sql<{ id: string; short_id: number }[]>`
      INSERT INTO indicator DEFAULT VALUES RETURNING id, short_id
    `;
      const [draft] = await sql<{ version_id: string }[]>`
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      VALUES (${identity?.id ?? ''}, 'Draft only', ${`draft-only-${timestamp.endsWith('Z') ? 'utc' : 'local'}`}, ${ACTOR}, ${ACTOR})
      RETURNING id AS version_id
    `;
      if (!topic || !identity || !draft) throw new Error('the fixture was not written');

      const summary = await applyIndicatorTopics(
        database.db,
        parseIndicatorTopicFile({
          indicatorTopics: [{ topicId: topic.id, fingertipsId: identity.short_id }],
          indicatorDataUpdatedAt: { [identity.short_id]: timestamp },
        }),
      );
      const links = await sql<{ topic_id: string }[]>`
      SELECT topic_id FROM indicator_version_topic WHERE indicator_version_id = ${draft.version_id}
    `;
      const [updated] = await sql<{ data_updated_at: Date | null }[]>`
      SELECT data_updated_at FROM indicator WHERE id = ${identity.id}
    `;

      expect(summary).toMatchObject({ links: 1, timestamps: 1, unknownIndicators: [] });
      expect(links.map(({ topic_id }) => topic_id)).toEqual([topic.id]);
      expect(updated?.data_updated_at?.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    },
  );
});
