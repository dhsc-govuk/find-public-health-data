import { createRepositories, schema } from '@fphd/db';
import { apiLogin, auditEntriesFor, createTestDb } from '@fphd/db/testing';
import { rebuildReadModelTables } from '@fphd/internal-read-models';
import { publishDueVersions, publishNextDueVersion } from '@fphd/internal-workflow';
import { createCapturingLogger } from '@fphd/logger/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { historyEntries } from './indicator-history-entries.ts';
import { findIndicatorHistory } from './indicator-history-repository.ts';
import { getIndicatorById } from './indicator-list-repository.ts';
import { ACTOR, newDraft } from './indicator-repository.testing.ts';
import {
  dataUpdatedAtOf,
  deferScheduledVersions,
  dueUpdate,
  readModelRowsOf,
  versionOf,
} from './scheduled-publication.testing.ts';

const { indicatorVersion, SYSTEM_USER_IDS, uploadBatch } = schema;

const testDb = await createTestDb({ template: 'core' });
// The fixtures write as the database owner. Publication connects as internal_api, the role it
// uses when deployed, and the public site reads as public_api.
const db = testDb.db;
const publisher = testDb.connectDb({ login: apiLogin('internal_api') });
const publicSite = createRepositories(testDb.connectDb({ login: apiLogin('public_api') }));

afterEach(() => deferScheduledVersions(db));

afterAll(async () => {
  await testDb.drop();
});

class RolledBack extends Error {}

/** The read-model rows that a rebuild of every indicator's read models would give this one. */
async function rowsAfterWholeRebuild(indicatorId: string): Promise<string[]> {
  let rows: string[] = [];
  await expect(
    db.transaction(async (tx) => {
      await rebuildReadModelTables(tx);
      rows = await readModelRowsOf(tx, indicatorId);
      throw new RolledBack();
    }),
  ).rejects.toBeInstanceOf(RolledBack);
  return rows;
}

async function publishNext() {
  const result = await publishNextDueVersion(publisher, { skip: [] });
  if (result.kind !== 'published') throw new Error(`expected a publication, got ${result.kind}`);
  return result;
}

async function currentPublishedVersionOf(indicatorId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: schema.currentPublishedVersion.id })
    .from(schema.currentPublishedVersion)
    .where(eq(schema.currentPublishedVersion.indicatorId, indicatorId));
  return row?.id;
}

async function slugOf(versionId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ slug: indicatorVersion.slug })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  return row?.slug;
}

function publishedEntriesFor(indicatorId: string) {
  return auditEntriesFor(db, indicatorId).then((entries) =>
    entries.filter(({ action }) => action === 'indicator.published'),
  );
}

/** Adds an observation of `value` to the batch, for the first area in a display group. */
async function addObservation(indicatorId: string, batchId: string, value: number) {
  await db.execute(sql`
    INSERT INTO observation
      (indicator_id, area_id, from_date, to_date, value, upload_batch_id, dimension_key)
    SELECT ${indicatorId}, a.id, '2024-01-01', '2024-12-31', ${value}, ${batchId}, ''
    FROM published.area a
    JOIN published.area_type at ON at.id = a.area_type_id
    WHERE at.display_group IS NOT NULL
    ORDER BY a.id LIMIT 1
  `);
}

async function publicValuesOf(indicatorId: string): Promise<(number | null)[]> {
  const rows = await testDb.connectDb({ login: apiLogin('public_api') }).execute<{
    value: number | null;
  }>(sql`SELECT value FROM published.observation WHERE indicator_id = ${indicatorId}`);
  return rows.map(({ value }) => value);
}

