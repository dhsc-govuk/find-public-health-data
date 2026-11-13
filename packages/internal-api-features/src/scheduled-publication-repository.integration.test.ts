import { schema } from '@fphd/db';
import { apiLogin, auditEntriesFor, createTestDb } from '@fphd/db/testing';
import { publishDueVersions, publishNextDueVersion } from '@fphd/internal-workflow';
import { createCapturingLogger } from '@fphd/logger/testing';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { findIndicatorAccess, getIndicatorById } from './indicator-list-repository.ts';
import { newDraft } from './indicator-repository.testing.ts';
import { schedulePublication } from './indicator-scheduling-repository.ts';
import { AS_ADMIN, scheduledPublishAtOf } from './indicator-workflow.testing.ts';
import {
  dataUpdatedAtOf,
  deferScheduledVersions,
  dueDraft,
  readModelRowsOf,
  rowsAfterWholeRebuild,
  versionOf,
} from './scheduled-publication.testing.ts';

const { SYSTEM_USER_IDS } = schema;

const testDb = await createTestDb({ template: 'core' });
// The fixtures write as the database owner. Publication connects as internal_api, the role it
// uses when deployed.
const db = testDb.db;
const publisher = testDb.connectDb({ login: apiLogin('internal_api') });

afterEach(() => deferScheduledVersions(db));

afterAll(async () => {
  await testDb.drop();
});

function publishedEntriesFor(indicatorId: string) {
  return auditEntriesFor(db, indicatorId).then((entries) =>
    entries.filter(({ action }) => action === 'indicator.published'),
  );
}

/**
 * Adds a trigger that makes inserting the indicator's `available_data` rows fail with the error
 * code `sqlState`. Run the returned function to remove the trigger.
 */
async function breakReadModelsOf(
  indicatorId: string,
  sqlState = 'P0001',
): Promise<() => Promise<void>> {
  await db.execute(
    sql.raw(`
      CREATE FUNCTION refuse_read_model_row() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'read model row refused' USING ERRCODE = '${sqlState}'; END $$
    `),
  );
  await db.execute(
    sql.raw(`
      CREATE TRIGGER refuse_read_model_row BEFORE INSERT ON available_data
      FOR EACH ROW WHEN (NEW.indicator_id = '${indicatorId}')
      EXECUTE FUNCTION refuse_read_model_row()
    `),
  );
  return async () => {
    await db.execute(sql`DROP TRIGGER refuse_read_model_row ON available_data`);
    await db.execute(sql`DROP FUNCTION refuse_read_model_row()`);
  };
}

