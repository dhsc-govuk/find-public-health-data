import { createRepositories, schema } from '@fphd/db';
import { apiLogin, auditEntriesFor, createTestDb } from '@fphd/db/testing';
import { publishDueVersions, publishNextDueVersion } from '@fphd/internal-workflow';
import { createCapturingLogger } from '@fphd/logger/testing';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { historyEntries } from './indicator-history-entries.ts';
import { findIndicatorHistory } from './indicator-history-repository.ts';
import { getIndicatorById } from './indicator-list-repository.ts';
import { createDraftFromPublished } from './indicator-publish-repository.ts';
import { ACTOR, AS_ACTOR, newDraft } from './indicator-repository.testing.ts';
import { schedulePublication } from './indicator-scheduling-repository.ts';
import {
  AS_ADMIN,
  answerUpdate,
  type OpenedUpdate,
  scheduledPublishAtOf,
  scheduledUpdate,
} from './indicator-workflow.testing.ts';
import { submitIndicator } from './indicator-workflow-repository.ts';
import {
  dataUpdatedAtOf,
  deferScheduledVersions,
  dueUpdate,
  readModelRowsOf,
  rowsAfterWholeRebuild,
  versionOf,
} from './scheduled-publication.testing.ts';
import { decideUpdate } from './update-decision-repository.ts';

const { indicatorVersion, SYSTEM_USER_IDS, uploadBatch } = schema;

const testDb = await createTestDb({ template: 'core' });
// The fixtures write as the database owner. Publication connects as internal_api, the role it
// uses when deployed, and the public site reads as public_api.
const db = testDb.db;
const publisher = testDb.connectDb({ login: apiLogin('internal_api') });
const publicDb = testDb.connectDb({ login: apiLogin('public_api') });
const publicSite = createRepositories(publicDb);

afterEach(() => deferScheduledVersions(db));

afterAll(async () => {
  await testDb.drop();
});

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
  const rows = await publicDb.execute<{ value: number | null }>(
    sql`SELECT value FROM published.observation WHERE indicator_id = ${indicatorId}`,
  );
  return rows.map(({ value }) => value);
}

/**
 * Opens another update of the live indicator, with `summary` as its update summary, has the core
 * team approve it to publish with visibility in history, and publishes it.
 */
