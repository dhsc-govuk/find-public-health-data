import { FAKE_USER_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import type { Actor } from '@fphd/db/audit-log';
import { auditEntriesFor } from '@fphd/db/testing';
import { takeIndicatorStep } from '@fphd/internal-workflow';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import type { EditPrecondition } from './edit-version.ts';
import { AS_ACTOR, newDraft, repositoryTest } from './indicator-repository.testing.ts';
import { completeDraft } from './indicator-workflow.testing.ts';
import { assignReviewers, submitIndicator } from './indicator-workflow-repository.ts';
import {
  addReviewerNote,
  listReviewerNotes,
  type ReviewerNoteRow,
  reviewerNoteVersion,
  updateReviewerNote,
} from './reviewer-note-repository.ts';

const { indicatorVersion, indicatorVersionSubmission } = schema;

const REVIEWER = FAKE_USER_IDS.imrgReviewer;
const SECOND_REVIEWER = FAKE_USER_IDS.secondImrgReviewer;
const AS_REVIEWER: Actor = { userId: REVIEWER, requestId: null };
const AS_SECOND_REVIEWER: Actor = { userId: SECOND_REVIEWER, requestId: null };
const AS_MANAGER: Actor = { userId: FAKE_USER_IDS.imrgManager, requestId: null };

const NOTE_ACTIONS = ['indicator.review_note_added', 'indicator.review_note_updated'];

interface Round {
  indicatorId: string;
  versionId: string;
  shown: Date;
}

/** A complete new draft, submitted and in review with `reviewerIds` assigned. */
async function inReview(
  db: Database,
  name: string,
  reviewerIds: string[] = [REVIEWER],
): Promise<Round> {
  const draft = await newDraft(db, name);
  const shown = await completeDraft(db, draft);
  await submitIndicator(db, draft.indicatorId, shown, AS_ACTOR);
  await assignReviewers(
    db,
    draft.indicatorId,
    { submissionNumber: 1, previousReviewerIds: [], reviewerIds },
    AS_MANAGER,
  );
  return { indicatorId: draft.indicatorId, versionId: draft.versionId, shown };
}

/** The note as its edit form showed it. */
function shownAs(
  note: Pick<ReviewerNoteRow, 'text'>,
): EditPrecondition<Pick<ReviewerNoteRow, 'text'>> {
  return { version: reviewerNoteVersion(note), versionOf: reviewerNoteVersion };
}

async function added(db: Database, indicatorId: string, text: string, actor = AS_REVIEWER) {
  const result = await addReviewerNote(db, indicatorId, text, actor);
  if (!result.ok) throw new Error(`addReviewerNote refused: ${result.reason}`);
  return result.note;
}

async function noteEntries(db: Database, indicatorId: string) {
  return (await auditEntriesFor(db, indicatorId)).filter(({ action }) =>
    NOTE_ACTIONS.includes(action),
  );
}

async function draftUpdatedAt(db: Database, versionId: string): Promise<Date | undefined> {
  const [row] = await db
    .select({ updatedAt: indicatorVersion.updatedAt })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  return row?.updatedAt;
}

async function latestSubmissionId(db: Database, versionId: string): Promise<string | undefined> {
  const rows = await db
    .select({ id: indicatorVersionSubmission.id, number: indicatorVersionSubmission.number })
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId));
  return rows.sort((a, b) => b.number - a.number)[0]?.id;
}

describe('addReviewerNote', () => {
  repositoryTest(
    "adds the reviewer's note to the latest submission, leaving the draft alone",
    async ({ db }) => {
      const { indicatorId, versionId } = await inReview(db, 'Noted by its reviewer');
      const before = await draftUpdatedAt(db, versionId);

      const note = await added(db, indicatorId, 'Check the 2019 dip');

      expect(note).toEqual({
        id: expect.any(String),
        text: 'Check the 2019 dip',
        createdAt: expect.any(Date),
        updatedAt: note.createdAt,
      });
      expect(await draftUpdatedAt(db, versionId)).toEqual(before);
      expect(await noteEntries(db, indicatorId)).toEqual([
        expect.objectContaining({
          actorId: REVIEWER,
          action: 'indicator.review_note_added',
          changes: {
            note: {
              before: null,
              after: {
                id: note.id,
                submissionId: await latestSubmissionId(db, versionId),
                text: 'Check the 2019 dip',
              },
            },
          },
        }),
      ]);
    },
  );

  repositoryTest('refuses a reviewer not assigned to the latest submission', async ({ db }) => {
    const { indicatorId } = await inReview(db, 'Noted by someone unassigned');

    await expect(
      addReviewerNote(db, indicatorId, 'Not mine to note', AS_SECOND_REVIEWER),
    ).resolves.toEqual({ ok: false, reason: 'not_a_reviewer' });
    expect(await noteEntries(db, indicatorId)).toEqual([]);
  });

  repositoryTest('refuses a draft never submitted', async ({ db }) => {
    const { indicatorId } = await newDraft(db, 'Noted before submission');

    await expect(addReviewerNote(db, indicatorId, 'Too early', AS_REVIEWER)).resolves.toEqual({
      ok: false,
      reason: 'not_a_reviewer',
    });
  });

  repositoryTest('refuses a removed reviewer, whose notes remain', async ({ db }) => {
    const { indicatorId } = await inReview(db, 'Noted then unassigned', [
      REVIEWER,
      SECOND_REVIEWER,
    ]);
    const note = await added(db, indicatorId, 'Written while assigned');
    await assignReviewers(
      db,
      indicatorId,
      {
        submissionNumber: 1,
        previousReviewerIds: [REVIEWER, SECOND_REVIEWER],
        reviewerIds: [SECOND_REVIEWER],
      },
      AS_MANAGER,
    );

    await expect(addReviewerNote(db, indicatorId, 'Too late', AS_REVIEWER)).resolves.toEqual({
      ok: false,
      reason: 'not_a_reviewer',
    });
    await expect(
      updateReviewerNote(db, indicatorId, note.id, 'Too late', shownAs(note), AS_REVIEWER),
    ).resolves.toEqual({ ok: false, reason: 'not_a_reviewer' });
    expect(await listReviewerNotes(db, indicatorId, REVIEWER)).toEqual([note]);
  });
});

