import { FAKE_USER_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import { auditEntriesFor } from '@fphd/db/testing';
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { updateIndicatorDraft } from './indicator-draft-repository.ts';
import { historyEntries } from './indicator-history-entries.ts';
import { findIndicatorHistory } from './indicator-history-repository.ts';
import {
  getIndicatorById,
  listIndicatorsScheduled,
  listIndicatorsUnderReview,
  listUpdatesAwaitingDecision,
} from './indicator-list-repository.ts';
import { AS_ACTOR, repositoryTest } from './indicator-repository.testing.ts';
import { schedulePublication } from './indicator-scheduling-repository.ts';
import {
  draftUpdatedAt,
  scheduledPublishAtOf,
  submittedUpdate,
} from './indicator-workflow.testing.ts';
import { submitIndicator, withdrawSubmission } from './indicator-workflow-repository.ts';
import { getRevisionRound } from './revision-response-repository.ts';
import { decideUpdate } from './update-decision-repository.ts';

const { indicatorVersion, indicatorVersionSubmission, indicatorVersionSubmissionResponse } = schema;

const ADMIN = FAKE_USER_IDS.admin;
const AS_ADMIN: Actor = { userId: ADMIN, requestId: null };
const ALL = { all: true } as const;

async function latestSubmission(db: Database, versionId: string) {
  const rows = await db
    .select()
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId))
    .orderBy(asc(indicatorVersionSubmission.number));
  const latest = rows.at(-1);
  if (latest === undefined) throw new Error(`no submission of ${versionId}`);
  return latest;
}

async function versionOf(db: Database, versionId: string) {
  const [row] = await db
    .select({ status: indicatorVersion.status, isLocked: indicatorVersion.isLocked })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  return row;
}

