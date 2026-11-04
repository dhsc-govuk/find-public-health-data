import { FAKE_USER_IDS } from '@fphd/auth';
import type { Actor } from '@fphd/db/audit-log';
import { describe, expect } from 'vitest';

import { findDraftDataTable } from './data-table-check-repository.ts';
import { findUploadDraftVersion } from './data-upload-repository.ts';
import {
  getIndicatorDraftState,
  getIndicatorNotesForReviewers,
} from './indicator-draft-repository.ts';
import {
  getIndicatorById,
  listIndicatorsPage,
  listIndicatorsUnderReview,
} from './indicator-list-repository.ts';
import { AS_ACTOR, repositoryTest } from './indicator-repository.testing.ts';
import { scheduledDraft } from './indicator-workflow.testing.ts';
import { withdrawSubmission } from './indicator-workflow-repository.ts';
import { addReviewerNote, listReviewerNotes } from './reviewer-note-repository.ts';

const REVIEWER = FAKE_USER_IDS.imrgReviewer;
const AS_REVIEWER: Actor = { userId: REVIEWER, requestId: null };
const ALL = { all: true } as const;

// A scheduled version is still the indicator's working version: every read of the draft finds it,
// locked, and nothing but its own steps can move it.
describe('a scheduled version, read as the draft', () => {
  repositoryTest('is the draft of its list and detail rows', async ({ db }) => {
    const { indicatorId } = await scheduledDraft(db, 'Scheduled rows indicator');

    const detail = await getIndicatorById(db, indicatorId);
    const { indicators } = await listIndicatorsPage(db, 1, 1000, ALL);

    expect(detail).toMatchObject({
      name: 'Scheduled rows indicator',
      indicatorStatus: 'new',
      draftStatus: 'scheduled',
      draftLocked: true,
      draftSubmissionStatus: 'approved',
      draftSubmissionNumber: 1,
      draftReviewers: [expect.objectContaining({ id: REVIEWER })],
    });
    expect(detail?.draftScheduledPublishAt).toBeInstanceOf(Date);
    expect(indicators.find(({ id }) => id === indicatorId)).toMatchObject({
      draftStatus: 'scheduled',
      draftSubmissionStatus: 'approved',
    });
  });

  repositoryTest('stays with the reviewers who approved it', async ({ db }) => {
    const { indicatorId } = await scheduledDraft(db, 'Scheduled queue indicator');

    const { assigned } = await listIndicatorsUnderReview(db, ALL);

    expect(assigned.map(({ id }) => id)).toContain(indicatorId);
  });

  repositoryTest('is the draft of its task list and notes for reviewers', async ({ db }) => {
    const { indicatorId, versionId } = await scheduledDraft(db, 'Scheduled draft indicator');

    const state = await getIndicatorDraftState(db, indicatorId);
    const notes = await getIndicatorNotesForReviewers(db, indicatorId);

    expect(state).toMatchObject({ draftStatus: 'scheduled', draft: { id: versionId } });
    expect(state?.draft?.isLocked).toBe(true);
    expect(notes?.version.id).toBe(versionId);
  });

  repositoryTest('answers its data table and uploads as locked', async ({ db }) => {
    const { indicatorId, versionId } = await scheduledDraft(db, 'Scheduled table indicator');

    await expect(findDraftDataTable(db, indicatorId)).resolves.toEqual({
      found: false,
      reason: 'locked',
    });
    await expect(findUploadDraftVersion(db, indicatorId)).resolves.toEqual({
      id: versionId,
      isLocked: true,
    });
  });

  repositoryTest("keeps its reviewer's notes", async ({ db }) => {
    const { indicatorId } = await scheduledDraft(db, 'Scheduled notes indicator');

    const added = await addReviewerNote(db, indicatorId, 'Checked the sources', AS_REVIEWER);

    expect(added.ok).toBe(true);
    await expect(listReviewerNotes(db, indicatorId, REVIEWER)).resolves.toEqual([
      expect.objectContaining({ text: 'Checked the sources' }),
    ]);
  });

  repositoryTest('takes no step a draft takes', async ({ db }) => {
    const { indicatorId } = await scheduledDraft(db, 'Scheduled step indicator');

    await expect(withdrawSubmission(db, indicatorId, 1, AS_ACTOR)).resolves.toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });
});
