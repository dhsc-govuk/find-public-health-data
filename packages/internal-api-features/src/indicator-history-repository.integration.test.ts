import { FAKE_USER_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { confirmDataTable } from './data-table-check-repository.ts';
import { updateIndicatorDraft } from './indicator-draft-repository.ts';
import { historyEntries } from './indicator-history-entries.ts';
import { findIndicatorHistory } from './indicator-history-repository.ts';
import { createDraftFromPublished } from './indicator-publish-repository.ts';
import {
  ACTOR,
  AS_ACTOR,
  indicatorWithTwoPublications,
  newDraft,
  repositoryTest,
} from './indicator-repository.testing.ts';
import { schedulePublication } from './indicator-scheduling-repository.ts';
import {
  AS_ADMIN,
  AS_REVIEWER,
  completeDraft,
  draftUpdatedAt,
  scheduledDraft,
  scheduledPublishAtOf,
  sentBackDraft,
  submittedUpdate,
  ukToday,
} from './indicator-workflow.testing.ts';
import {
  assignReviewers,
  submitIndicator,
  withdrawSubmission,
} from './indicator-workflow-repository.ts';
import { respondToReview } from './review-response-repository.ts';
import { addReviewerNote } from './reviewer-note-repository.ts';

const { indicatorVersion, indicatorVersionSubmission, uploadBatch } = schema;

const AS_MANAGER = { userId: FAKE_USER_IDS.imrgManager, requestId: null };
const REVIEWER_NOTE = 'Kept from the publisher';

async function history(db: Database, indicatorId: string) {
  const row = await findIndicatorHistory(db, indicatorId);
  if (row === undefined) throw new Error(`no history for ${indicatorId}`);
  return row;
}

/** Loads a new data table into the draft, as an upload does: unconfirming the last one. */
async function reload(db: Database, indicatorId: string, versionId: string): Promise<string> {
  const [batch] = await db
    .insert(uploadBatch)
    .values({
      indicatorId,
      indicatorVersionId: versionId,
      originalFilename: 'revised.csv',
      uploadedBy: ACTOR,
      status: 'processed',
    })
    .returning({ id: uploadBatch.id });
  if (batch === undefined) throw new Error('inserted no batch');
  await db
    .update(indicatorVersion)
    .set({ uploadBatchId: batch.id, dataTableConfirmedAt: null })
    .where(eq(indicatorVersion.id, versionId));
  return batch.id;
}

async function reply(db: Database, versionId: string, text: string): Promise<void> {
  await db
    .update(indicatorVersionSubmission)
    .set({ revisionResponse: text })
    .where(
      and(
        eq(indicatorVersionSubmission.indicatorVersionId, versionId),
        eq(indicatorVersionSubmission.status, 'changes_requested'),
      ),
    );
}

describe('findIndicatorHistory', () => {
  repositoryTest('answers nothing for an indicator that does not exist', async ({ db }) => {
    expect(await findIndicatorHistory(db, '01a00000-0000-7000-8000-00000000dead')).toBeUndefined();
  });

  repositoryTest('reads a round sent back, revised, resubmitted and approved', async ({ db }) => {
    const draft = await sentBackDraft(
      db,
      'History of a revised round',
      ['polarity', 'definition-and-rationale', 'data-table'],
      { clarificationRequest: 'Why this source?' },
    );
    const { indicatorId, versionId } = draft;
    expect(await addReviewerNote(db, indicatorId, REVIEWER_NOTE, AS_REVIEWER)).toMatchObject({
      ok: true,
    });

    // Polarity saved as it was; the definition saved as it was, then changed.
    for (const [task, attributes] of [
      ['polarity', {}],
      ['definition-and-rationale', {}],
      ['definition-and-rationale', { definition: 'A revised definition.' }],
    ] as const) {
      expect(await updateIndicatorDraft(db, indicatorId, task, attributes, {}, AS_ACTOR)).toEqual({
        ok: true,
      });
    }
    const batchId = await reload(db, indicatorId, versionId);
    expect(await confirmDataTable(db, indicatorId, batchId, AS_ACTOR)).toMatchObject({ ok: true });
    await reply(db, versionId, 'Done as asked');
    expect(
      await submitIndicator(db, indicatorId, await draftUpdatedAt(db, versionId), AS_ACTOR),
    ).toEqual({ ok: true });
    expect(
      await assignReviewers(
        db,
        indicatorId,
        {
          submissionNumber: 2,
          previousReviewerIds: [FAKE_USER_IDS.imrgReviewer],
          reviewerIds: [FAKE_USER_IDS.secondImrgReviewer, FAKE_USER_IDS.imrgReviewer],
        },
        AS_MANAGER,
      ),
    ).toEqual({ ok: true });
    expect(
      await respondToReview(
        db,
        indicatorId,
        {
          submissionNumber: 2,
          kind: 'approved',
          imrgReviewedOn: ukToday(),
          clarificationRequest: null,
          flags: [],
        },
        AS_REVIEWER,
      ),
    ).toMatchObject({ ok: true });

    const row = await history(db, indicatorId);

    expect(row.versions).toEqual([
      { createdAt: expect.any(String), createdBy: 'Sam Taylor', publishedAt: null },
    ]);
    expect(row.submissions).toEqual([
      expect.objectContaining({
        status: 'changes_requested',
        previousStatus: null,
        submittedBy: 'Sam Taylor',
        endedBy: 'Jamie Evans',
        revisionResponse: 'Done as asked',
        responses: [
          expect.objectContaining({
            reviewer: 'Jamie Evans',
            kind: 'minor_revisions',
            imrgReviewedOn: ukToday(),
            clarificationRequest: 'Why this source?',
            flags: expect.arrayContaining([
              { task: 'polarity', notes: 'Revise polarity' },
              { task: 'definition-and-rationale', notes: 'Revise definition-and-rationale' },
              { task: 'data-table', notes: 'Revise data-table' },
            ]),
          }),
        ],
      }),
      expect.objectContaining({
        status: 'approved',
        previousStatus: 'changes_requested',
        endedBy: 'Jamie Evans',
        revisionResponse: null,
        responses: [expect.objectContaining({ kind: 'approved', flags: [] })],
      }),
    ]);
    expect(row.assignments.map(({ by, reviewers }) => ({ by, reviewers }))).toEqual([
      { by: 'Avery Clarke', reviewers: ['Jamie Evans'] },
      { by: 'Avery Clarke', reviewers: ['Jamie Evans', 'Robin Shaw'] },
    ]);
    // Only the saves after the response, by their fields alone.
    expect(
      row.saves.map(({ action, fields, reloaded }) => ({
        action,
        fields: fields.sort(),
        reloaded,
      })),
    ).toEqual([
      { action: 'indicator.draft_updated', fields: ['flags'], reloaded: false },
      { action: 'indicator.draft_updated', fields: ['flags'], reloaded: false },
      { action: 'indicator.draft_updated', fields: ['definition'], reloaded: false },
      {
        action: 'indicator.data_table_confirmed',
        fields: ['dataTableConfirmedAt', 'flags'],
        reloaded: true,
      },
    ]);
    expect(JSON.stringify(row)).not.toContain(REVIEWER_NOTE);
    // The real saves' audit fields, read through the task field map.
    expect(historyEntries(row).find(({ kind }) => kind === 'resubmitted')).toMatchObject({
      flags: [
        { task: 'data-table', revised: true },
        { task: 'definition-and-rationale', revised: true },
        { task: 'polarity', revised: false },
      ],
      reply: 'Done as asked',
    });
  });

  repositoryTest('reads a withdrawal and the submission after it', async ({ db }) => {
    const draft = await newDraft(db, 'History of a withdrawal');
    const shown = await completeDraft(db, draft);
    await submitIndicator(db, draft.indicatorId, shown, AS_ACTOR);
    expect(await withdrawSubmission(db, draft.indicatorId, 1, AS_ACTOR)).toEqual({ ok: true });
    await submitIndicator(db, draft.indicatorId, shown, AS_ACTOR);

    const { submissions, saves } = await history(db, draft.indicatorId);

    expect(
      submissions.map(({ status, previousStatus, endedBy }) => ({
        status,
        previousStatus,
        endedBy,
      })),
    ).toEqual([
      { status: 'withdrawn', previousStatus: null, endedBy: 'Sam Taylor' },
      { status: 'submitted', previousStatus: 'withdrawn', endedBy: null },
    ]);
    expect(saves).toEqual([]);
  });

  repositoryTest('reads the publication date confirmed, then changed', async ({ db }) => {
    const { indicatorId, versionId } = await scheduledDraft(db, 'History of a publication date');
    const confirmed = await scheduledPublishAtOf(db, versionId);
    expect(
      await schedulePublication(
        db,
        indicatorId,
        {
          scheduledPublishAt: new Date('2030-12-01T15:00:00.000Z'),
          shownScheduledPublishAt: confirmed,
        },
        AS_ADMIN,
      ),
    ).toEqual({ ok: true });

    const row = await history(db, indicatorId);

    expect(row.scheduling).toEqual([
      { at: expect.any(String), by: 'Riley Singh', action: 'indicator.publication_scheduled' },
      { at: expect.any(String), by: 'Riley Singh', action: 'indicator.publication_date_changed' },
    ]);
    expect(historyEntries(row).map(({ kind }) => kind)).toEqual([
      'publication_date_changed',
      'publication_scheduled',
      'responded',
      'imrg_reviewed',
      'reviewers_assigned',
      'submitted',
      'created',
    ]);
  });

  repositoryTest('reads who started an update of the live indicator', async ({ db }) => {
    const { indicatorId } = await indicatorWithTwoPublications(db, 'History of an update');
    expect(await createDraftFromPublished(db, indicatorId, AS_ACTOR)).toMatchObject({ ok: true });

    const row = await history(db, indicatorId);

    expect(row.updates).toEqual([{ at: expect.any(String), by: 'Sam Taylor' }]);
    // The fixture's publications are dated in the future, so they sort before the update.
    expect(historyEntries(row).map(({ kind }) => kind)).toEqual([
      'published',
      'published',
      'update_started',
      'created',
    ]);
  });

  repositoryTest(
    'reads what a submitted update changed, still once it is published',
    async ({ db }) => {
      const { indicatorId, versionId, publishedId } = await submittedUpdate(db, 'Update changes');
      const changes = [
        {
          task: 'polarity',
          parts: [{ kind: 'value', field: 'polarity', value: 'Neither is better' }],
        },
        {
          task: 'update-summary',
          parts: [{ kind: 'value', field: 'updateSummary', value: 'Changed the polarity.' }],
        },
      ];

      expect((await history(db, indicatorId)).submissions).toEqual([
        expect.objectContaining({ versionId, updateChanges: changes }),
      ]);
      expect(historyEntries(await history(db, indicatorId))[0]).toMatchObject({
        kind: 'update_submitted',
        by: 'Sam Taylor',
        changes,
      });

      // The update replaces the version it was opened from, which no longer reads as published.
      await db
        .update(indicatorVersion)
        .set({ status: 'published', publishedAt: new Date('2026-02-01T00:00:00Z') })
        .where(eq(indicatorVersion.id, versionId));
      await db
        .update(indicatorVersion)
        .set({ polarity: 'higher-is-better' })
        .where(eq(indicatorVersion.id, publishedId));

      expect((await history(db, indicatorId)).submissions).toEqual([
        expect.objectContaining({ updateChanges: changes }),
      ]);
    },
  );

  repositoryTest("reads no changes for a new indicator's submission", async ({ db }) => {
    const created = await newDraft(db, 'New indicator, no changes');
    await submitIndicator(db, created.indicatorId, await completeDraft(db, created), AS_ACTOR);

    expect((await history(db, created.indicatorId)).submissions).toEqual([
      expect.objectContaining({ updateChanges: null }),
    ]);
  });

  repositoryTest('reads each version with its publication time', async ({ db }) => {
    const { indicatorId } = await indicatorWithTwoPublications(db, 'History of two publications');

    const { versions } = await history(db, indicatorId);

    expect(versions.map(({ publishedAt }) => publishedAt)).toEqual([
      expect.stringMatching(/^2030-01-01T00:00:00/),
      expect.stringMatching(/^2029-01-01T00:00:00/),
    ]);
  });
});
