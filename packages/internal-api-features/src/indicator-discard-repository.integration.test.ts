import { PassThrough, Readable } from 'node:stream';

import { TEAM_IDS } from '@fphd/auth';
import { schema } from '@fphd/db';
import { apiLogin, createTestDb } from '@fphd/db/testing';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { v7 as randomUuidV7 } from 'uuid';
import { afterAll, describe, expect, it } from 'vitest';

import { processDataUpload } from './data-upload-load-repository.ts';
import { discardDraft } from './indicator-discard-repository.ts';
import { createIndicatorDraft, updateIndicatorDraft } from './indicator-draft-repository.ts';
import { historyEntries } from './indicator-history-entries.ts';
import { findIndicatorHistory } from './indicator-history-repository.ts';
import { findIndicatorAccess, getIndicatorById } from './indicator-list-repository.ts';
import { createDraftFromPublished } from './indicator-publish-repository.ts';
import { AS_ACTOR, AS_OTHER_ACTOR, newDraft } from './indicator-repository.testing.ts';
import {
  AS_ADMIN,
  AS_REVIEWER,
  answerUpdate,
  completeDraft,
  draftUpdatedAt,
  openedUpdate,
  scheduledDraft,
  sentBackDraft,
  submittedUpdate,
  updateInReview,
} from './indicator-workflow.testing.ts';
import {
  stepWhileWriteHolds,
  writeWhileStepHolds,
} from './indicator-workflow-concurrency.testing.ts';
import {
  replaceReviewers,
  submitIndicator,
  withdrawSubmission,
} from './indicator-workflow-repository.ts';
import { holdOpen, lockWaitedOn } from './scheduled-publication.testing.ts';
import { createTopic, deleteTopic } from './topic-repository.ts';
import { decideUpdate } from './update-decision-repository.ts';

const testDb = await createTestDb({ template: 'core' });
// The discards run as internal_api, so its grants are tested too; the rest runs as the owner.
const internalDb = testDb.connectDb({ login: apiLogin('internal_api') });
const db = testDb.db;

afterAll(() => testDb.drop());

const {
  auditLog,
  indicator,
  indicatorVersion,
  indicatorVersionAgeRange,
  indicatorVersionClassification,
  indicatorVersionSource,
  indicatorVersionSubmission,
  indicatorVersionTopic,
  observation,
  observationDimension,
  topic,
  uploadBatch,
} = schema;

const REFUSED = { ok: false, reason: 'not_allowed' };
const ALREADY_DISCARDED = { ok: false, reason: 'already_discarded' };

const HEADER =
  'area_code,period_start,period_end,value,count,sex,age,category_type,category,value_note';
const VALID_CSV = `${HEADER}\nE92000001,2019-04-01,2020-03-31,83.8,1234,Female,<75 yrs,,,`;
const REFUSED_CSV = `${HEADER}\nE99999999,2019-04-01,2020-03-31,1,,,,,,`;

async function versionOf(versionId: string) {
  const [row] = await db.select().from(indicatorVersion).where(eq(indicatorVersion.id, versionId));
  return row;
}

async function batchesOf(indicatorId: string) {
  return db
    .select()
    .from(uploadBatch)
    .where(eq(uploadBatch.indicatorId, indicatorId))
    .orderBy(asc(uploadBatch.id));
}

async function observationCount(batchId: string): Promise<number> {
  return db.$count(observation, eq(observation.uploadBatchId, batchId));
}

/** Discards the version as a publisher who has just been shown it would. */
async function discardShown(indicatorId: string, versionId: string) {
  return discardDraft(internalDb, indicatorId, await draftUpdatedAt(db, versionId), AS_ACTOR);
}

async function auditOf(
  entityIds: string[],
  action: 'indicator.draft_discarded' | 'upload_batch.deleted',
) {
  return db
    .select({ entityId: auditLog.entityId, actorId: auditLog.actorId, changes: auditLog.changes })
    .from(auditLog)
    .where(and(inArray(auditLog.entityId, entityIds), eq(auditLog.action, action)));
}