describe('publishNextDueVersion', () => {
  it('publishes a due version locked, with its read models and data date, as Scheduled publication', async () => {
    const { indicatorId, versionId } = await dueDraft(db, 'Due a minute ago', 1);

    const result = await publishNextDueVersion(publisher, { skip: [] });

    expect(result).toEqual({
      kind: 'published',
      indicatorId,
      versionId,
      scheduledPublishAt: expect.any(Date),
      publishedAt: expect.any(Date),
      slugTaken: null,
    });
    if (result.kind !== 'published') throw new Error('expected a publication');
    const publishedAt = result.publishedAt.toISOString();
    expect(await versionOf(db, versionId)).toEqual({
      status: 'published',
      isLocked: true,
      publishedAt: result.publishedAt,
    });
    expect(await dataUpdatedAtOf(db, indicatorId)).toEqual(result.publishedAt);
    // Compares the two times in the database, because a JavaScript Date drops the microseconds
    // and could hide a difference.
    const [times] = await db.execute<{ same: boolean }>(sql`
      SELECT i.data_updated_at = v.published_at AS same
      FROM indicator i JOIN indicator_version v ON v.indicator_id = i.id
      WHERE v.id = ${versionId}`);
    expect(times?.same).toBe(true);
    const rows = await readModelRowsOf(db, indicatorId);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toEqual(await rowsAfterWholeRebuild(db, indicatorId));
    expect(await publishedEntriesFor(indicatorId)).toEqual([
      {
        actorId: SYSTEM_USER_IDS.scheduledPublication,
        action: 'indicator.published',
        entityType: 'indicator',
        requestId: null,
        changes: {
          status: { before: 'scheduled', after: 'published' },
          publishedAt: { before: null, after: publishedAt },
          dataUpdatedAt: { before: null, after: publishedAt },
        },
      },
    ]);
  });

  it('leaves the indicator live with no unpublished version, and its reviewer without access', async () => {
    const { indicatorId } = await dueDraft(db, 'Live once published', 1);
    expect((await findIndicatorAccess(db, indicatorId))?.draftReviewers).not.toEqual([]);

    await publishNextDueVersion(publisher, { skip: [] });

    expect(await getIndicatorById(db, indicatorId)).toMatchObject({
      indicatorStatus: 'live',
      draftStatus: null,
    });
    expect((await findIndicatorAccess(db, indicatorId))?.draftReviewers).toEqual([]);
  });

  it('leaves alone a version due in an hour, a draft and a published version', async () => {
    const later = await dueDraft(db, 'Due in an hour', -60);
    const draft = await newDraft(db, 'Never scheduled');

    expect(await publishNextDueVersion(publisher, { skip: [] })).toEqual({ kind: 'none' });
    expect((await versionOf(db, later.versionId)).status).toBe('scheduled');
    expect((await versionOf(db, draft.versionId)).status).toBe('draft');
  });

  it('does not publish a version whose date an admin moved later first', async () => {
    const { indicatorId, versionId } = await dueDraft(db, 'Moved later', 1);
    const moved = await schedulePublication(
      db,
      indicatorId,
      {
        scheduledPublishAt: new Date('2099-01-01T09:00:00Z'),
        shownScheduledPublishAt: await scheduledPublishAtOf(db, versionId),
      },
      AS_ADMIN,
    );
    expect(moved).toEqual({ ok: true });

    expect(await publishNextDueVersion(publisher, { skip: [] })).toEqual({ kind: 'none' });
    expect((await versionOf(db, versionId)).status).toBe('scheduled');
  });

  it('leaves its timeouts to the transaction, not the connection', async () => {
    const single = testDb.connectDb({ login: apiLogin('internal_api'), max: 1 });
    const timeouts = () =>
      single.execute<{ lock: string; statement: string; idle: string }>(sql`SELECT
        current_setting('lock_timeout') AS lock,
        current_setting('statement_timeout') AS statement,
        current_setting('idle_in_transaction_session_timeout') AS idle`);
    const before = await timeouts();
    await dueDraft(db, 'Published on one connection', 1);

    expect((await publishNextDueVersion(single, { skip: [] })).kind).toBe('published');

    expect(await timeouts()).toEqual(before);
  });

  it('passes over the versions it is told to skip', async () => {
    const { versionId } = await dueDraft(db, 'Skipped', 1);

    expect(await publishNextDueVersion(publisher, { skip: [versionId] })).toEqual({
      kind: 'none',
    });
  });
});

