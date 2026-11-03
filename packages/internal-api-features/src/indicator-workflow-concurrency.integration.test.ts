import { PassThrough, Readable } from 'node:stream';

import { FAKE_USER_IDS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import { eq } from 'drizzle-orm';
import { v7 as randomUuidV7 } from 'uuid';
import { describe, expect } from 'vitest';
import { confirmDataTable } from './data-table-check-repository.ts';
import { processDataUpload } from './data-upload-load-repository.ts';
import { updateIndicatorDraft } from './indicator-draft-repository.ts';
import {
  AS_ACTOR,
  AS_OTHER_ACTOR,
  LOCK_WAIT,
  newDraft,
  repositoryTest,
} from './indicator-repository.testing.ts';
import { completeDraft, draftUpdatedAt, ukToday } from './indicator-workflow.testing.ts';
import {
  stepWhileWriteHolds,
  writeWhileStepHolds,
} from './indicator-workflow-concurrency.testing.ts';
import {
  assignReviewers,
  replaceReviewers,
  submitIndicator,
  takeIndicatorStep,
  withdrawSubmission,
} from './indicator-workflow-repository.ts';
import {
  type ReviewResponse,
  respondToReview,
  responseWrite,
} from './review-response-repository.ts';

const {
  indicatorVersion,
  indicatorVersionSubmission,
  indicatorVersionSubmissionResponse,
  indicatorVersionSubmissionReviewer,
} = schema;

const AS_MANAGER = { userId: FAKE_USER_IDS.imrgManager, requestId: null };
const REVIEWER = FAKE_USER_IDS.imrgReviewer;
const OTHER_REVIEWER = FAKE_USER_IDS.publisherAndReviewer;

const HEADER =
  'area_code,period_start,period_end,value,count,sex,age,category_type,category,value_note';
const VALID_CSV = `${HEADER}\nE92000001,2019-04-01,2020-03-31,83.8,1234,Female,<75 yrs,,,`;
const REFUSED_CSV = `${HEADER}\nE99999999,2019-04-01,2020-03-31,1,,,,,,`;

/** A new indicator's complete draft, the `updatedAt` its task list shows, and its batch. */
async function completeNewDraft(db: Database, name: string) {
  const created = await newDraft(db, name);
  const shown = await completeDraft(db, created);
  const [row] = await db
    .select({ uploadBatchId: indicatorVersion.uploadBatchId })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, created.versionId));
  return { ...created, shown, batchId: row?.uploadBatchId ?? '' };
}

async function submissionCount(db: Database, versionId: string): Promise<number> {
  const rows = await db
    .select({ id: indicatorVersionSubmission.id })
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId));
  return rows.length;
}

/** A new indicator's complete draft, submitted once. */
async function submittedNewDraft(db: Database, name: string) {
  const draft = await completeNewDraft(db, name);
  await submitIndicator(db, draft.indicatorId, draft.shown, AS_ACTOR);
  return draft;
}

/** Assigns `reviewerIds` to the draft's first submission as a manager shown none assigned. */
function assign(db: Database, indicatorId: string, reviewerIds: string[]) {
  return assignReviewers(
    db,
    indicatorId,
    { submissionNumber: 1, previousReviewerIds: [], reviewerIds },
    AS_MANAGER,
  );
}

async function submissionStatuses(db: Database, versionId: string): Promise<string[]> {
  const rows = await db
    .select({ status: indicatorVersionSubmission.status })
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId));
  return rows.map(({ status }) => status);
}

async function reviewerIdsOf(db: Database, indicatorId: string): Promise<string[]> {
  const rows = await db
    .select({ reviewerId: indicatorVersionSubmissionReviewer.reviewerId })
    .from(indicatorVersionSubmissionReviewer)
    .innerJoin(
      indicatorVersionSubmission,
      eq(indicatorVersionSubmission.id, indicatorVersionSubmissionReviewer.submissionId),
    )
    .where(eq(indicatorVersionSubmission.indicatorId, indicatorId));
  return rows.map(({ reviewerId }) => reviewerId);
}