function dataUpload(indicatorId: string) {
  const batchId = randomUuidV7();
  return {
    batchId,
    indicatorId,
    blobName: `${indicatorId}/${batchId}.csv`,
    originalFilename: 'data.csv',
    byteSize: 1,
    sha256: '0'.repeat(64),
    actor: AS_ACTOR,
  };
}

async function upload(indicatorId: string, content: string) {
  const file = dataUpload(indicatorId);
  const result = await processDataUpload(
    internalDb,
    file,
    async () => Readable.from([content]),
    new AbortController().signal,
  );
  return { ...file, result };
}

/** Starts loading a file into the draft, holding the file open until `finish` is called. */
async function startUpload(indicatorId: string) {
  const file = new PassThrough();
  let opened: () => void = () => {};
  const reading = new Promise<void>((resolve) => {
    opened = resolve;
  });
  const uploaded = processDataUpload(
    internalDb,
    dataUpload(indicatorId),
    async () => {
      opened();
      return file;
    },
    new AbortController().signal,
  );
  await reading;
  return {
    finish: () => {
      file.end(VALID_CSV);
      return uploaded;
    },
  };
}

/** Writes the publisher's reply to the round that sent the version back, so it can be resent. */
async function reply(versionId: string): Promise<void> {
  await db
    .update(indicatorVersionSubmission)
    .set({ revisionResponse: 'Done as asked' })
    .where(
      and(
        eq(indicatorVersionSubmission.indicatorVersionId, versionId),
        eq(indicatorVersionSubmission.status, 'changes_requested'),
      ),
    );
}

/** A complete new draft submitted by the repository tests' actor, and the `updatedAt` it shows. */
async function submittedDraft(name: string) {
  const draft = await newDraft(db, name);
  const shown = await completeDraft(db, draft);
  expect(await submitIndicator(db, draft.indicatorId, shown, AS_ACTOR)).toEqual({ ok: true });
  return { ...draft, shown };
}