describe('listReviewerNotes', () => {
  repositoryTest("holds only the author's notes, newest first", async ({ db }) => {
    const { indicatorId } = await inReview(db, 'Noted by two reviewers', [
      REVIEWER,
      SECOND_REVIEWER,
    ]);
    const first = await added(db, indicatorId, 'First');
    await added(db, indicatorId, 'Theirs', AS_SECOND_REVIEWER);
    const second = await added(db, indicatorId, 'Second');

    expect(await listReviewerNotes(db, indicatorId, REVIEWER)).toEqual([second, first]);
  });

  repositoryTest('carries notes across a resubmission', async ({ db }) => {
    const round = await inReview(db, 'Noted in two rounds');
    const earlier = await added(db, round.indicatorId, 'Round one');
    await takeIndicatorStep(db, round.indicatorId, 'request_changes', AS_REVIEWER);
    await db
      .update(indicatorVersionSubmission)
      .set({ revisionResponse: 'Done as asked' })
      .where(eq(indicatorVersionSubmission.indicatorVersionId, round.versionId));
    expect(await submitIndicator(db, round.indicatorId, round.shown, AS_ACTOR)).toEqual({
      ok: true,
    });

    const later = await added(db, round.indicatorId, 'Round two');

    expect(await listReviewerNotes(db, round.indicatorId, REVIEWER)).toEqual([later, earlier]);
    await expect(
      updateReviewerNote(
        db,
        round.indicatorId,
        earlier.id,
        'Round one, revisited',
        shownAs(earlier),
        AS_REVIEWER,
      ),
    ).resolves.toMatchObject({ ok: true, note: { text: 'Round one, revisited' } });
  });
});

describe('updateReviewerNote', () => {
  repositoryTest('changes the text and its date, recording the change', async ({ db }) => {
    const { indicatorId, versionId } = await inReview(db, 'Note edited');
    const note = await added(db, indicatorId, 'Draft thought');
    const before = await draftUpdatedAt(db, versionId);

    const result = await updateReviewerNote(
      db,
      indicatorId,
      note.id,
      'Settled thought',
      shownAs(note),
      AS_REVIEWER,
    );

    expect(result).toEqual({
      ok: true,
      note: { ...note, text: 'Settled thought', updatedAt: expect.any(Date) },
      changed: true,
    });
    if (!result.ok) return;
    expect(result.note.updatedAt.getTime()).toBeGreaterThan(note.updatedAt.getTime());
    expect(await draftUpdatedAt(db, versionId)).toEqual(before);
    const submissionId = await latestSubmissionId(db, versionId);
    expect((await noteEntries(db, indicatorId)).at(-1)).toEqual(
      expect.objectContaining({
        action: 'indicator.review_note_updated',
        changes: {
          note: {
            before: { id: note.id, submissionId, text: 'Draft thought' },
            after: { id: note.id, submissionId, text: 'Settled thought' },
          },
        },
      }),
    );
  });

  repositoryTest('records nothing for an edit that changes nothing', async ({ db }) => {
    const { indicatorId } = await inReview(db, 'Note saved unchanged');
    const note = await added(db, indicatorId, 'As it was');

    await expect(
      updateReviewerNote(db, indicatorId, note.id, 'As it was', shownAs(note), AS_REVIEWER),
    ).resolves.toEqual({ ok: true, note, changed: false });
    expect(await noteEntries(db, indicatorId)).toHaveLength(1);
  });

  repositoryTest("refuses another reviewer's note as not found", async ({ db }) => {
    const { indicatorId } = await inReview(db, 'Note edited by another', [
      REVIEWER,
      SECOND_REVIEWER,
    ]);
    const note = await added(db, indicatorId, 'Mine');

    await expect(
      updateReviewerNote(db, indicatorId, note.id, 'Yours now', shownAs(note), AS_SECOND_REVIEWER),
    ).resolves.toEqual({ ok: false, reason: 'not_found' });
    expect(await listReviewerNotes(db, indicatorId, REVIEWER)).toEqual([note]);
  });

  repositoryTest("refuses a note through another indicator's address", async ({ db }) => {
    const first = await inReview(db, 'Note on the first indicator');
    const second = await inReview(db, 'Note on the second indicator');
    const note = await added(db, first.indicatorId, 'On the first');

    await expect(
      updateReviewerNote(db, second.indicatorId, note.id, 'Moved', shownAs(note), AS_REVIEWER),
    ).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  repositoryTest(
    'refuses as changed an edit from a form shown before another edit',
    async ({ db }) => {
      const { indicatorId } = await inReview(db, 'Note edited in two tabs');
      const note = await added(db, indicatorId, 'Original');
      await updateReviewerNote(db, indicatorId, note.id, 'First tab', shownAs(note), AS_REVIEWER);

      await expect(
        updateReviewerNote(db, indicatorId, note.id, 'Second tab', shownAs(note), AS_REVIEWER),
      ).resolves.toEqual({
        ok: false,
        reason: 'changed',
        version: reviewerNoteVersion({ text: 'First tab' }),
      });
      expect(await listReviewerNotes(db, indicatorId, REVIEWER)).toEqual([
        expect.objectContaining({ text: 'First tab' }),
      ]);
    },
  );
});
