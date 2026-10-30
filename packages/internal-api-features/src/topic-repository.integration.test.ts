import { FAKE_USER_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import { apiLogin, auditEntriesFor, createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { editVersion } from './edit-version.ts';
import {
  countLinkedIndicators,
  createTopic,
  deleteTopic,
  getTopicById,
  updateTopic,
} from './topic-repository.ts';

let testDb: TestDb;
let db: Database;
let topicCount = 0;

const UNKNOWN_ID = '00000000-0000-7000-8000-0000000000ff';
const ACTOR = FAKE_USER_IDS.admin;
const OTHER_ACTOR = FAKE_USER_IDS.imrgManager;
const AS_ACTOR: Actor = { userId: ACTOR, requestId: null };
const IN_REQUEST: Actor = { userId: ACTOR, requestId: '01a154fb-1a99-7705-9016-05db53119b95' };

/** A distinct row per test, so no test depends on another having run (or not run) first. */
async function givenTopic() {
  topicCount += 1;
  const reference = topicCount.toString(16);
  const record = {
    id: `00000000-0000-7000-8000-${reference.padStart(12, '0')}`,
    slug: `topic-${reference}`,
    title: `Topic ${reference}`,
    description: `About topic ${reference}.`,
  };

  await db
    .insert(schema.topic)
    .values({ ...record, createdBy: OTHER_ACTOR, updatedBy: OTHER_ACTOR });
  return record;
}

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
});

afterAll(async () => {
  await testDb.drop();
});

describe('getTopicById', () => {
  it('returns the topic matching the given id', async () => {
    const topic = await givenTopic();

    expect(await getTopicById(db, topic.id)).toMatchObject(topic);
  });

  it('returns undefined for an unknown id', async () => {
    expect(await getTopicById(db, UNKNOWN_ID)).toBeUndefined();
  });
});