describe('discardDraft of a new indicator', () => {
  it('deletes the indicator with its draft, lists, batches and observations', async () => {
    const draft = await newDraft(db, 'A new indicator deleted whole');
    const { indicatorId, versionId } = draft;
    await completeDraft(db, draft);
    const { batchId, blobName } = await upload(indicatorId, VALID_CSV);
    expect(await observationCount(batchId)).toBe(1);
    const observations = db
      .select({ id: observation.id })
      .from(observation)
      .where(eq(observation.indicatorId, indicatorId));
    const [{ id: observationId } = { id: '' }] = await observations;

    expect(await discardShown(indicatorId, versionId)).toEqual({
      ok: true,
      indicatorDeleted: true,
      deletedBlobNames: [blobName],
    });

    expect(await versionOf(versionId)).toBeUndefined();
    expect(await db.$count(indicator, eq(indicator.id, indicatorId))).toBe(0);
    expect(await batchesOf(indicatorId)).toEqual([]);
    expect(await observationCount(batchId)).toBe(0);
    expect(
      await db.$count(observationDimension, eq(observationDimension.observationId, observationId)),
    ).toBe(0);
    for (const list of [
      indicatorVersionTopic,
      indicatorVersionClassification,
      indicatorVersionAgeRange,
      indicatorVersionSource,
    ]) {
      expect(await db.$count(list, eq(list.indicatorVersionId, versionId))).toBe(0);
    }
    expect(await findIndicatorAccess(db, indicatorId)).toBeUndefined();
    expect(await getIndicatorById(db, indicatorId)).toBeUndefined();
  });

  it('records every value in the audit log, with an entry for the batch', async () => {
    const draft = await newDraft(db, 'A new indicator kept in the audit log');
    const { indicatorId, versionId, shortId } = draft;
    await completeDraft(db, draft);
    const { batchId } = await upload(indicatorId, VALID_CSV);
    const before = await versionOf(versionId);
    const [firstTopic] = await db
      .select({ id: indicatorVersionTopic.topicId })
      .from(indicatorVersionTopic)
      .where(eq(indicatorVersionTopic.indicatorVersionId, versionId));

    await discardShown(indicatorId, versionId);

    const [entry, ...others] = await auditOf([indicatorId], 'indicator.draft_discarded');
    expect(others).toEqual([]);
    expect(entry?.actorId).toBe(AS_ACTOR.userId);
    expect(entry?.changes).toMatchObject({
      id: { before: versionId, after: null },
      indicatorId: { before: indicatorId, after: null },
      name: { before: 'A new indicator kept in the audit log', after: null },
      definition: { before: before?.definition, after: null },
      status: { before: 'draft', after: null },
      uploadBatchId: { before: batchId, after: null },
      topicIds: { before: [firstTopic?.id], after: [] },
      numeratorSources: { before: [expect.any(Object)], after: [] },
      denominatorSources: { before: [expect.any(Object)], after: [] },
      'classificationIds.lifeStage': { before: [expect.any(String)], after: [] },
      teamId: { before: TEAM_IDS.teamA, after: null },
      shortId: { before: shortId, after: null },
    });
    // Every column the version had, but the empty ones and those the entry itself records.
    const unrecorded = ['createdAt', 'createdBy', 'updatedAt', 'updatedBy'];
    expect(
      Object.entries(before ?? {})
        .filter(([column, value]) => value !== null && !unrecorded.includes(column))
        .map(([column]) => column)
        .filter((column) => !(column in (entry?.changes ?? {}))),
    ).toEqual([]);
    expect(await auditOf([batchId], 'upload_batch.deleted')).toEqual([
      {
        entityId: batchId,
        actorId: AS_ACTOR.userId,
        changes: expect.objectContaining({
          originalFilename: { before: 'data.csv', after: null },
          rowCount: { before: 1, after: null },
        }),
      },
    ]);
  });

  it('deletes every batch uploaded to the draft, the refused ones too', async () => {
    const { indicatorId, versionId } = await newDraft(db, 'Uploaded twice, then refused');
    const replaced = await upload(indicatorId, VALID_CSV);
    const loaded = await upload(indicatorId, VALID_CSV);
    const refused = await upload(indicatorId, REFUSED_CSV);
    expect(replaced.result).toMatchObject({ ok: true });
    expect(loaded.result).toMatchObject({ ok: true, deletedBlobNames: [replaced.blobName] });
    expect(refused.result).toMatchObject({ ok: false, reason: 'invalid' });

    const result = await discardShown(indicatorId, versionId);

    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? [...result.deletedBlobNames].sort() : []).toEqual(
      [loaded.blobName, refused.blobName].sort(),
    );
    expect(await batchesOf(indicatorId)).toEqual([]);
    expect(await auditOf([loaded.batchId, refused.batchId], 'upload_batch.deleted')).toHaveLength(
      2,
    );
  });

  it('deletes a withdrawn submission with it, keeping it in the audit log', async () => {
    const { indicatorId, versionId, shown } = await submittedDraft('Withdrawn, then discarded');
    expect(await withdrawSubmission(db, indicatorId, 1, AS_ACTOR)).toEqual({ ok: true });

    expect(await discardDraft(internalDb, indicatorId, shown, AS_ACTOR)).toMatchObject({
      ok: true,
      indicatorDeleted: true,
    });

    expect(
      await db.$count(
        indicatorVersionSubmission,
        eq(indicatorVersionSubmission.indicatorVersionId, versionId),
      ),
    ).toBe(0);
    const [entry] = await auditOf([indicatorId], 'indicator.draft_discarded');
    expect(entry?.changes.submissions).toEqual({
      before: [
        expect.objectContaining({ number: 1, status: 'withdrawn', submittedBy: AS_ACTOR.userId }),
      ],
      after: [],
    });
  });

  it('leaves its name free for another indicator', async () => {
    const name = 'A name used twice';
    const { indicatorId, versionId, shortId } = await newDraft(db, name);
    await discardShown(indicatorId, versionId);

    const again = await newDraft(db, name);

    expect(again.indicatorId).not.toBe(indicatorId);
    expect(again.shortId).toBeGreaterThan(shortId);
  });

  it('lets the form that created it create it again', async () => {
    const name = 'Created again from the old form';
    const id = randomUuidV7();
    const create = () => createIndicatorDraft(internalDb, id, { name }, AS_ACTOR, TEAM_IDS.teamA);
    const first = await create();
    if (!first.ok) throw new Error(`could not create: ${first.reason}`);
    await discardShown(id, first.versionId);

    const again = await create();

    expect(again).toMatchObject({ ok: true, indicatorId: id });
    expect(again).not.toHaveProperty('repeated');
    const row = await findIndicatorHistory(db, id);
    expect(row && historyEntries(row).map(({ kind }) => kind)).toEqual(['created']);
  });

  it('leaves a topic only it was linked to free to delete', async () => {
    const { indicatorId, versionId } = await newDraft(db, 'The only one under its topic');
    const created = await createTopic(
      db,
      { title: 'A short-lived topic', slug: 'a-short-lived-topic', description: 'For a test.' },
      AS_ADMIN,
    );
    if (!created.ok) throw new Error(`could not create the topic: ${created.reason}`);
    await updateIndicatorDraft(
      db,
      indicatorId,
      'tagging',
      {},
      { topicIds: [created.topic.id] },
      AS_ACTOR,
    );
    expect(await deleteTopic(internalDb, created.topic.id, AS_ADMIN)).toEqual({
      ok: false,
      reason: 'in_use',
    });

    await discardShown(indicatorId, versionId);

    expect(await deleteTopic(internalDb, created.topic.id, AS_ADMIN)).toEqual({ ok: true });
    expect(await db.$count(topic, eq(topic.id, created.topic.id))).toBe(0);
  });
});