async function draftOf(db: Database, versionId: string) {
  const [row] = await db.select().from(indicatorVersion).where(eq(indicatorVersion.id, versionId));
  if (row === undefined) throw new Error(`no version ${versionId}`);
  return row;
}

/** Loads the file `openFile` opens into the draft. */
function upload(db: Database, indicatorId: string, openFile: () => Promise<Readable>) {
  const batchId = randomUuidV7();
  return processDataUpload(
    db,
    {
      batchId,
      indicatorId,
      blobName: `${indicatorId}/${batchId}.csv`,
      originalFilename: 'data.csv',
      byteSize: 1,
      sha256: '0'.repeat(64),
      actor: AS_OTHER_ACTOR,
    },
    openFile,
    new AbortController().signal,
  );
}

/** Starts loading a file into the draft, holding the file open until `finish` is called. */
async function startUpload(db: Database, indicatorId: string) {
  const file = new PassThrough();
  let opened: () => void = () => {};
  const reading = new Promise<void>((resolve) => {
    opened = resolve;
  });
  const uploaded = upload(db, indicatorId, async () => {
    opened();
    return file;
  });
  await reading;
  return {
    finish: (content: string) => {
      file.end(content);
      return uploaded;
    },
  };
}

describe('a submission beside an edit', () => {
  repositoryTest(
    'is refused as changed when a section save holding the draft commits first',
    async ({ db }) => {
      const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Save then submit');

      const result = await stepWhileWriteHolds(
        db,
        () =>
          updateIndicatorDraft(
            db,
            indicatorId,
            'definition-and-rationale',
            { definition: 'Saved' },
            {},
            AS_OTHER_ACTOR,
          ),
        () => submitIndicator(db, indicatorId, shown, AS_ACTOR),
      );

      expect(result).toEqual({ write: { ok: true }, step: { ok: false, reason: 'changed' } });
      expect((await draftOf(db, versionId)).isLocked).toBe(false);
    },
  );

  repositoryTest(
    'is refused as changed when a data table confirmation holding the draft commits first',
    async ({ db }) => {
      const { indicatorId, versionId, batchId } = await completeNewDraft(db, 'Confirm then submit');
      await db
        .update(indicatorVersion)
        .set({ dataTableConfirmedAt: null })
        .where(eq(indicatorVersion.id, versionId));
      const shown = await draftUpdatedAt(db, versionId);

      const result = await stepWhileWriteHolds(
        db,
        () => confirmDataTable(db, indicatorId, batchId, AS_OTHER_ACTOR),
        () => submitIndicator(db, indicatorId, shown, AS_ACTOR),
      );

      expect(result).toMatchObject({ write: { ok: true }, step: { ok: false, reason: 'changed' } });
      expect((await draftOf(db, versionId)).isLocked).toBe(false);
    },
  );

  repositoryTest('locks out a section save that waited on it', async ({ db }) => {
    const { indicatorId, versionId } = await newDraft(db, 'Save waits on a submission');

    const result = await writeWhileStepHolds(db, indicatorId, 'submit', () =>
      updateIndicatorDraft(
        db,
        indicatorId,
        'definition-and-rationale',
        { definition: 'Too late' },
        {},
        AS_OTHER_ACTOR,
      ),
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'locked' } });
    expect((await draftOf(db, versionId)).definition).toBeNull();
  });

  repositoryTest('locks out a data table confirmation that waited on it', async ({ db }) => {
    const { indicatorId, versionId, batchId } = await completeNewDraft(db, 'Confirm waits');
    await db
      .update(indicatorVersion)
      .set({ dataTableConfirmedAt: null })
      .where(eq(indicatorVersion.id, versionId));

    const result = await writeWhileStepHolds(db, indicatorId, 'submit', () =>
      confirmDataTable(db, indicatorId, batchId, AS_OTHER_ACTOR),
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'locked' } });
    expect((await draftOf(db, versionId)).dataTableConfirmedAt).toBeNull();
  });

  repositoryTest('lets a section save that waited on a withdrawal through', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(
      db,
      'Save waits on a withdrawal',
    );
    await submitIndicator(db, indicatorId, shown, AS_ACTOR);

    const result = await writeWhileStepHolds(db, indicatorId, 'withdraw', () =>
      updateIndicatorDraft(
        db,
        indicatorId,
        'definition-and-rationale',
        { definition: 'After withdrawal' },
        {},
        AS_OTHER_ACTOR,
      ),
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: true } });
    expect((await draftOf(db, versionId)).definition).toBe('After withdrawal');
  });
});

