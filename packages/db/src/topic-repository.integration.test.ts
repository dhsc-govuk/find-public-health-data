import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from './client.ts';
import { SYSTEM_USER_IDS, type TopicRecord, topic } from './schema.ts';
import { apiLogin, createTestDb, type TestDb } from './testing.ts';
import { getTopicBySlug, listTopics } from './topic-repository.ts';

let testDb: TestDb;
let db: Database;

const zebra: TopicRecord = {
  id: '00000000-0000-7000-8000-000000000003',
  slug: 'zebra-topic',
  title: 'Zebra topic',
  description: 'Should sort last.',
};

const apple: TopicRecord = {
  id: '00000000-0000-7000-8000-000000000004',
  slug: 'apple-topic',
  title: 'Apple topic',
  description: 'Should sort first.',
};

// Seeded once for the whole file so no describe depends on another having run first.
beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  await db.insert(topic).values(
    [zebra, apple].map((record) => ({
      ...record,
      createdBy: SYSTEM_USER_IDS.testSeed,
      updatedBy: SYSTEM_USER_IDS.testSeed,
    })),
  );
});

afterAll(async () => {
  await testDb.drop();
});

describe('listTopics', () => {
  it('orders topics alphabetically by title', async () => {
    const titles = (await listTopics(db)).map((row) => row.title);

    expect(titles).toEqual(['Apple topic', 'Zebra topic']);
  });

  it('returns the full row, timestamps included', async () => {
    const found = (await listTopics(db)).find((row) => row.slug === 'zebra-topic');

    expect(found).toMatchObject({
      id: zebra.id,
      slug: 'zebra-topic',
      title: 'Zebra topic',
      description: 'Should sort last.',
    });
    expect(found?.createdAt).toBeInstanceOf(Date);
    expect(found?.updatedAt).toBeInstanceOf(Date);
  });
});

describe('getTopicBySlug', () => {
  it('returns the topic matching the given slug', async () => {
    const found = await getTopicBySlug(db, 'zebra-topic');

    expect(found).toMatchObject({
      id: zebra.id,
      slug: 'zebra-topic',
      title: 'Zebra topic',
      description: 'Should sort last.',
    });
  });

  it('returns undefined for an unknown slug', async () => {
    expect(await getTopicBySlug(db, 'no-such-topic')).toBeUndefined();
  });
});

describe('the topic read surface', () => {
  // Only the shared read grant: internal_api's write grants are asserted alongside the writes,
  // in @fphd/internal-api-features.
  const apiLogins = [apiLogin('public_api'), apiLogin('internal_api')];

  it.each(apiLogins)('lets $user select topics through the published view', async (login) => {
    const client = testDb.connect({ login });

    try {
      await expect(client`SELECT * FROM published.topic`).resolves.toBeDefined();
    } finally {
      await client.end();
    }
  });
});