describe('discardDraft of an update', () => {
  it('keeps the live indicator and the published batch an update kept', async () => {
    const { indicatorId, versionId, publishedId } = await openedUpdate(db, 'Update of kept data');
    const published = await versionOf(publishedId);
    const batchId = published?.uploadBatchId;
    if (!batchId) throw new Error('the published version has no batch');
    expect(await versionOf(versionId)).toMatchObject({ uploadBatchId: batchId });
    const batches = await batchesOf(indicatorId);
    // Only an indicator imported from Fingertips has this, which an update copies.
    const fingertipsFormatting = { maximum: 0.9, decimalPlaces: 2 };
    await db
      .update(indicatorVersion)
      .set({ fingertipsFormatting })
      .where(eq(indicatorVersion.id, versionId));

    expect(await discardShown(indicatorId, versionId)).toEqual({
      ok: true,
      indicatorDeleted: false,
      deletedBlobNames: [],
    });

    expect(await versionOf(versionId)).toBeUndefined();
    expect(await versionOf(publishedId)).toEqual(published);
    expect(await batchesOf(indicatorId)).toEqual(batches);
    expect(await getIndicatorById(db, indicatorId)).toMatchObject({
      name: published?.name,
      indicatorStatus: 'live',
      draftStatus: null,
      draftUpdatedAt: null,
    });
    expect(await auditOf([batchId], 'upload_batch.deleted')).toEqual([]);
    const [entry] = await auditOf([indicatorId], 'indicator.draft_discarded');
    expect(entry?.changes).toMatchObject({
      fingertipsFormatting: { before: fingertipsFormatting, after: null },
    });
  });

  it('deletes its own batch, keeping the published one and its observations', async () => {
    const created = await newDraft(db, 'Update with data of its own');
    const { indicatorId } = created;
    await completeDraft(db, created);
    const published = await upload(indicatorId, VALID_CSV);
    await db
      .update(indicatorVersion)
      .set({ status: 'published', isLocked: true, publishedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(indicatorVersion.id, created.versionId));
    const opened = await createDraftFromPublished(db, indicatorId, AS_ACTOR);
    if (!opened.ok) throw new Error(`could not open a draft: ${opened.reason}`);
    const own = await upload(indicatorId, VALID_CSV);

    expect(await discardShown(indicatorId, opened.versionId)).toEqual({
      ok: true,
      indicatorDeleted: false,
      deletedBlobNames: [own.blobName],
    });

    expect((await batchesOf(indicatorId)).map(({ id }) => id)).toEqual(
      expect.arrayContaining([published.batchId]),
    );
    expect((await batchesOf(indicatorId)).map(({ id }) => id)).not.toContain(own.batchId);
    expect(await observationCount(published.batchId)).toBe(1);
    expect(await observationCount(own.batchId)).toBe(0);
    expect(await versionOf(created.versionId)).toMatchObject({ uploadBatchId: published.batchId });
  });

  it('leaves the indicator open to another update, with the published answers', async () => {
    const { indicatorId, versionId, publishedId } = await openedUpdate(db, 'Updated once more');
    const published = await versionOf(publishedId);
    await answerUpdate(db, { indicatorId, versionId }, { polarity: 'no-polarity' });
    expect(await discardShown(indicatorId, versionId)).toMatchObject({ ok: true });

    const fresh = await createDraftFromPublished(db, indicatorId, AS_ACTOR);

    if (!fresh.ok) throw new Error(`could not update again: ${fresh.reason}`);
    expect(await versionOf(fresh.versionId)).toMatchObject({
      status: 'draft',
      polarity: published?.polarity,
    });
  });

  it('discards one sent to IMRG and withdrawn before reviewers were assigned', async () => {
    const { indicatorId, versionId } = await submittedUpdate(db, 'Update withdrawn from IMRG');
    await decideUpdate(db, indicatorId, { submissionNumber: 1, decision: 'imrg_review' }, AS_ADMIN);
    expect(await withdrawSubmission(db, indicatorId, 1, AS_ACTOR)).toEqual({ ok: true });

    expect(await discardShown(indicatorId, versionId)).toMatchObject({ ok: true });
  });

  it('leaves its history with the update that replaced it, and the audit log with both', async () => {
    const { indicatorId, versionId } = await submittedUpdate(db, 'History after a discard');
    await withdrawSubmission(db, indicatorId, 1, AS_ACTOR);
    const entriesNow = async () => {
      const row = await findIndicatorHistory(db, indicatorId);
      if (row === undefined) throw new Error(`no history for ${indicatorId}`);
      return historyEntries(row);
    };
    const kindsNow = async () => (await entriesNow()).map(({ kind }) => kind);
    expect(await kindsNow()).toEqual(
      expect.arrayContaining(['update_started', 'update_submitted', 'withdrawn']),
    );

    expect(await discardShown(indicatorId, versionId)).toMatchObject({ ok: true });
    const untouched = await kindsNow();
    expect([...untouched].sort()).toEqual(['created', 'published']);

    const fresh = await createDraftFromPublished(db, indicatorId, AS_OTHER_ACTOR);
    if (!fresh.ok) throw new Error(`could not update again: ${fresh.reason}`);
    const shown = await answerUpdate(
      db,
      { indicatorId, versionId: fresh.versionId },
      { polarity: 'no-polarity' },
    );
    expect(await submitIndicator(db, indicatorId, shown, AS_ACTOR)).toEqual({ ok: true });

    expect(await kindsNow()).toEqual(['update_submitted', 'update_started', ...untouched]);
    expect((await entriesNow()).find(({ kind }) => kind === 'update_started')).toMatchObject({
      by: 'Casey Patel',
    });
    const audited = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, indicatorId),
          inArray(auditLog.action, [
            'indicator.draft_created_from_published',
            'indicator.submission_withdrawn',
            'indicator.draft_discarded',
          ]),
        ),
      );
    expect(audited.map(({ action }) => action).sort()).toEqual([
      'indicator.draft_created_from_published',
      'indicator.draft_created_from_published',
      'indicator.draft_discarded',
      'indicator.submission_withdrawn',
    ]);
  });
});