describe('updateTopic', () => {
  const editableFields: [string, Partial<Awaited<ReturnType<typeof givenTopic>>>][] = [
    ['title', { title: 'A renamed topic' }],
    ['slug', { slug: 'a-renamed-topic' }],
    ['description', { description: 'A rewritten description.' }],
  ];

  it.each(editableFields)(
    'writes a changed %s and bumps updatedAt and updatedBy',
    async (_field, change) => {
      const topic = await givenTopic();
      const before = await getTopicById(db, topic.id);

      const result = await updateTopic(db, topic.id, { ...topic, ...change }, AS_ACTOR);

      expect(result).toMatchObject({ ok: true, changed: true, topic: change });

      const after = await getTopicById(db, topic.id);
      expect(after).toMatchObject({ ...change, createdBy: OTHER_ACTOR, updatedBy: ACTOR });
      expect(after?.updatedAt.getTime()).toBeGreaterThan(before?.updatedAt.getTime() ?? 0);
      expect(after?.id).toBe(topic.id);
      expect(after?.createdAt).toEqual(before?.createdAt);
    },
  );

  it('reports an identical submission as unchanged and leaves updatedAt and updatedBy alone', async () => {
    const topic = await givenTopic();
    const before = await getTopicById(db, topic.id);

    const result = await updateTopic(db, topic.id, topic, AS_ACTOR);

    expect(result).toMatchObject({ ok: true, changed: false });
    expect(await getTopicById(db, topic.id)).toMatchObject({
      updatedAt: before?.updatedAt,
      updatedBy: OTHER_ACTOR,
    });
  });

  it('reports an unknown id rather than throwing', async () => {
    expect(
      await updateTopic(db, UNKNOWN_ID, { slug: 's', title: 't', description: 'd' }, AS_ACTOR),
    ).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('reports a slug already held by another topic, leaving both rows as they were', async () => {
    const target = await givenTopic();
    const other = await givenTopic();

    const result = await updateTopic(db, target.id, { ...target, slug: other.slug }, AS_ACTOR);

    expect(result).toEqual({ ok: false, reason: 'slug_taken' });
    expect(await getTopicById(db, target.id)).toMatchObject(target);
    expect(await getTopicById(db, other.id)).toMatchObject(other);
  });

  describe('given the version a form was shown', () => {
    const versionOf = ({ title }: { title: string }) => editVersion({ title });

    it('saves a topic whose version is the one shown', async () => {
      const topic = await givenTopic();

      const result = await updateTopic(
        db,
        topic.id,
        { ...topic, title: 'Saved as shown' },
        AS_ACTOR,
        { version: versionOf(topic), versionOf },
      );

      expect(result).toMatchObject({ ok: true, changed: true });
    });

    it('refuses a save of a topic changed since, writing nothing and answering its version now', async () => {
      const topic = await givenTopic();
      const shown = { version: versionOf(topic), versionOf };
      await updateTopic(db, topic.id, { ...topic, title: 'First' }, AS_ACTOR, shown);

      const result = await updateTopic(
        db,
        topic.id,
        { ...topic, title: 'Second' },
        AS_ACTOR,
        shown,
      );

      expect(result).toEqual({
        ok: false,
        reason: 'changed',
        version: editVersion({ title: 'First' }),
      });
      expect(await getTopicById(db, topic.id)).toMatchObject({ title: 'First' });
    });
  });
});

describe('createTopic', () => {
  it('inserts a topic, letting the database mint the id and both timestamps', async () => {
    const result = await createTopic(
      db,
      {
        slug: 'a-new-topic',
        title: 'A new topic',
        description: 'Freshly created.',
      },
      AS_ACTOR,
    );

    expect(result).toMatchObject({
      ok: true,
      topic: { slug: 'a-new-topic', title: 'A new topic' },
    });

    if (result.ok) {
      expect(result.topic.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.topic.createdAt).toBeInstanceOf(Date);
      expect(await getTopicById(db, result.topic.id)).toMatchObject({
        slug: 'a-new-topic',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
    }
  });

  it('reports a slug already held by another topic rather than throwing', async () => {
    const existing = await givenTopic();

    const result = await createTopic(
      db,
      {
        slug: existing.slug,
        title: 'Different title',
        description: 'Different description.',
      },
      AS_ACTOR,
    );

    expect(result).toEqual({ ok: false, reason: 'slug_taken' });
  });
});

describe('deleteTopic', () => {
  it('deletes a topic and reports success', async () => {
    const topic = await givenTopic();

    expect(await deleteTopic(db, topic.id, AS_ACTOR)).toEqual({ ok: true });
    expect(await getTopicById(db, topic.id)).toBeUndefined();
  });

  it('reports an unknown id rather than throwing', async () => {
    expect(await deleteTopic(db, UNKNOWN_ID, AS_ACTOR)).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('the audit log of topic writes', () => {
  it('records a created topic, every field after, under the request', async () => {
    const result = await createTopic(
      db,
      { slug: 'audited-create', title: 'Audited create', description: 'Recorded.' },
      IN_REQUEST,
    );
    if (!result.ok) throw new Error('created no topic');

    expect(await auditEntriesFor(db, result.topic.id)).toEqual([
      {
        actorId: ACTOR,
        action: 'topic.created',
        entityType: 'topic',
        requestId: IN_REQUEST.requestId,
        changes: {
          id: { before: null, after: result.topic.id },
          slug: { before: null, after: 'audited-create' },
          title: { before: null, after: 'Audited create' },
          description: { before: null, after: 'Recorded.' },
        },
      },
    ]);
  });

  it('records the fields an update changed, before and after', async () => {
    const topic = await givenTopic();

    await updateTopic(db, topic.id, { ...topic, title: 'Retitled' }, AS_ACTOR);

    expect(await auditEntriesFor(db, topic.id)).toEqual([
      expect.objectContaining({
        actorId: ACTOR,
        action: 'topic.updated',
        changes: { title: { before: topic.title, after: 'Retitled' } },
      }),
    ]);
  });

  it('records nothing for a save that changes nothing, or a slug another topic holds', async () => {
    const topic = await givenTopic();
    const other = await givenTopic();

    await updateTopic(db, topic.id, topic, AS_ACTOR);
    await updateTopic(db, topic.id, { ...topic, slug: other.slug }, AS_ACTOR);

    expect(await auditEntriesFor(db, topic.id)).toEqual([]);
  });

  it('records a deleted topic, every field before', async () => {
    const topic = await givenTopic();

    await deleteTopic(db, topic.id, AS_ACTOR);

    expect(await auditEntriesFor(db, topic.id)).toEqual([
      expect.objectContaining({
        action: 'topic.deleted',
        changes: {
          id: { before: topic.id, after: null },
          slug: { before: topic.slug, after: null },
          title: { before: topic.title, after: null },
          description: { before: topic.description, after: null },
        },
      }),
    ]);
  });

  it('records nothing for an unknown topic', async () => {
    await deleteTopic(db, UNKNOWN_ID, AS_ACTOR);
    await updateTopic(db, UNKNOWN_ID, { slug: 's', title: 't', description: 'd' }, AS_ACTOR);

    expect(await auditEntriesFor(db, UNKNOWN_ID)).toEqual([]);
  });

  it('keeps no change whose entry fails', async () => {
    const topic = await givenTopic();
    const unrecordable: Actor = { userId: ACTOR, requestId: 'not-a-request-id' };

    await expect(
      updateTopic(db, topic.id, { ...topic, title: 'Never kept' }, unrecordable),
    ).rejects.toThrow();
    await expect(
      createTopic(db, { slug: 'never-kept', title: 'Never kept', description: 'x' }, unrecordable),
    ).rejects.toThrow();

    expect(await getTopicById(db, topic.id)).toMatchObject(topic);
    expect(await db.$client`SELECT 1 FROM topic WHERE slug = 'never-kept'`).toHaveLength(0);
  });

  it('answers who changed a topic and what it said before, from the log alone', async () => {
    const created = await createTopic(
      db,
      { slug: 'history', title: 'History', description: 'First words.' },
      AS_ACTOR,
    );
    if (!created.ok) throw new Error('created no topic');
    const { id } = created.topic;
    await updateTopic(
      db,
      id,
      { slug: 'history', title: 'History', description: 'Second words.' },
      { userId: OTHER_ACTOR, requestId: null },
    );
    await updateTopic(
      db,
      id,
      { slug: 'history', title: 'A history', description: 'Second words.' },
      AS_ACTOR,
    );

    const history = (await auditEntriesFor(db, id)).map(({ actorId, action, changes }) => ({
      actorId,
      action,
      changes,
    }));

    expect(history).toEqual([
      expect.objectContaining({ actorId: ACTOR, action: 'topic.created' }),
      {
        actorId: OTHER_ACTOR,
        action: 'topic.updated',
        changes: { description: { before: 'First words.', after: 'Second words.' } },
      },
      {
        actorId: ACTOR,
        action: 'topic.updated',
        changes: { title: { before: 'History', after: 'A history' } },
      },
    ]);
  });
});

describe('the topic write surface', () => {
  it('lets internal_api update the editable columns', async () => {
    const topic = await givenTopic();
    const client = testDb.connect({ login: apiLogin('internal_api') });

    try {
      await expect(
        client`UPDATE topic SET title = 'Edited by the API' WHERE id = ${topic.id}`,
      ).resolves.toBeDefined();
    } finally {
      await client.end();
    }
  });

  it('lets internal_api insert and delete a topic', async () => {
    const client = testDb.connect({ login: apiLogin('internal_api') });

    try {
      await expect(
        client`INSERT INTO topic (slug, title, description, created_by, updated_by) VALUES ('granted-insert', 'Granted insert', 'x', ${ACTOR}, ${ACTOR})`,
      ).resolves.toBeDefined();
      await expect(client`DELETE FROM topic WHERE slug = 'granted-insert'`).resolves.toBeDefined();
    } finally {
      await client.end();
    }
  });

  // Connected as internal_api rather than the owner, which can write anything whatever the
  // statement names: this is what proves the app's own write path works under the grants.
  it('creates and deletes through the repository connected as internal_api', async () => {
    const apiDb = testDb.connectDb({ login: apiLogin('internal_api') });

    try {
      const created = await createTopic(
        apiDb,
        {
          slug: 'internal-api-create',
          title: 'Internal API create',
          description: 'Created by the API role.',
        },
        AS_ACTOR,
      );

      expect(created).toMatchObject({ ok: true, topic: { slug: 'internal-api-create' } });

      if (created.ok) {
        expect(created.topic.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(created.topic.createdAt).toBeInstanceOf(Date);
        expect(await deleteTopic(apiDb, created.topic.id, AS_ACTOR)).toEqual({ ok: true });
        expect(await auditEntriesFor(apiDb, created.topic.id)).toMatchObject([
          { action: 'topic.created' },
          { action: 'topic.deleted' },
        ]);
      }
    } finally {
      await apiDb.$client.end();
    }
  });

  it('counts linked indicators connected as internal_api', async () => {
    const topic = await givenTopic();
    const apiDb = testDb.connectDb({ login: apiLogin('internal_api') });

    try {
      expect(await countLinkedIndicators(apiDb, topic.id)).toBe(0);
    } finally {
      await apiDb.$client.end();
    }
  });

  it('does not let public_api update, insert or delete topics at all', async () => {
    const topic = await givenTopic();
    const client = testDb.connect({ login: apiLogin('public_api') });

    try {
      await expect(client`UPDATE topic SET title = 'Nope' WHERE id = ${topic.id}`).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        client`INSERT INTO topic (slug, title, description) VALUES ('nope', 'Nope', 'x')`,
      ).rejects.toThrow(/permission denied/);
      await expect(client`DELETE FROM topic WHERE id = ${topic.id}`).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await client.end();
    }
  });
});