describe('two steps at once', () => {
  repositoryTest('refuse the second of two submissions', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Submitted together');

    const result = await writeWhileStepHolds(db, indicatorId, 'submit', () =>
      submitIndicator(db, indicatorId, shown, AS_OTHER_ACTOR),
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'not_allowed' } });
    expect(await submissionCount(db, versionId)).toBe(1);
  });

  repositoryTest('refuse the second of two withdrawals', async ({ db }) => {
    const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Withdrawn together');
    await submitIndicator(db, indicatorId, shown, AS_ACTOR);

    const result = await writeWhileStepHolds(db, indicatorId, 'withdraw', () =>
      withdrawSubmission(db, indicatorId, 1, AS_OTHER_ACTOR),
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'not_allowed' } });
    expect(await submissionCount(db, versionId)).toBe(1);
    expect((await draftOf(db, versionId)).isLocked).toBe(false);
  });

  repositoryTest('refuse an assignment that waited on a withdrawal', async ({ db }) => {
    const { indicatorId, versionId } = await submittedNewDraft(db, 'Withdrawn, then assigned');

    const result = await writeWhileStepHolds(db, indicatorId, 'withdraw', () =>
      assign(db, indicatorId, [REVIEWER]),
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'not_allowed' } });
    expect(await submissionStatuses(db, versionId)).toEqual(['withdrawn']);
  });

  repositoryTest(
    'withdraw a submission put in review while the withdrawal waited, keeping its reviewers',
    async ({ db }) => {
      const { indicatorId, versionId } = await submittedNewDraft(db, 'Assigned, then withdrawn');

      const result = await writeWhileStepHolds(
        db,
        indicatorId,
        'assign_reviewers',
        () => withdrawSubmission(db, indicatorId, 1, AS_OTHER_ACTOR),
        { actor: AS_MANAGER, stepWrite: replaceReviewers([REVIEWER], AS_MANAGER) },
      );

      expect(result).toEqual({ step: { ok: true }, write: { ok: true } });
      expect(await submissionStatuses(db, versionId)).toEqual(['withdrawn']);
      expect((await draftOf(db, versionId)).isLocked).toBe(false);
      expect(await reviewerIdsOf(db, indicatorId)).toEqual([REVIEWER]);
    },
  );

  repositoryTest('refuse as changed an assignment that waited on another one', async ({ db }) => {
    const { indicatorId } = await submittedNewDraft(db, 'Assigned by two managers');

    const result = await writeWhileStepHolds(
      db,
      indicatorId,
      'assign_reviewers',
      () => assign(db, indicatorId, [OTHER_REVIEWER]),
      { actor: AS_MANAGER, stepWrite: replaceReviewers([REVIEWER], AS_MANAGER) },
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'changed' } });
    expect(await reviewerIdsOf(db, indicatorId)).toEqual([REVIEWER]);
  });
});