describe('discardDraft refuses', () => {
  async function expectKept(indicatorId: string, versionId: string) {
    const before = await versionOf(versionId);
    expect(await discardShown(indicatorId, versionId)).toEqual(REFUSED);
    expect(await versionOf(versionId)).toEqual(before);
    expect(await auditOf([indicatorId], 'indicator.draft_discarded')).toEqual([]);
  }

  it('a submitted draft', async () => {
    const { indicatorId, versionId } = await submittedDraft('Submitted, not discarded');
    await expectKept(indicatorId, versionId);
  });

  it('an update in review', async () => {
    const { indicatorId, versionId } = await updateInReview(db, 'In review, not discarded');
    await expectKept(indicatorId, versionId);
  });

  it('a draft sent back for revisions', async () => {
    const { indicatorId, versionId } = await sentBackDraft(db, 'Sent back, not discarded', [
      'polarity',
    ]);
    await expectKept(indicatorId, versionId);
  });

  it('an approved draft', async () => {
    const { indicatorId, versionId } = await sentBackDraft(db, 'Approved, not discarded', [], {
      kind: 'approved',
    });
    await expectKept(indicatorId, versionId);
  });

  it('a scheduled draft', async () => {
    const { indicatorId, versionId } = await scheduledDraft(db, 'Scheduled, not discarded');
    await expectKept(indicatorId, versionId);
  });

  it("a new indicator's draft sent back, resubmitted and then withdrawn", async () => {
    const { indicatorId, versionId, shown } = await sentBackDraft(
      db,
      'Resubmitted new indicator, withdrawn',
      [],
      { clarificationRequest: 'Why this source?' },
    );
    await reply(versionId);
    // The reviewer submits it, so no reviewer is carried over and it can be withdrawn.
    expect(await submitIndicator(db, indicatorId, shown, AS_REVIEWER)).toEqual({ ok: true });
    expect(await withdrawSubmission(db, indicatorId, 2, AS_ACTOR)).toEqual({ ok: true });

    expect(await getIndicatorById(db, indicatorId)).toMatchObject({
      draftSubmissionStatus: 'withdrawn',
      draftSubmissionsWithdrawn: false,
    });
    await expectKept(indicatorId, versionId);
  });

  it('an update sent back, resubmitted and then withdrawn', async () => {
    const { indicatorId, versionId } = await submittedUpdate(db, 'Resubmitted update, withdrawn');
    expect(
      await decideUpdate(
        db,
        indicatorId,
        {
          submissionNumber: 1,
          decision: 'request_revisions',
          clarificationRequest: 'Why now?',
          flags: [],
        },
        AS_ADMIN,
      ),
    ).toEqual({ ok: true });
    await reply(versionId);
    const shown = await draftUpdatedAt(db, versionId);
    expect(await submitIndicator(db, indicatorId, shown, AS_ACTOR)).toEqual({ ok: true });
    expect(await withdrawSubmission(db, indicatorId, 2, AS_ACTOR)).toEqual({ ok: true });

    expect(await getIndicatorById(db, indicatorId)).toMatchObject({
      draftSubmissionStatus: 'withdrawn',
      draftSubmissionsWithdrawn: false,
    });
    await expectKept(indicatorId, versionId);
  });

  it('a draft edited since it was shown, as changed', async () => {
    const { indicatorId, versionId } = await newDraft(db, 'Edited since it was shown');
    const shown = await draftUpdatedAt(db, versionId);
    await updateIndicatorDraft(
      db,
      indicatorId,
      'definition-and-rationale',
      { definition: 'A new definition.' },
      {},
      AS_OTHER_ACTOR,
    );

    expect(await discardDraft(internalDb, indicatorId, shown, AS_ACTOR)).toEqual({
      ok: false,
      reason: 'changed',
    });
    expect(await versionOf(versionId)).toBeDefined();
  });

  it.each([
    ['the same user', AS_ACTOR],
    ['a colleague', AS_OTHER_ACTOR],
  ])('a second post by %s, as already discarded', async (who, actor) => {
    const { indicatorId, versionId } = await openedUpdate(db, `Discarded before ${who}`);
    const shown = await draftUpdatedAt(db, versionId);
    expect(await discardDraft(internalDb, indicatorId, shown, AS_ACTOR)).toMatchObject({
      ok: true,
    });

    expect(await discardDraft(internalDb, indicatorId, shown, actor)).toEqual(ALREADY_DISCARDED);
    expect(await auditOf([indicatorId], 'indicator.draft_discarded')).toHaveLength(1);
  });

  it('a second post once another update is open, as changed', async () => {
    const { indicatorId, versionId } = await openedUpdate(db, 'Discarded, then updated again');
    const shown = await draftUpdatedAt(db, versionId);
    await discardDraft(internalDb, indicatorId, shown, AS_ACTOR);
    const fresh = await createDraftFromPublished(db, indicatorId, AS_OTHER_ACTOR);
    if (!fresh.ok) throw new Error(`could not update again: ${fresh.reason}`);

    expect(await discardDraft(internalDb, indicatorId, shown, AS_ACTOR)).toEqual({
      ok: false,
      reason: 'changed',
    });
    expect(await versionOf(fresh.versionId)).toMatchObject({ status: 'draft' });
  });

  it('an indicator that does not exist, as already discarded', async () => {
    expect(await discardDraft(internalDb, randomUuidV7(), new Date(), AS_ACTOR)).toEqual(
      ALREADY_DISCARDED,
    );
  });
});