async function publishAnotherUpdate(indicatorId: string, summary: string) {
  const opened = await createDraftFromPublished(db, indicatorId, AS_ACTOR);
  if (!opened.ok) throw new Error(`could not open another update: ${opened.reason}`);
  const shown = await answerUpdate(
    db,
    { indicatorId, versionId: opened.versionId },
    { polarity: 'higher-is-better', updateSummary: summary },
  );
  expect(await submitIndicator(db, indicatorId, shown, AS_ACTOR)).toEqual({ ok: true });
  expect(
    await decideUpdate(
      db,
      indicatorId,
      { submissionNumber: 1, decision: 'publish_with_history' },
      AS_ADMIN,
    ),
  ).toEqual({ ok: true });
  const at = await scheduledPublishAtOf(db, opened.versionId);
  expect(
    await schedulePublication(
      db,
      indicatorId,
      { scheduledPublishAt: at, shownScheduledPublishAt: at },
      AS_ADMIN,
    ),
  ).toEqual({ ok: true });
  await db.execute(sql`
    UPDATE indicator_version SET scheduled_publish_at = clock_timestamp() - interval '1 minute'
    WHERE id = ${opened.versionId}
  `);
  return publishNext();
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

  it('keeps the data date of an update that brings no new data table, and leaves its read models unrefreshed', async () => {
    const { indicatorId } = await dueUpdate(db, 'Update without data', 'publish_with_history');
    await db
      .update(schema.indicator)
      .set({ dataUpdatedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(schema.indicator.id, indicatorId));
    // A read-model row the indicator's data does not give, which a refresh would delete.
    await db.execute(sql`
      INSERT INTO available_data (indicator_id, area_type_id, area_type_name, area_count)
      SELECT ${indicatorId}, at.id, at.name, 999 FROM area_type at ORDER BY at.id LIMIT 1
    `);
    const rows = await readModelRowsOf(db, indicatorId);
    expect(rows).not.toEqual(await rowsAfterWholeRebuild(db, indicatorId));

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
    expect(rows).toEqual(await rowsAfterWholeRebuild(db, indicatorId));
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

  it('keeps the kept slug when a later update does not rename the indicator', async () => {
    const { indicatorId, versionId } = await dueUpdate(
      db,
      'Kept its slug once',
      'publish_with_history',
      { name: 'Wanted while it waited' },
    );
    const other = await newDraft(db, 'Wanted while it waited');
    await publishNext();
    await db
      .update(indicatorVersion)
      .set({ name: 'Moved out of the way', slug: 'moved-out-of-the-way' })
      .where(eq(indicatorVersion.id, other.versionId));

    const later = await publishAnotherUpdate(indicatorId, 'Not renamed this time.');

    expect(await slugOf(versionId)).toBe('kept-its-slug-once');
    expect(await slugOf(later.versionId)).toBe('kept-its-slug-once');
    expect((await publishedEntriesFor(indicatorId)).at(-1)?.changes).not.toHaveProperty('slug');
  });
});

describe('publishing an update that does not rename the indicator', () => {
  it('keeps a slug that is not the slug of its name', async () => {
    const { indicatorId, versionId, publishedId } = await dueUpdate(
      db,
      'Named unlike its slug',
      'publish_with_history',
    );
    await db
      .update(indicatorVersion)
      .set({ slug: 'an-imported-slug' })
      .where(inArray(indicatorVersion.id, [publishedId, versionId]));

    await publishNext();

    expect(await slugOf(versionId)).toBe('an-imported-slug');
    expect(await publicSite.indicators.findPublishedById(indicatorId)).toMatchObject({
      name: 'Named unlike its slug',
      slug: 'an-imported-slug',
    });
    expect((await publishedEntriesFor(indicatorId))[0]?.changes).not.toHaveProperty('slug');
  });
});

describe("the public indicator's update summaries", () => {
  async function summariesOf({ indicatorId }: OpenedUpdate) {
    return (await publicSite.indicators.findPublishedById(indicatorId))?.updateSummaries;
  }

  it('lists the summaries of updates published with visibility in history, newest first', async () => {
    const update = await dueUpdate(db, 'Updated twice with history', 'publish_with_history', {
      updateSummary: 'Corrected the polarity.',
    });
    const first = await publishNext();
    const second = await publishAnotherUpdate(update.indicatorId, 'Added 2025 data.');

    expect(await summariesOf(update)).toEqual([
      { publishedAt: second.publishedAt.toISOString(), summary: 'Added 2025 data.' },
      { publishedAt: first.publishedAt.toISOString(), summary: 'Corrected the polarity.' },
    ]);
  });

  it('lists the summary of an update published after IMRG review', async () => {
    const reviewed = await dueUpdate(db, 'Published after IMRG review', 'imrg_review', {
      updateSummary: 'Reviewed and corrected.',
    });
    const published = await publishNext();

    expect(await summariesOf(reviewed)).toEqual([
      { publishedAt: published.publishedAt.toISOString(), summary: 'Reviewed and corrected.' },
    ]);
  });

  it('lists none for an update published without visibility in history', async () => {
    const without = await dueUpdate(db, 'Published without history', 'publish_without_history');
    await publishNext();

    expect(await summariesOf(without)).toEqual([]);
  });

  it('lists none for an update not yet published', async () => {
    const waiting = await scheduledUpdate(db, 'Scheduled with history', 'publish_with_history');

    expect(await summariesOf(waiting)).toEqual([]);
  });

  it('lists none from the version an update replaced, though it is still published', async () => {
    const update = await dueUpdate(db, 'One summary only', 'publish_with_history');
    await publishNext();
    await db
      .update(indicatorVersion)
      .set({ updateSummary: 'Copied onto the first version.' })
      .where(eq(indicatorVersion.id, update.publishedId));

    expect(await summariesOf(update)).toEqual([
      expect.objectContaining({ summary: 'Changed the polarity.' }),
    ]);
  });
});
