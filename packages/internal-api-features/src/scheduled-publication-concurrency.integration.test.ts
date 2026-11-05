import { apiLogin, auditEntriesFor, createTestDb } from '@fphd/db/testing';
import { publishDueVersions, publishNextDueVersion } from '@fphd/internal-workflow';
import { createCapturingLogger } from '@fphd/logger/testing';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  deferScheduledVersions,
  dueDraft,
  holdOpen,
  lockWaitedOn,
  versionOf,
} from './scheduled-publication.testing.ts';

const testDb = await createTestDb({ template: 'seeded' });
// The fixtures and the competing transactions connect as the database owner. Publication
// connects as internal_api, the role it uses when deployed.
const db = testDb.db;
const publisher = testDb.connectDb({ login: apiLogin('internal_api') });

afterEach(() => deferScheduledVersions(db));

afterAll(async () => {
  await testDb.drop();
});

// The table locks a live-data package takes, in the order `applyDataMigration` takes them, and
// then the lock a whole read-model rebuild takes on the read-model tables.
const PACKAGE_LOCK = sql`LOCK TABLE indicator, indicator_version, indicator_version_topic,
  indicator_version_classification IN SHARE ROW EXCLUSIVE MODE`;
const REBUILD_LOCK = sql`LOCK TABLE available_data, observation_range IN SHARE ROW EXCLUSIVE MODE`;

async function publishedEntryCount(indicatorId: string): Promise<number> {
  const entries = await auditEntriesFor(db, indicatorId);
  return entries.filter(({ action }) => action === 'indicator.published').length;
}

describe('publication beside other transactions', () => {
  it('passes over a version another transaction holds, and publishes the next', async () => {
    const held = await dueDraft(db, 'Held by another', 2);
    const next = await dueDraft(db, 'Published past the held one', 1);
    const holder = await holdOpen(db, [
      sql`SELECT id FROM indicator_version WHERE id = ${held.versionId} FOR NO KEY UPDATE`,
    ]);

    try {
      expect(await publishNextDueVersion(publisher, { skip: [] })).toMatchObject({
        kind: 'published',
        versionId: next.versionId,
      });
    } finally {
      await holder.release();
    }
    expect((await versionOf(db, held.versionId)).status).toBe('scheduled');
  });

  it('publishes each version once when two sweeps run at once', async () => {
    const drafts = await Promise.all(
      ['First of three', 'Second of three', 'Third of three'].map((name, index) =>
        dueDraft(db, name, 1 + index / 10),
      ),
    );

    const sweeps = await Promise.all([
      publishDueVersions(publisher, createCapturingLogger('internal-worker').logger),
      publishDueVersions(publisher, createCapturingLogger('internal-worker').logger),
    ]);

    expect(sweeps.reduce((total, { published }) => total + published, 0)).toBe(3);
    expect(sweeps.map(({ failed, blocked }) => ({ failed, blocked }))).toEqual([
      { failed: 0, blocked: false },
      { failed: 0, blocked: false },
    ]);
    for (const { indicatorId, versionId } of drafts) {
      expect((await versionOf(db, versionId)).status).toBe('published');
      expect(await publishedEntryCount(indicatorId)).toBe(1);
    }
  });

  it('ends the sweep at the lock timeout while a live data package holds its tables', async () => {
    const { indicatorId, versionId } = await dueDraft(db, 'Behind a data package', 1);
    const { logger, lines } = createCapturingLogger('internal-worker');
    const migration = await holdOpen(db, [PACKAGE_LOCK]);

    try {
      const sweep = await publishDueVersions(publisher, logger);

      expect(sweep).toEqual({ published: 0, failed: 0, blocked: true, overdue: 0 });
    } finally {
      await migration.release();
    }
    expect(lines).toEqual([
      expect.objectContaining({ level: 40, msg: 'Publication sweep blocked' }),
    ]);
    expect((await versionOf(db, versionId)).status).toBe('scheduled');
    expect(await publishedEntryCount(indicatorId)).toBe(0);
  });

  it('holds back a live data package started mid-publication, rather than deadlocking', async () => {
    const { indicatorId, versionId } = await dueDraft(db, 'Published before a data package', 1);
    // This trigger pauses the publication just after it sets the version's status to 'published'.
    // It makes the publication wait for advisory lock 664, which the test holds until it releases
    // `pause`.
    await db.execute(sql`
      CREATE FUNCTION pause_publication() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(664); RETURN NEW; END $$
    `);
    await db.execute(
      sql.raw(`
        CREATE TRIGGER pause_publication AFTER UPDATE ON indicator_version
        FOR EACH ROW WHEN (NEW.id = '${versionId}' AND NEW.status = 'published')
        EXECUTE FUNCTION pause_publication()
      `),
    );
    const pause = await holdOpen(db, [sql`SELECT pg_advisory_xact_lock(664)`]);

    try {
      const publishing = publishNextDueVersion(publisher, { skip: [] });
      await lockWaitedOn(db, 'advisory');
      const migrating = db.transaction(async (tx) => {
        await tx.execute(PACKAGE_LOCK);
        await tx.execute(REBUILD_LOCK);
      });
      await lockWaitedOn(db, 'relation');
      await pause.release();

      const [published, migrated] = await Promise.allSettled([publishing, migrating]);
      expect(published).toMatchObject({
        status: 'fulfilled',
        value: { kind: 'published', versionId },
      });
      expect(migrated).toEqual({ status: 'fulfilled', value: undefined });
    } finally {
      await pause.release();
      await db.execute(sql`DROP TRIGGER pause_publication ON indicator_version`);
      await db.execute(sql`DROP FUNCTION pause_publication()`);
    }
    expect(await publishedEntryCount(indicatorId)).toBe(1);
  });
});