describe('discardDraft at the same time as', () => {
  it('a submission that goes first is refused', async () => {
    const draft = await newDraft(db, 'Discard behind a submission');
    const shown = await completeDraft(db, draft);

    expect(
      await writeWhileStepHolds(db, draft.indicatorId, 'submit', () =>
        discardDraft(internalDb, draft.indicatorId, shown, AS_ACTOR),
      ),
    ).toEqual({ step: { ok: true }, write: REFUSED });
    expect(await versionOf(draft.versionId)).toMatchObject({ status: 'draft' });
  });

  it('a submission that comes second leaves it no draft', async () => {
    const draft = await newDraft(db, 'Submission behind a discard');
    const shown = await completeDraft(db, draft);

    expect(
      await stepWhileWriteHolds(
        db,
        () => discardDraft(internalDb, draft.indicatorId, shown, AS_ACTOR),
        () => submitIndicator(db, draft.indicatorId, shown, AS_OTHER_ACTOR),
      ),
    ).toMatchObject({ write: { ok: true }, step: { ok: false, reason: 'no_draft' } });
  });

  it('reviewers being assigned is refused', async () => {
    const { indicatorId, versionId, shown } = await submittedDraft('Discard behind a review');

    expect(
      await writeWhileStepHolds(
        db,
        indicatorId,
        'assign_reviewers',
        () => discardDraft(internalDb, indicatorId, shown, AS_ACTOR),
        { stepWrite: replaceReviewers([AS_REVIEWER.userId], AS_ADMIN) },
      ),
    ).toEqual({ step: { ok: true }, write: REFUSED });
    expect(await versionOf(versionId)).toMatchObject({ status: 'draft' });
  });

  it('an edit that goes first is refused as changed', async () => {
    const { indicatorId, versionId } = await newDraft(db, 'Discard behind an edit');
    const shown = await draftUpdatedAt(db, versionId);

    expect(
      await stepWhileWriteHolds(
        db,
        () =>
          updateIndicatorDraft(
            db,
            indicatorId,
            'definition-and-rationale',
            { definition: 'Edited meanwhile.' },
            {},
            AS_OTHER_ACTOR,
          ),
        () => discardDraft(internalDb, indicatorId, shown, AS_ACTOR),
      ),
    ).toEqual({ write: { ok: true }, step: { ok: false, reason: 'changed' } });
  });

  it('an edit that comes second leaves it no draft', async () => {
    const { indicatorId, versionId } = await newDraft(db, 'Edit behind a discard');
    const shown = await draftUpdatedAt(db, versionId);

    expect(
      await stepWhileWriteHolds(
        db,
        () => discardDraft(internalDb, indicatorId, shown, AS_ACTOR),
        () =>
          updateIndicatorDraft(
            db,
            indicatorId,
            'definition-and-rationale',
            { definition: 'Edited too late.' },
            {},
            AS_OTHER_ACTOR,
          ),
      ),
    ).toMatchObject({ write: { ok: true }, step: { ok: false, reason: 'no_draft' } });
  });

  it('its own copy waits, then finds no draft', async () => {
    const { indicatorId, versionId } = await newDraft(db, 'Discarded by a double click');
    const shown = await draftUpdatedAt(db, versionId);
    const discard = () => discardDraft(internalDb, indicatorId, shown, AS_ACTOR);

    expect(await stepWhileWriteHolds(db, discard, discard)).toMatchObject({
      write: { ok: true },
      step: ALREADY_DISCARDED,
    });
    expect(await auditOf([indicatorId], 'indicator.draft_discarded')).toHaveLength(1);
  });

  it('an upload that is running is refused straight away, and the upload loads', async () => {
    const { indicatorId, versionId } = await newDraft(db, 'Discard beside an upload');
    const shown = await draftUpdatedAt(db, versionId);
    const running = await startUpload(indicatorId);

    expect(await discardDraft(internalDb, indicatorId, shown, AS_ACTOR)).toEqual({
      ok: false,
      reason: 'upload_running',
    });

    expect(await running.finish()).toMatchObject({ ok: true, rowCount: 1 });
    expect(await discardDraft(internalDb, indicatorId, shown, AS_ACTOR)).toEqual({
      ok: false,
      reason: 'changed',
    });
    expect(await discardShown(indicatorId, versionId)).toMatchObject({
      ok: true,
      indicatorDeleted: true,
    });
  });

  it('an upload that starts after it waits, then finds no draft', async () => {
    const { indicatorId, versionId } = await newDraft(db, 'Upload behind a discard');
    const shown = await draftUpdatedAt(db, versionId);

    const { write, step } = await stepWhileWriteHolds(
      db,
      () => discardDraft(internalDb, indicatorId, shown, AS_ACTOR),
      () => upload(indicatorId, VALID_CSV),
    );

    expect(write).toMatchObject({ ok: true });
    expect(step.result).toMatchObject({ ok: false, reason: 'no_draft' });
    expect(await batchesOf(indicatorId)).toEqual([]);
  });
});