describe('decideUpdate', () => {
  repositoryTest(
    'sends an update to IMRG, leaving it submitted and locked, and audits it',
    async ({ db }) => {
      const { indicatorId, versionId } = await submittedUpdate(db, 'Decided for IMRG');

      expect(
        await decideUpdate(
          db,
          indicatorId,
          { submissionNumber: 1, decision: 'imrg_review' },
          AS_ADMIN,
        ),
      ).toEqual({ ok: true });

      expect(await versionOf(db, versionId)).toEqual({ status: 'draft', isLocked: true });
      expect(await latestSubmission(db, versionId)).toMatchObject({
        status: 'submitted',
        updateDecision: 'imrg_review',
        updateDecidedBy: ADMIN,
        updateDecidedAt: expect.any(Date),
        endedBy: null,
      });
      const entries = await auditEntriesFor(db, indicatorId);
      expect(entries.at(-1)).toMatchObject({
        actorId: ADMIN,
        action: 'indicator.update_sent_to_imrg',
        changes: {
          updateDecision: { before: null, after: 'imrg_review' },
          updateDecidedBy: { before: null, after: ADMIN },
        },
      });
    },
  );

  repositoryTest.for(['publish_with_history', 'publish_without_history'] as const)(
    'approves an update to %s, ready to schedule',
    async (decision, { db }) => {
      const { indicatorId, versionId } = await submittedUpdate(db, `Decided ${decision}`);

      expect(
        await decideUpdate(db, indicatorId, { submissionNumber: 1, decision }, AS_ADMIN),
      ).toEqual({ ok: true });

      expect(await versionOf(db, versionId)).toEqual({ status: 'draft', isLocked: true });
      expect(await latestSubmission(db, versionId)).toMatchObject({
        status: 'approved',
        updateDecision: decision,
        endedBy: ADMIN,
      });
      expect((await auditEntriesFor(db, indicatorId)).at(-1)?.action).toBe(
        'indicator.update_approved',
      );
      expect((await listIndicatorsScheduled(db, ALL)).map(({ id }) => id)).toContain(indicatorId);

      const shown = await scheduledPublishAtOf(db, versionId);
      const scheduledPublishAt = new Date('2031-01-06T09:30:00.000Z');
      expect(
        await schedulePublication(
          db,
          indicatorId,
          { scheduledPublishAt, shownScheduledPublishAt: shown },
          AS_ADMIN,
        ),
      ).toEqual({ ok: true });
      expect(await versionOf(db, versionId)).toEqual({ status: 'scheduled', isLocked: true });
    },
  );

  repositoryTest(
    "sends an update back with the core team's response, its flags and no reviewer",
    async ({ db }) => {
      const { indicatorId, versionId } = await submittedUpdate(db, 'Decided for revisions');

      expect(
        await decideUpdate(
          db,
          indicatorId,
          {
            submissionNumber: 1,
            decision: 'request_revisions',
            clarificationRequest: 'Why now?',
            flags: [
              { task: 'update-summary', notes: 'Say what changed' },
              { task: 'polarity', notes: 'Check the source' },
            ],
          },
          AS_ADMIN,
        ),
      ).toEqual({ ok: true });

      expect(await versionOf(db, versionId)).toEqual({ status: 'draft', isLocked: false });
      const latest = await latestSubmission(db, versionId);
      expect(latest).toMatchObject({
        status: 'changes_requested',
        updateDecision: 'request_revisions',
        endedBy: ADMIN,
      });
      expect(
        await db
          .select({
            reviewerId: indicatorVersionSubmissionResponse.reviewerId,
            coreTeamMemberId: indicatorVersionSubmissionResponse.coreTeamMemberId,
            kind: indicatorVersionSubmissionResponse.kind,
            imrgReviewedOn: indicatorVersionSubmissionResponse.imrgReviewedOn,
          })
          .from(indicatorVersionSubmissionResponse)
          .where(eq(indicatorVersionSubmissionResponse.submissionId, latest.id)),
      ).toEqual([
        {
          reviewerId: null,
          coreTeamMemberId: ADMIN,
          kind: 'pre_imrg_feedback',
          imrgReviewedOn: null,
        },
      ]);
      expect((await auditEntriesFor(db, indicatorId)).at(-1)).toMatchObject({
        action: 'indicator.update_revisions_requested',
        changes: {
          updateDecision: { before: null, after: 'request_revisions' },
          response: { before: null, after: expect.objectContaining({ coreTeamMemberId: ADMIN }) },
        },
      });

      // The publisher reads the round as a reviewer's, named by the core team member.
      expect(await getRevisionRound(db, indicatorId)).toMatchObject({
        submissionStatus: 'changes_requested',
        kind: 'pre_imrg_feedback',
        clarificationRequest: { notes: 'Why now?', reviewerName: 'Riley Singh' },
        flags: [
          {
            task: 'polarity',
            notes: 'Check the source',
            reviewerName: 'Riley Singh',
            cleared: false,
          },
          {
            task: 'update-summary',
            notes: 'Say what changed',
            reviewerName: 'Riley Singh',
            cleared: false,
          },
        ],
      });

      // Saving the update summary clears its flag, as saving any flagged task does.
      expect(
        await updateIndicatorDraft(
          db,
          indicatorId,
          'update-summary',
          { updateSummary: 'Polarity checked.' },
          {},
          AS_ACTOR,
        ),
      ).toMatchObject({ ok: true });
      expect((await getRevisionRound(db, indicatorId))?.flags).toContainEqual(
        expect.objectContaining({ task: 'update-summary', cleared: true }),
      );
    },
  );

  repositoryTest('refuses a second decision on the same submission', async ({ db }) => {
    const { indicatorId } = await submittedUpdate(db, 'Decided twice');
    await decideUpdate(db, indicatorId, { submissionNumber: 1, decision: 'imrg_review' }, AS_ADMIN);

    expect(
      await decideUpdate(
        db,
        indicatorId,
        { submissionNumber: 1, decision: 'publish_with_history' },
        AS_ADMIN,
      ),
    ).toEqual({ ok: false, reason: 'not_allowed' });
  });

  repositoryTest('refuses a decision on a submission other than the one shown', async ({ db }) => {
    const { indicatorId, versionId } = await submittedUpdate(db, 'Decided on a stale page');

    expect(
      await decideUpdate(
        db,
        indicatorId,
        { submissionNumber: 2, decision: 'imrg_review' },
        AS_ADMIN,
      ),
    ).toEqual({ ok: false, reason: 'changed' });
    expect(await latestSubmission(db, versionId)).toMatchObject({ updateDecision: null });
  });

  repositoryTest(
    'lets the publisher withdraw an update sent to IMRG, which waits for a new decision once resubmitted',
    async ({ db }) => {
      const { indicatorId, versionId } = await submittedUpdate(db, 'Withdrawn after a decision');
      await decideUpdate(
        db,
        indicatorId,
        { submissionNumber: 1, decision: 'imrg_review' },
        AS_ADMIN,
      );

      expect(await withdrawSubmission(db, indicatorId, 1, AS_ACTOR)).toEqual({ ok: true });
      expect(
        await submitIndicator(db, indicatorId, await draftUpdatedAt(db, versionId), AS_ACTOR),
      ).toEqual({ ok: true });
      expect(await getIndicatorById(db, indicatorId)).toMatchObject({
        draftSubmissionStatus: 'submitted',
        draftUpdateDecision: null,
      });
    },
  );
});

