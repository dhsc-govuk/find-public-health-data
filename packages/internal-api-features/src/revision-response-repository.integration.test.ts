import { type Database, schema } from '@fphd/db';
import { auditEntriesFor } from '@fphd/db/testing';
import { desc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import type { EditPrecondition } from './edit-version.ts';
import { updateIndicatorDraft } from './indicator-draft-repository.ts';
import {
  AS_ACTOR,
  AS_OTHER_ACTOR,
  newDraft,
  OTHER_ACTOR,
  repositoryTest,
} from './indicator-repository.testing.ts';
import {
  AS_REVIEWER,
  draftUpdatedAt,
  sentBackDraft,
  ukToday,
} from './indicator-workflow.testing.ts';
import { submitIndicator } from './indicator-workflow-repository.ts';
import { respondToReview } from './review-response-repository.ts';
import {
  getRevisionRound,
  type RevisionReply,
  revisionReplyVersion,
  saveRevisionResponse,
} from './revision-response-repository.ts';

const { indicatorVersion, indicatorVersionSubmission } = schema;

const UNKNOWN_ID = '00000000-0000-7000-8000-000000000009';

/** The reply as a page showed it in round `submissionNumber`, the first unless told. */
function shownReply(
  revisionResponse: string | null,
  submissionNumber = 1,
): EditPrecondition<RevisionReply> {
  return {
    version: revisionReplyVersion({ submissionNumber, revisionResponse }),
    versionOf: revisionReplyVersion,
  };
}

async function latestReplyOf(db: Database, versionId: string) {
  const [row] = await db
    .select({ revisionResponse: indicatorVersionSubmission.revisionResponse })
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId))
    .orderBy(desc(indicatorVersionSubmission.number))
    .limit(1);
  return row?.revisionResponse;
}

async function draftOf(db: Database, versionId: string) {
  const [row] = await db
    .select({ updatedAt: indicatorVersion.updatedAt, updatedBy: indicatorVersion.updatedBy })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  if (row === undefined) throw new Error(`no version ${versionId}`);
  return row;
}

async function replyEntries(db: Database, indicatorId: string) {
  return (await auditEntriesFor(db, indicatorId)).filter(
    ({ action }) => action === 'indicator.revision_response_updated',
  );
}

describe('getRevisionRound', () => {
  repositoryTest('reads the round sent back, with its flags as saved so far', async ({ db }) => {
    const { indicatorId, versionId } = await sentBackDraft(db, 'Round read', ['polarity', 'name'], {
      clarificationRequest: 'Which years?',
    });
    await updateIndicatorDraft(db, indicatorId, 'name', { name: 'Round read' }, {}, AS_ACTOR);

    expect(await getRevisionRound(db, indicatorId)).toEqual({
      hasDraft: true,
      draftLocked: false,
      submissionNumber: 1,
      submissionStatus: 'changes_requested',
      kind: 'minor_revisions',
      clarificationRequest: { notes: 'Which years?', reviewerName: 'Jamie Evans' },
      revisionResponse: null,
      flags: [
        { task: 'name', notes: 'Revise name', reviewerName: 'Jamie Evans', cleared: true },
        { task: 'polarity', notes: 'Revise polarity', reviewerName: 'Jamie Evans', cleared: false },
      ],
    });
    expect(await latestReplyOf(db, versionId)).toBeNull();
  });

  repositoryTest('reads a draft never submitted as having no round', async ({ db }) => {
    const { indicatorId } = await newDraft(db, 'No round yet');

    expect(await getRevisionRound(db, indicatorId)).toEqual({
      hasDraft: true,
      draftLocked: false,
      submissionNumber: null,
      submissionStatus: null,
      kind: null,
      clarificationRequest: null,
      revisionResponse: null,
      flags: [],
    });
  });

  repositoryTest('answers undefined for no indicator', async ({ db }) => {
    expect(await getRevisionRound(db, UNKNOWN_ID)).toBeUndefined();
  });
});