describe('publishDueVersions', () => {
  it('publishes every due version in one sweep, oldest first', async () => {
    const older = await dueDraft(db, 'Due a minute and a half ago', 1.5);
    const newer = await dueDraft(db, 'Due after another', 1);
    const { logger, lines } = createCapturingLogger('internal-worker');

    const sweep = await publishDueVersions(publisher, logger);

    expect(sweep).toEqual({ published: 2, failed: 0, blocked: false, overdue: 0 });
    const [first, second] = await Promise.all([
      versionOf(db, older.versionId),
      versionOf(db, newer.versionId),
    ]);
    expect(first.publishedAt?.getTime()).toBeLessThan(second.publishedAt?.getTime() ?? 0);
    expect(lines.map(({ msg, versionId }) => [msg, versionId])).toEqual([
      ['Indicator published', older.versionId],
      ['Indicator published', newer.versionId],
    ]);
    expect(lines[0]).toMatchObject({ level: 30, indicatorId: older.indicatorId });
    expect(lines[0]?.lateSeconds).toBeGreaterThanOrEqual(90);
  });

  it('stops taking versions once told to, leaving the rest for the next sweep', async () => {
    const first = await dueDraft(db, 'Published before the stop', 1.5);
    const rest = await dueDraft(db, 'Left for the next sweep', 1);
    const { logger } = createCapturingLogger('internal-worker');
    let asked = 0;

    const sweep = await publishDueVersions(publisher, logger, { shouldStop: () => asked++ > 0 });

    expect(sweep).toEqual({ published: 1, failed: 0, blocked: false, overdue: 0 });
    expect((await versionOf(db, first.versionId)).status).toBe('published');
    expect((await versionOf(db, rest.versionId)).status).toBe('scheduled');

    expect(await publishDueVersions(publisher, logger)).toMatchObject({ published: 1 });
    expect((await versionOf(db, rest.versionId)).status).toBe('published');
  });

  it('logs a publication more than two minutes after its time as late', async () => {
    const { versionId } = await dueDraft(db, 'Due five minutes ago', 5);
    const { logger, lines } = createCapturingLogger('internal-worker');

    await publishDueVersions(publisher, logger);

    expect(lines).toEqual([
      expect.objectContaining({ level: 40, msg: 'Indicator published late', versionId }),
    ]);
  });

  it('logs a refused version as failed and overdue, and still publishes the next', async () => {
    const refused = await dueDraft(db, 'Refused, overdue', 15);
    // Unlocks the scheduled version, which the workflow never does. The publish step only takes
    // a locked version, so it refuses this one with 'not_allowed'.
    await db.execute(
      sql`UPDATE indicator_version SET is_locked = false WHERE id = ${refused.versionId}`,
    );
    const next = await dueDraft(db, 'Published after a refusal', 1);
    const { logger, lines } = createCapturingLogger('internal-worker');

    const sweep = await publishDueVersions(publisher, logger);

    expect(sweep).toEqual({ published: 1, failed: 1, blocked: false, overdue: 1 });
    expect((await versionOf(db, refused.versionId)).status).toBe('scheduled');
    expect((await versionOf(db, next.versionId)).status).toBe('published');
    expect(lines).toEqual([
      expect.objectContaining({
        level: 50,
        msg: 'Indicator publication failed',
        versionId: refused.versionId,
        reason: 'not_allowed',
      }),
      expect.objectContaining({ msg: 'Indicator published', versionId: next.versionId }),
      expect.objectContaining({
        level: 40,
        msg: 'Publication overdue',
        versionIds: [refused.versionId],
        count: 1,
      }),
    ]);
  });

  it('rolls back a failing publication alone, and still publishes the next', async () => {
    const failing = await dueDraft(db, 'Fails to publish', 2);
    const next = await dueDraft(db, 'Published after a failure', 1);
    const repair = await breakReadModelsOf(failing.indicatorId);
    const { logger, lines } = createCapturingLogger('internal-worker');

    try {
      const sweep = await publishDueVersions(publisher, logger);

      expect(sweep).toEqual({ published: 1, failed: 1, blocked: false, overdue: 0 });
    } finally {
      await repair();
    }
    expect(await versionOf(db, failing.versionId)).toEqual({
      status: 'scheduled',
      isLocked: true,
      publishedAt: null,
    });
    expect(await dataUpdatedAtOf(db, failing.indicatorId)).toBeNull();
    expect(await readModelRowsOf(db, failing.indicatorId)).toEqual([]);
    expect(await publishedEntriesFor(failing.indicatorId)).toEqual([]);
    expect((await versionOf(db, next.versionId)).status).toBe('published');
    expect(lines[0]).toMatchObject({
      level: 50,
      msg: 'Indicator publication failed',
      versionId: failing.versionId,
      err: expect.objectContaining({ type: expect.any(String) }),
    });
  });

  it('fails a publication that reaches the statement timeout, and still publishes the next', async () => {
    const slow = await dueDraft(db, 'Times out publishing', 2);
    const next = await dueDraft(db, 'Published after a timeout', 1);
    // Makes the read-model insert fail with 57014, the SQLSTATE a statement timeout raises, to
    // stand in for a publication that runs too long.
    const repair = await breakReadModelsOf(slow.indicatorId, '57014');
    const { logger, lines } = createCapturingLogger('internal-worker');

    try {
      const sweep = await publishDueVersions(publisher, logger);

      expect(sweep).toEqual({ published: 1, failed: 1, blocked: false, overdue: 0 });
    } finally {
      await repair();
    }
    expect((await versionOf(db, slow.versionId)).status).toBe('scheduled');
    expect((await versionOf(db, next.versionId)).status).toBe('published');
    expect(lines.map(({ msg }) => msg)).toEqual([
      'Indicator publication failed',
      'Indicator published',
    ]);
    expect(lines[0]).toMatchObject({
      level: 50,
      versionId: slow.versionId,
      err: expect.objectContaining({ cause: expect.objectContaining({ code: '57014' }) }),
    });
  });

  it('answers an empty sweep when nothing is due', async () => {
    const { logger, lines } = createCapturingLogger('internal-worker');

    expect(await publishDueVersions(publisher, logger)).toEqual({
      published: 0,
      failed: 0,
      blocked: false,
      overdue: 0,
    });
    expect(lines).toEqual([]);
  });
});
