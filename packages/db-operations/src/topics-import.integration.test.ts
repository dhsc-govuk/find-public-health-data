import { type Database, schema } from '@fphd/db';
import { type Actor, recordAudit } from '@fphd/db/audit-log';
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

  it('records each topic it inserted as created by the core data import', async () => {
    expect(await auditEntriesFor(db, topicA.id)).toEqual([
      {
        actorId: SYSTEM_USER_IDS.coreDataImport,
        action: 'topic.created',
        entityType: 'topic',
        requestId: null,
        changes: {
          id: { before: null, after: topicA.id },
          slug: { before: null, after: topicA.slug },
          title: { before: null, after: topicA.title },
          description: { before: null, after: topicA.description },
        },
      },
    ]);
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
    expect(await auditEntriesFor(db, topicA.id)).toHaveLength(1);
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
    expect((await auditEntriesFor(db, topicA.id)).at(-1)).toMatchObject({
      action: 'topic.updated',
      changes: { title: { before: 'Topic A', after: 'Topic A Renamed' } },
    });
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

describe("an entity's entries", () => {
  /** Sessions in this test's database waiting on another transaction's lock. */
  async function lockWaiters(): Promise<number> {
    const [row] = await db.$client<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND datname = current_database()
    `;
    return row?.waiting ?? 0;
  }

  it('sort in the order their changes committed, though a writer that waited started first', async () => {
    const holder = testDb.connect({ max: 1 });
    const importer = testDb.connectDb({ max: 1 });
    const editor = testDb.connectDb({ max: 1 });
    const first = {
      id: '00000000-0000-4000-8000-000000000003',
      slug: 'held',
      title: 'Held',
      description: 'Held.',
    };
    const second = {
      id: '00000000-0000-4000-8000-000000000004',
      slug: 'edited',
      title: 'Edited',
      description: 'Edited.',
    };
    const editorActor: Actor = { userId: SYSTEM_USER_IDS.testSeed, requestId: null };
    let importing: Promise<unknown> = Promise.resolve();

    try {
      await upsertTopics(importer, [first, second]);

      // The import starts, then waits on a topic another writer holds; meanwhile an edit commits.
      await holder.begin(async (tx) => {
        await tx`SELECT 1 FROM topic WHERE id = ${first.id} FOR UPDATE`;
        importing = upsertTopics(importer, [
          { ...first, title: 'Held, imported' },
          { ...second, title: 'Edited, imported' },
        ]);
        await expect.poll(lockWaiters).toBe(1);
        await editor.transaction(async (edit) => {
          await edit
            .update(topic)
            .set({ title: 'Edited by hand', updatedBy: editorActor.userId })
            .where(eq(topic.id, second.id));
          await recordAudit(edit, editorActor, [
            {
              action: 'topic.updated',
              entityId: second.id,
              changes: { title: { before: 'Edited', after: 'Edited by hand' } },
            },
          ]);
        });
      });
      await importing;
    } finally {
      await Promise.all([holder.end(), importer.$client.end(), editor.$client.end()]);
    }

    const history = await db.$client<{ actor_id: string; changes: unknown }[]>`
      SELECT actor_id, changes FROM audit_log
      WHERE entity_id = ${second.id} ORDER BY occurred_at, id
    `;
    expect(history.slice(1)).toEqual([
      {
        actor_id: editorActor.userId,
        changes: { title: { before: 'Edited', after: 'Edited by hand' } },
      },
      {
        actor_id: SYSTEM_USER_IDS.coreDataImport,
        changes: { title: { before: 'Edited by hand', after: 'Edited, imported' } },
      },
    ]);
  });
});