describe('the queues', () => {
  repositoryTest(
    "keeps an update in the core team's queue until it decides, and lets only IMRG review into the IMRG manager's",
    async ({ db }) => {
      const updates = {
        imrg: await submittedUpdate(db, 'Queued for IMRG'),
        revisions: await submittedUpdate(db, 'Queued for revisions'),
        approved: await submittedUpdate(db, 'Queued for approval'),
      };
      // The file's other tests leave their own updates in the queues, so these read only this one's.
      const ids: string[] = Object.values(updates).map(({ indicatorId }) => indicatorId);
      const ours = (rows: readonly { id: string }[]) =>
        rows.map(({ id }) => id).filter((id) => ids.includes(id));
      const awaiting = async () => ours(await listUpdatesAwaitingDecision(db, ALL));
      const underReview = async () => {
        const { unassigned, assigned } = await listIndicatorsUnderReview(db, ALL);
        return ours([...unassigned, ...assigned]);
      };

      expect(await awaiting()).toEqual(ids);
      expect(await underReview()).toEqual([]);

      await decideUpdate(
        db,
        updates.imrg.indicatorId,
        { submissionNumber: 1, decision: 'imrg_review' },
        AS_ADMIN,
      );
      await decideUpdate(
        db,
        updates.revisions.indicatorId,
        {
          submissionNumber: 1,
          decision: 'request_revisions',
          clarificationRequest: 'Why?',
          flags: [],
        },
        AS_ADMIN,
      );
      await decideUpdate(
        db,
        updates.approved.indicatorId,
        { submissionNumber: 1, decision: 'publish_with_history' },
        AS_ADMIN,
      );

      expect(await awaiting()).toEqual([]);
      expect(await underReview()).toEqual([updates.imrg.indicatorId]);
    },
  );
});

describe('the history of a decision', () => {
  repositoryTest(
    "reads the core team's decision and the publication date it confirmed",
    async ({ db }) => {
      const { indicatorId, versionId } = await submittedUpdate(db, 'History of a decision');
      await decideUpdate(
        db,
        indicatorId,
        { submissionNumber: 1, decision: 'publish_without_history' },
        AS_ADMIN,
      );
      await schedulePublication(
        db,
        indicatorId,
        {
          scheduledPublishAt: new Date('2031-01-06T09:30:00.000Z'),
          shownScheduledPublishAt: await scheduledPublishAtOf(db, versionId),
        },
        AS_ADMIN,
      );

      const row = await findIndicatorHistory(db, indicatorId);
      if (row === undefined) throw new Error('no history');

      expect(historyEntries(row).slice(0, 3)).toEqual([
        { kind: 'publication_scheduled', at: expect.any(String), by: 'Riley Singh' },
        {
          kind: 'update_decided',
          at: expect.any(String),
          by: 'Riley Singh',
          decision: 'publish_without_history',
        },
        expect.objectContaining({ kind: 'update_submitted', by: 'Sam Taylor' }),
      ]);
    },
  );

  repositoryTest("reads the core team's request for revisions with its flags", async ({ db }) => {
    const { indicatorId } = await submittedUpdate(db, 'History of a revisions request');
    await decideUpdate(
      db,
      indicatorId,
      {
        submissionNumber: 1,
        decision: 'request_revisions',
        clarificationRequest: null,
        flags: [{ task: 'update-summary', notes: 'Say more' }],
      },
      AS_ADMIN,
    );

    const row = await findIndicatorHistory(db, indicatorId);
    if (row === undefined) throw new Error('no history');

    expect(historyEntries(row)[0]).toEqual({
      kind: 'update_revisions_requested',
      at: expect.any(String),
      by: 'Riley Singh',
      flags: [{ task: 'update-summary', notes: 'Say more' }],
      clarificationRequest: null,
    });
  });
});