// The table locks a live-data package takes, in the order `applyDataMigration` takes them.
const PACKAGE_LOCK = sql`LOCK TABLE indicator, indicator_version, indicator_version_topic,
  indicator_version_classification IN SHARE ROW EXCLUSIVE MODE`;

describe('discardDraft beside a live data package', () => {
  it.each([
    ['a new indicator', newDraft],
    ['an update', openedUpdate],
  ])(
    'holds back a package started part way through %s, rather than deadlocking',
    async (kind, draftOf) => {
      const { indicatorId, versionId } = await draftOf(db, `Package during ${kind}`);
      const shown = await draftUpdatedAt(db, versionId);
      // This trigger pauses the discard just after its first write to the version. It makes the
      // discard wait for advisory lock 759, which the test holds until it releases `pause`.
      await db.execute(sql`
      CREATE FUNCTION pause_discard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(759); RETURN NEW; END $$
    `);
      await db.execute(
        sql.raw(`
        CREATE TRIGGER pause_discard AFTER UPDATE ON indicator_version
        FOR EACH ROW WHEN (NEW.id = '${versionId}') EXECUTE FUNCTION pause_discard()
      `),
      );
      const pause = await holdOpen(db, [sql`SELECT pg_advisory_xact_lock(759)`]);

      try {
        const discarding = discardDraft(internalDb, indicatorId, shown, AS_ACTOR);
        await lockWaitedOn(db, 'advisory');
        const migrating = db.transaction(async (tx) => {
          await tx.execute(PACKAGE_LOCK);
        });
        await lockWaitedOn(db, 'relation');
        await pause.release();

        const [discarded, migrated] = await Promise.allSettled([discarding, migrating]);
        expect(discarded).toMatchObject({ status: 'fulfilled', value: { ok: true } });
        expect(migrated).toEqual({ status: 'fulfilled', value: undefined });
      } finally {
        await pause.release();
        await db.execute(sql`DROP TRIGGER pause_discard ON indicator_version`);
        await db.execute(sql`DROP FUNCTION pause_discard()`);
      }
      expect(await versionOf(versionId)).toBeUndefined();
    },
  );

  it('waits for a package that has its tables, then discards the draft', async () => {
    const { indicatorId, versionId } = await newDraft(db, 'Discard behind a package');
    const shown = await draftUpdatedAt(db, versionId);
    const migration = await holdOpen(db, [PACKAGE_LOCK]);
    const discarding = discardDraft(internalDb, indicatorId, shown, AS_ACTOR);

    try {
      await lockWaitedOn(db, 'relation');
    } finally {
      await migration.release();
    }

    expect(await discarding).toMatchObject({ ok: true, indicatorDeleted: true });
  });
});