describe('a response beside another step', () => {
  const AS_REVIEWER = { userId: REVIEWER, requestId: null };

  /** A submitted draft in review with `REVIEWER` assigned. */
  async function inReview(db: Database, name: string) {
    const draft = await submittedNewDraft(db, name);
    await assign(db, draft.indicatorId, [REVIEWER]);
    return draft;
  }

  function minorRevisions(): ReviewResponse {
    return {
      submissionNumber: 1,
      kind: 'minor_revisions',
      imrgReviewedOn: ukToday(),
      clarificationRequest: 'What is counted?',
      flags: [],
    };
  }

  function respond(db: Database, indicatorId: string) {
    return respondToReview(db, indicatorId, minorRevisions(), AS_REVIEWER);
  }

  /** The reviewer's own response, which holds the lock while another step waits. */
  const responding = {
    actor: AS_REVIEWER,
    stepWrite: responseWrite(minorRevisions(), AS_REVIEWER),
  };

  async function responsesTo(db: Database, versionId: string): Promise<string[]> {
    const rows = await db
      .select({ kind: indicatorVersionSubmissionResponse.kind })
      .from(indicatorVersionSubmissionResponse)
      .innerJoin(
        indicatorVersionSubmission,
        eq(indicatorVersionSubmission.id, indicatorVersionSubmissionResponse.submissionId),
      )
      .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId));
    return rows.map(({ kind }) => kind);
  }

  repositoryTest('refuses the second of two responses', async ({ db }) => {
    const { indicatorId, versionId } = await inReview(db, 'Answered together');

    const result = await writeWhileStepHolds(
      db,
      indicatorId,
      'request_changes',
      () => respond(db, indicatorId),
      responding,
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'not_allowed' } });
    expect(await submissionStatuses(db, versionId)).toEqual(['changes_requested']);
    expect(await responsesTo(db, versionId)).toEqual(['minor_revisions']);
  });

  repositoryTest('refuses a response from a reviewer removed while it waited', async ({ db }) => {
    const { indicatorId, versionId } = await inReview(db, 'Answered after removal');

    const result = await writeWhileStepHolds(
      db,
      indicatorId,
      'assign_reviewers',
      () => respond(db, indicatorId),
      { actor: AS_MANAGER, stepWrite: replaceReviewers([OTHER_REVIEWER], AS_MANAGER) },
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'not_a_reviewer' } });
    expect(await submissionStatuses(db, versionId)).toEqual(['in_review']);
    expect(await reviewerIdsOf(db, indicatorId)).toEqual([OTHER_REVIEWER]);
  });

  repositoryTest('refuses a change of reviewers that waited on a response', async ({ db }) => {
    const { indicatorId } = await inReview(db, 'Reassigned after a response');

    const result = await writeWhileStepHolds(
      db,
      indicatorId,
      'request_changes',
      () =>
        assignReviewers(
          db,
          indicatorId,
          { submissionNumber: 1, previousReviewerIds: [REVIEWER], reviewerIds: [OTHER_REVIEWER] },
          AS_MANAGER,
        ),
      responding,
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'not_allowed' } });
    expect(await reviewerIdsOf(db, indicatorId)).toEqual([REVIEWER]);
  });

  repositoryTest('refuses a response that waited on a withdrawal', async ({ db }) => {
    const { indicatorId, versionId } = await inReview(db, 'Answered after withdrawal');

    const result = await writeWhileStepHolds(db, indicatorId, 'withdraw', () =>
      respond(db, indicatorId),
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'not_allowed' } });
    expect(await submissionStatuses(db, versionId)).toEqual(['withdrawn']);
  });

  repositoryTest('refuses a withdrawal that waited on a response', async ({ db }) => {
    const { indicatorId, versionId } = await inReview(db, 'Withdrawn after a response');

    const result = await writeWhileStepHolds(
      db,
      indicatorId,
      'request_changes',
      () => withdrawSubmission(db, indicatorId, 1, AS_OTHER_ACTOR),
      responding,
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'not_allowed' } });
    expect(await submissionStatuses(db, versionId)).toEqual(['changes_requested']);
    expect((await draftOf(db, versionId)).isLocked).toBe(false);
  });
});