describe('saveRevisionResponse', () => {
  repositoryTest('writes the reply as an edit of the draft, and records it', async ({ db }) => {
    const { indicatorId, versionId, shown } = await sentBackDraft(db, 'Replied', ['polarity']);

    const saved = await saveRevisionResponse(
      db,
      indicatorId,
      'Polarity checked',
      shownReply(null),
      AS_OTHER_ACTOR,
    );

    expect(saved).toEqual({ ok: true, version: shownReply('Polarity checked').version });
    expect(await latestReplyOf(db, versionId)).toBe('Polarity checked');
    const draft = await draftOf(db, versionId);
    expect(draft.updatedBy).toBe(OTHER_ACTOR);
    expect(draft.updatedAt.getTime()).toBeGreaterThan(shown.getTime());
    expect(await replyEntries(db, indicatorId)).toEqual([
      expect.objectContaining({
        actorId: OTHER_ACTOR,
        changes: { revisionResponse: { before: null, after: 'Polarity checked' } },
      }),
    ]);
  });

  repositoryTest('records nothing for the same reply again', async ({ db }) => {
    const { indicatorId } = await sentBackDraft(db, 'Replied twice', ['polarity']);
    await saveRevisionResponse(db, indicatorId, 'Same', shownReply(null), AS_ACTOR);

    expect(
      await saveRevisionResponse(db, indicatorId, 'Same', shownReply('Same'), AS_ACTOR),
    ).toEqual({ ok: true, version: shownReply('Same').version });
    expect(await replyEntries(db, indicatorId)).toHaveLength(1);
  });

  repositoryTest(
    'refuses a reply written since the page was shown as changed, with its version',
    async ({ db }) => {
      const { indicatorId, versionId } = await sentBackDraft(db, 'Replied by a teammate', [
        'polarity',
      ]);
      await saveRevisionResponse(
        db,
        indicatorId,
        'Teammate first',
        shownReply(null),
        AS_OTHER_ACTOR,
      );

      expect(
        await saveRevisionResponse(db, indicatorId, 'Too late', shownReply(null), AS_ACTOR),
      ).toEqual({ ok: false, reason: 'changed', version: shownReply('Teammate first').version });
      expect(await latestReplyOf(db, versionId)).toBe('Teammate first');
    },
  );

  repositoryTest(
    "refuses a page shown in an earlier round as changed, though both rounds' replies started empty",
    async ({ db }) => {
      const { indicatorId, versionId } = await sentBackDraft(db, 'Replied a round late', [
        'polarity',
      ]);
      const firstRound = shownReply(null);
      await updateIndicatorDraft(db, indicatorId, 'polarity', {}, {}, AS_ACTOR);
      await saveRevisionResponse(db, indicatorId, 'Done', firstRound, AS_ACTOR);
      await submitIndicator(db, indicatorId, await draftUpdatedAt(db, versionId), AS_ACTOR);
      expect(
        await respondToReview(
          db,
          indicatorId,
          {
            submissionNumber: 2,
            kind: 'major_revisions',
            imrgReviewedOn: ukToday(),
            clarificationRequest: 'Which years?',
            flags: [],
          },
          AS_REVIEWER,
        ),
      ).toEqual({ ok: true });

      expect(
        await saveRevisionResponse(db, indicatorId, 'Meant for round 1', firstRound, AS_ACTOR),
      ).toEqual({ ok: false, reason: 'changed', version: shownReply(null, 2).version });
      expect(await latestReplyOf(db, versionId)).toBeNull();
    },
  );

  repositoryTest('refuses a draft never sent back as not allowed', async ({ db }) => {
    const { indicatorId } = await newDraft(db, 'Nothing to reply to');

    expect(
      await saveRevisionResponse(db, indicatorId, 'A reply', shownReply(null), AS_ACTOR),
    ).toEqual({ ok: false, reason: 'not_allowed' });
  });

  repositoryTest('refuses a draft resubmitted since as locked', async ({ db }) => {
    const { indicatorId, versionId } = await sentBackDraft(db, 'Resubmitted', ['polarity']);
    await updateIndicatorDraft(db, indicatorId, 'polarity', {}, {}, AS_ACTOR);
    await saveRevisionResponse(db, indicatorId, 'Done', shownReply(null), AS_ACTOR);
    await submitIndicator(db, indicatorId, await draftUpdatedAt(db, versionId), AS_ACTOR);

    expect(
      await saveRevisionResponse(db, indicatorId, 'Again', shownReply('Done'), AS_ACTOR),
    ).toEqual({ ok: false, reason: 'locked' });
  });

  repositoryTest('refuses an indicator with no draft as no draft', async ({ db }) => {
    expect(
      await saveRevisionResponse(db, UNKNOWN_ID, 'A reply', shownReply(null), AS_ACTOR),
    ).toEqual({ ok: false, reason: 'no_draft' });
  });
});

describe('resubmitting a draft sent back', () => {
  repositoryTest(
    'is refused until every flag is cleared and the reply written, and as changed by the reply',
    async ({ db }) => {
      const { indicatorId, versionId, shown } = await sentBackDraft(
        db,
        'Answered then resubmitted',
        ['polarity'],
      );

      expect(await submitIndicator(db, indicatorId, shown, AS_ACTOR)).toEqual({
        ok: false,
        reason: 'flagged',
      });
      await updateIndicatorDraft(db, indicatorId, 'polarity', {}, {}, AS_ACTOR);
      const saved = await draftUpdatedAt(db, versionId);
      expect(await submitIndicator(db, indicatorId, saved, AS_ACTOR)).toEqual({
        ok: false,
        reason: 'no_response',
      });
      await saveRevisionResponse(db, indicatorId, 'Polarity checked', shownReply(null), AS_ACTOR);
      expect(await submitIndicator(db, indicatorId, saved, AS_ACTOR)).toEqual({
        ok: false,
        reason: 'changed',
      });

      expect(
        await submitIndicator(db, indicatorId, await draftUpdatedAt(db, versionId), AS_ACTOR),
      ).toEqual({ ok: true });
      expect((await getRevisionRound(db, indicatorId))?.submissionStatus).toBe('in_review');
    },
  );
});
