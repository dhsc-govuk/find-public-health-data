import { type Database, schema } from '@fphd/db';
import { auditEntriesFor, createTestDb, type TestDb } from '@fphd/db/testing';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { upsertTopics } from './topic-import.ts';

const { SYSTEM_USER_IDS, topic } = schema;

let testDb: TestDb;
let db: Database;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
});

afterAll(async () => {
  await testDb.drop();
});

const topicA: schema.TopicRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'topic-a',
  title: 'Topic A',
  description: 'The first topic.',
};

const topicB: schema.TopicRecord = {
  id: '00000000-0000-4000-8000-000000000002',
  slug: 'topic-b',
  title: 'Topic B',
  description: 'The second topic.',
};

async function requireRow(id: string) {
  const rows = await db
    .select({
      ...getTableColumns(topic),
      // Drizzle maps timestamptz to a millisecond-precision JS Date; the ::text form keeps
      // postgres's microseconds, so timestamp assertions can't alias across a fast run.
      updatedAtText: sql<string>`${topic.updatedAt}::text`,
    })
    .from(topic)
    .where(eq(topic.id, id));
  const row = rows[0];
  if (!row) {
    throw new Error(`No topic row found for id ${id}`);
  }
  return row;
}

describe('topics import (integration)', () => {
  it('inserts every row on a fresh import', async () => {
    const { summary, orphaned } = await upsertTopics(db, [topicA, topicB]);

    expect(summary).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    expect(orphaned).toEqual([]);

    const rows = await db.select().from(topic);
    expect(rows).toHaveLength(2);
  });

  it('records nothing in the audit log for the topics it inserts', async () => {
    expect(await auditEntriesFor(db, topicA.id)).toEqual([]);
  });

  it('writes the rows as the core data import', async () => {
    const rows = await db
      .select({ createdBy: topic.createdBy, updatedBy: topic.updatedBy })
      .from(topic);

    expect(rows).toEqual([
      { createdBy: SYSTEM_USER_IDS.coreDataImport, updatedBy: SYSTEM_USER_IDS.coreDataImport },
      { createdBy: SYSTEM_USER_IDS.coreDataImport, updatedBy: SYSTEM_USER_IDS.coreDataImport },
    ]);
  });

  it('is idempotent on a re-run, leaving updated_at untouched', async () => {
    const before = await requireRow(topicA.id);

    const { summary } = await upsertTopics(db, [topicA, topicB]);

    expect(summary).toEqual({ inserted: 0, updated: 0, unchanged: 2 });

    const after = await requireRow(topicA.id);
    expect(after.updatedAtText).toBe(before.updatedAtText);
  });

  it('updates a renamed title in place and bumps updated_at and updated_by', async () => {
    await db
      .update(topic)
      .set({ updatedBy: SYSTEM_USER_IDS.testSeed })
      .where(eq(topic.id, topicA.id));
    const before = await requireRow(topicA.id);
    const renamed: schema.TopicRecord = { ...topicA, title: 'Topic A Renamed' };

    const { summary } = await upsertTopics(db, [renamed, topicB]);

    expect(summary).toEqual({ inserted: 0, updated: 1, unchanged: 1 });

    const after = await requireRow(topicA.id);
    expect(after.title).toBe('Topic A Renamed');
    expect(after.updatedBy).toBe(SYSTEM_USER_IDS.coreDataImport);
    expect(await auditEntriesFor(db, topicA.id)).toEqual([]);
    expect(after.updatedAtText).not.toBe(before.updatedAtText);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
  });

  it('updates a changed slug in place, leaving the primary key unchanged', async () => {
    const resluggedA: schema.TopicRecord = {
      ...topicA,
      title: 'Topic A Renamed',
      slug: 'topic-a-new',
    };

    const { summary } = await upsertTopics(db, [resluggedA, topicB]);

    expect(summary).toEqual({ inserted: 0, updated: 1, unchanged: 1 });

    const after = await requireRow(topicA.id);
    expect(after.slug).toBe('topic-a-new');

    const rows = await db.select().from(topic);
    expect(rows.map((row) => row.id).sort()).toEqual([topicA.id, topicB.id].sort());
  });

  it('reports a row missing from the file without deleting it', async () => {
    const { orphaned } = await upsertTopics(db, [topicB]);

    expect(orphaned).toEqual([
      {
        id: topicA.id,
        slug: 'topic-a-new',
        title: 'Topic A Renamed',
        description: topicA.description,
      },
    ]);

    // Left in place, not deleted.
    await expect(requireRow(topicA.id)).resolves.toBeDefined();
  });
});