describe('a submission beside an upload', () => {
  repositoryTest(
    'is refused as changed after a load, and as incomplete once the publisher sees it',
    async ({ db }) => {
      const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Loaded first');
      const loading = await startUpload(db, indicatorId);
      expect(await loading.finish(VALID_CSV)).toMatchObject({ ok: true });

      await expect(submitIndicator(db, indicatorId, shown, AS_ACTOR)).resolves.toEqual({
        ok: false,
        reason: 'changed',
      });
      await expect(
        submitIndicator(db, indicatorId, await draftUpdatedAt(db, versionId), AS_ACTOR),
      ).resolves.toEqual({ ok: false, reason: 'incomplete' });
    },
  );

  repositoryTest(
    "is refused as changed when it waits on an upload's final write",
    async ({ db }) => {
      const { indicatorId, versionId, shown } = await completeNewDraft(db, 'Load then submit');

      const result = await stepWhileWriteHolds(
        db,
        () => upload(db, indicatorId, async () => Readable.from([VALID_CSV])),
        () => submitIndicator(db, indicatorId, shown, AS_ACTOR),
      );

      expect(result).toMatchObject({ write: { ok: true }, step: { ok: false, reason: 'changed' } });
      expect((await draftOf(db, versionId)).isLocked).toBe(false);
    },
  );

  repositoryTest.for([
    ['loads', VALID_CSV],
    ['is refused', REFUSED_CSV],
  ] as const)(
    'goes through while a file that %s is loading, which then keeps nothing',
    async ([outcome, content], { db }) => {
      const { indicatorId, versionId, shown, batchId } = await completeNewDraft(
        db,
        `Submitted while a file ${outcome}`,
      );
      const loading = await startUpload(db, indicatorId);

      await expect(submitIndicator(db, indicatorId, shown, AS_ACTOR)).resolves.toEqual({
        ok: true,
      });

      expect(await loading.finish(content)).toMatchObject({ ok: false, reason: 'locked' });
      const draft = await draftOf(db, versionId);
      expect(draft).toMatchObject({ isLocked: true, uploadBatchId: batchId });
      expect(draft.dataTableConfirmedAt).not.toBeNull();
    },
  );

  repositoryTest.for([
    ['loads', VALID_CSV],
    ['is refused', REFUSED_CSV],
  ] as const)(
    'refuses a file that %s as locked while the submission is being withdrawn',
    async ([outcome, content], { db }) => {
      const { indicatorId, versionId, shown, batchId } = await completeNewDraft(
        db,
        `Withdrawn while a file ${outcome}`,
      );
      const loading = await startUpload(db, indicatorId);
      await submitIndicator(db, indicatorId, shown, AS_ACTOR);
      let held: () => void = () => {};
      let release: () => void = () => {};
      const holding = new Promise<void>((resolve) => {
        held = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const withdrawn = takeIndicatorStep(db, indicatorId, 'withdraw', AS_ACTOR, {
        precondition: async () => {
          held();
          await released;
          return undefined;
        },
      });
      await holding;

      // The withdrawal holds the row, uncommitted, so the load finds it locked without waiting.
      const loaded = await Promise.race([
        loading.finish(content),
        new Promise((resolve) => setTimeout(() => resolve('blocked'), LOCK_WAIT.timeout)),
      ]).finally(release);

      expect(loaded).toMatchObject({ ok: false, reason: 'locked' });
      expect(await withdrawn).toEqual({ ok: true });
      expect(await draftOf(db, versionId)).toMatchObject({
        isLocked: false,
        uploadBatchId: batchId,
      });
    },
  );

  repositoryTest('refuses a file loaded after it as locked', async ({ db }) => {
    const { indicatorId, versionId, shown, batchId } = await completeNewDraft(
      db,
      'Submit then load',
    );
    await submitIndicator(db, indicatorId, shown, AS_ACTOR);

    await expect(
      upload(db, indicatorId, async () => Readable.from([VALID_CSV])),
    ).resolves.toMatchObject({ ok: false, reason: 'locked' });
    expect(await draftOf(db, versionId)).toMatchObject({ isLocked: true, uploadBatchId: batchId });
  });
});
