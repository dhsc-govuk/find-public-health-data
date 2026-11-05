import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Actor, recordAudit } from './audit-log.ts';
import type { Database } from './client.ts';
import { SYSTEM_USER_IDS } from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

const ACTOR: Actor = {
  userId: SYSTEM_USER_IDS.testSeed,
  requestId: '01a154fb-1a99-7705-9016-05db53119b94',
};

let testDb: TestDb;
let sql: postgres.Sql;
let db: Database;
let entityCount = 0;

function newEntityId(): string {
  entityCount += 1;
  return `00000000-0000-7000-8000-${entityCount.toString(16).padStart(12, '0')}`;
}

async function entriesFor(entityId: string) {
  return sql`
    SELECT actor_id, action, entity_type, request_id, jsonb_typeof(changes) AS changes_type,
      changes
    FROM audit_log WHERE entity_id = ${entityId}
  `;
}

beforeAll(async () => {
  testDb = await createTestDb();
  sql = testDb.sql;
  db = testDb.db;
});

afterAll(async () => {
  await testDb.drop();
});

describe('recordAudit', () => {
  const changes = { title: { before: 'Alcohol', after: 'Alcohol use' } };

  it('records the actor, the action, its entity type, the request and the changes', async () => {
    const entityId = newEntityId();

    await db.transaction((tx) =>
      recordAudit(tx, ACTOR, [{ action: 'topic.updated', entityId, changes }]),
    );

    expect(await entriesFor(entityId)).toEqual([
      {
        actor_id: ACTOR.userId,
        action: 'topic.updated',
        entity_type: 'topic',
        request_id: ACTOR.requestId,
        changes_type: 'object',
        changes,
      },
    ]);
  });

  it('records the changes as an object in a raw transaction', async () => {
    const entityId = newEntityId();
    // A client Drizzle has never wrapped, as the operations commands' is.
    const raw = testDb.connect({ max: 1 });

    await raw.begin((tx) =>
      recordAudit(tx, { ...ACTOR, requestId: null }, [
        { action: 'upload_batch.loaded', entityId, changes },
      ]),
    );
    await raw.end();

    expect(await entriesFor(entityId)).toMatchObject([
      { entity_type: 'upload_batch', request_id: null, changes_type: 'object', changes },
    ]);
  });

  it('records nothing for no entries', async () => {
    await expect(db.transaction((tx) => recordAudit(tx, ACTOR, []))).resolves.toBeUndefined();
  });

  it("sorts an entity's entries in the order they committed, though a writer that waited started first", async () => {
    const entityId = newEntityId();
    const holder = testDb.connect({ max: 1 });
    const waiter = testDb.connect({ max: 1 });
    const editor = testDb.connect({ max: 1 });
    const lock = 677;
    /** Sessions in this test's database waiting on another transaction's lock. */
    const lockWaiters = async () => {
      const [row] = await sql<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = current_database()
      `;
      return row?.waiting ?? 0;
    };
    const entry = (title: string) => ({
      action: 'topic.updated' as const,
      entityId,
      changes: { title: { before: null, after: title } },
    });
    let waiting: Promise<unknown> = Promise.resolve();

    try {
      // The waiter starts, then waits on a lock the holder has; meanwhile the editor commits.
      await holder.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(${lock})`;
        waiting = waiter.begin(async (wait) => {
          await wait`SELECT 1`;
          await wait`SELECT pg_advisory_xact_lock(${lock})`;
          await recordAudit(wait, ACTOR, [entry('Waited')]);
        });
        await expect.poll(lockWaiters).toBe(1);
        await editor.begin((edit) => recordAudit(edit, ACTOR, [entry('Edited')]));
      });
      await waiting;
    } finally {
      await Promise.all([holder.end(), waiter.end(), editor.end()]);
    }

    const history = await sql<{ title: string }[]>`
      SELECT changes -> 'title' ->> 'after' AS title FROM audit_log
      WHERE entity_id = ${entityId} ORDER BY occurred_at, id
    `;
    expect(history).toEqual([{ title: 'Edited' }, { title: 'Waited' }]);
  });
});

describe('the audit log', () => {
  async function insert(action: string, entityType: string, changes: string) {
    return sql`
      INSERT INTO audit_log (actor_id, action, entity_type, entity_id, changes)
      VALUES (${ACTOR.userId}, ${action}, ${entityType}, ${newEntityId()}, ${changes}::text::jsonb)
    `;
  }

  it('refuses an action not on the list', async () => {
    await expect(insert('topic.renamed', 'topic', '{}')).rejects.toMatchObject({
      constraint_name: 'audit_log_action_check',
    });
  });

  it("refuses an entity type other than the action's", async () => {
    await expect(insert('topic.created', 'indicator', '{}')).rejects.toMatchObject({
      constraint_name: 'audit_log_entity_type_check',
    });
  });

  it('refuses changes that are not an object', async () => {
    await expect(insert('topic.created', 'topic', '"a string"')).rejects.toMatchObject({
      constraint_name: 'audit_log_changes_check',
    });
  });

  it('refuses an actor who is not a user', async () => {
    await expect(
      sql`
        INSERT INTO audit_log (actor_id, action, entity_type, entity_id, changes)
        VALUES (uuidv7(), 'topic.created', 'topic', ${newEntityId()}, '{}')
      `,
    ).rejects.toMatchObject({ code: '23503' });
  });
});