describe('publishing a scheduled update', () => {
  it('makes the update the published version, leaving the one before it published too', async () => {
    const { indicatorId, versionId, publishedId } = await dueUpdate(
      db,
      'Update published',
      'publish_with_history',
    );

    const result = await publishNext();

    expect(result).toEqual({
      kind: 'published',
      indicatorId,
      versionId,
      scheduledPublishAt: expect.any(Date),
      publishedAt: expect.any(Date),
      slugTaken: null,
    });
    expect(await versionOf(db, versionId)).toEqual({
      status: 'published',
      isLocked: true,
      publishedAt: result.publishedAt,
    });
    expect((await versionOf(db, publishedId)).status).toBe('published');
    expect(await currentPublishedVersionOf(indicatorId)).toBe(versionId);
    expect(await getIndicatorById(db, indicatorId)).toMatchObject({
      indicatorStatus: 'live',
      draftStatus: null,
    });
    expect((await publicSite.indicators.findPublishedById(indicatorId))?.polarity).toBe(
      'no-polarity',
    );
  });

  it('records the publication as Scheduled publication, and History shows "Indicator published"', async () => {
    const { indicatorId } = await dueUpdate(db, 'Update in the History', 'publish_with_history');

    const result = await publishNext();

    expect(await publishedEntriesFor(indicatorId)).toEqual([
      {
        actorId: SYSTEM_USER_IDS.scheduledPublication,
        action: 'indicator.published',
        entityType: 'indicator',
        requestId: null,
        changes: {
          status: { before: 'scheduled', after: 'published' },
          publishedAt: { before: null, after: result.publishedAt.toISOString() },
        },
      },
    ]);
    const history = await findIndicatorHistory(db, indicatorId);
    if (history === undefined) throw new Error('expected a history');
    expect(historyEntries(history)[0]).toEqual({
      kind: 'published',
      at: result.publishedAt.toISOString(),
      by: null,
    });
  });

  it('keeps the data date and the read models of an update that brings no new data table', async () => {
    const { indicatorId } = await dueUpdate(db, 'Update without data', 'publish_with_history');
    await db
      .update(schema.indicator)
      .set({ dataUpdatedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(schema.indicator.id, indicatorId));
    const rows = await readModelRowsOf(db, indicatorId);

    await publishNext();

    expect(await dataUpdatedAtOf(db, indicatorId)).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(await readModelRowsOf(db, indicatorId)).toEqual(rows);
  });

  it('replaces the live data with the data table an update brings, and dates the data', async () => {
    const { indicatorId, versionId, publishedId } = await dueUpdate(
      db,
      'Update with new data',
      'publish_with_history',
    );
    const [published] = await db
      .select({ batchId: indicatorVersion.uploadBatchId })
      .from(indicatorVersion)
      .where(eq(indicatorVersion.id, publishedId));
    if (!published?.batchId) throw new Error('expected the published version to have data');
    await addObservation(indicatorId, published.batchId, 1);
    const [batch] = await db
      .insert(uploadBatch)
      .values({
        indicatorId,
        indicatorVersionId: versionId,
        originalFilename: 'replacement.csv',
        uploadedBy: ACTOR,
        status: 'processed',
      })
      .returning({ id: uploadBatch.id });
    if (batch === undefined) throw new Error('inserted no batch');
    await addObservation(indicatorId, batch.id, 2);
    await db
      .update(indicatorVersion)
      .set({ uploadBatchId: batch.id })
      .where(eq(indicatorVersion.id, versionId));
    expect(await publicValuesOf(indicatorId)).toEqual([1]);

    const result = await publishNext();

    expect(await publicValuesOf(indicatorId)).toEqual([2]);
    expect(await dataUpdatedAtOf(db, indicatorId)).toEqual(result.publishedAt);
    const rows = await readModelRowsOf(db, indicatorId);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toEqual(await rowsAfterWholeRebuild(indicatorId));
    expect((await publishedEntriesFor(indicatorId))[0]?.changes).toMatchObject({
      dataUpdatedAt: { before: null, after: result.publishedAt.toISOString() },
    });
  });
});

describe('publishing a renamed update', () => {
  it('moves the indicator to the slug of its new name, and its old slug still finds it', async () => {
    const { indicatorId, versionId } = await dueUpdate(
      db,
      'Named before the update',
      'publish_without_history',
      { name: 'Named by the update' },
    );
    expect(await slugOf(versionId)).toBe('named-before-the-update');

    await publishNext();

    expect(await slugOf(versionId)).toBe('named-by-the-update');
    expect(await publicSite.indicators.findPublishedById(indicatorId)).toMatchObject({
      name: 'Named by the update',
      slug: 'named-by-the-update',
    });
    expect(await publicSite.indicators.resolveIdBySlug('named-by-the-update')).toBe(indicatorId);
    expect(await publicSite.indicators.resolveIdBySlug('named-before-the-update')).toBe(
      indicatorId,
    );
    expect((await publishedEntriesFor(indicatorId))[0]?.changes).toMatchObject({
      slug: { before: 'named-before-the-update', after: 'named-by-the-update' },
    });
  });

  it('keeps its slug when another indicator took the new one while it waited, and logs that', async () => {
    const { indicatorId, versionId } = await dueUpdate(
      db,
      'Waiting for its new name',
      'publish_with_history',
      { name: 'Taken while waiting' },
    );
    await newDraft(db, 'Taken while waiting');
    const { logger, lines } = createCapturingLogger('internal-worker');

    expect(await publishDueVersions(publisher, logger)).toMatchObject({ published: 1, failed: 0 });

    expect(await versionOf(db, versionId)).toMatchObject({ status: 'published' });
    expect(await slugOf(versionId)).toBe('waiting-for-its-new-name');
    expect(await publicSite.indicators.findPublishedById(indicatorId)).toMatchObject({
      name: 'Taken while waiting',
      slug: 'waiting-for-its-new-name',
    });
    expect(lines).toEqual([
      expect.objectContaining({ level: 30, msg: 'Indicator published', versionId }),
      expect.objectContaining({
        level: 40,
        msg: 'Indicator kept its slug because another indicator holds the new one',
        indicatorId,
        versionId,
        slug: 'taken-while-waiting',
      }),
    ]);
  });
});
