import { type Database, schema } from '@fphd/db';
import { desc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { confirmDataTable } from './data-table-check-repository.ts';
import { updateIndicatorDraft } from './indicator-draft-repository.ts';
import { AS_ACTOR, AS_OTHER_ACTOR, repositoryTest } from './indicator-repository.testing.ts';
import { sentBackDraft } from './indicator-workflow.testing.ts';
import {
  stepWhileWriteHolds,
  writeWhileStepHolds,
} from './indicator-workflow-concurrency.testing.ts';
import { submitIndicator } from './indicator-workflow-repository.ts';
import { revisionReplyVersion, saveRevisionResponse } from './revision-response-repository.ts';

const {
  indicatorVersion,
  indicatorVersionSubmission,
  indicatorVersionSubmissionFlag,
  indicatorVersionSubmissionResponse,
} = schema;

/** Writes the reply directly, as the publisher's reply page would have. */
async function replied(db: Database, versionId: string): Promise<void> {
  await db
    .update(indicatorVersionSubmission)
    .set({ revisionResponse: 'Done as asked' })
    .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId));
}

async function flagCleared(db: Database, indicatorId: string): Promise<boolean> {
  const [row] = await db
    .select({ clearedAt: indicatorVersionSubmissionFlag.clearedAt })
    .from(indicatorVersionSubmissionFlag)
    .innerJoin(
      indicatorVersionSubmissionResponse,
      eq(indicatorVersionSubmissionResponse.id, indicatorVersionSubmissionFlag.responseId),
    )
    .innerJoin(
      indicatorVersionSubmission,
      eq(indicatorVersionSubmission.id, indicatorVersionSubmissionResponse.submissionId),
    )
    .where(eq(indicatorVersionSubmission.indicatorId, indicatorId));
  if (row === undefined) throw new Error(`no flag on ${indicatorId}`);
  return row.clearedAt !== null;
}

async function polarityOf(db: Database, versionId: string) {
  const [row] = await db
    .select({ polarity: indicatorVersion.polarity })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  return row?.polarity ?? null;
}

describe('a resubmission beside a flag-clearing save', () => {
  repositoryTest(
    'is refused as changed when the save holding the draft commits first',
    async ({ db }) => {
      const { indicatorId, versionId, shown } = await sentBackDraft(db, 'Clear then resubmit', [
        'polarity',
      ]);
      await replied(db, versionId);
      const polarity = await polarityOf(db, versionId);

      const result = await stepWhileWriteHolds(
        db,
        () => updateIndicatorDraft(db, indicatorId, 'polarity', { polarity }, {}, AS_OTHER_ACTOR),
        () => submitIndicator(db, indicatorId, shown, AS_ACTOR),
      );

      expect(result).toEqual({ write: { ok: true }, step: { ok: false, reason: 'changed' } });
      expect(await flagCleared(db, indicatorId)).toBe(true);
    },
  );

  repositoryTest('locks out the save that waited on it, leaving the flag', async ({ db }) => {
    const { indicatorId, versionId } = await sentBackDraft(db, 'Resubmit then clear', ['polarity']);
    const polarity = await polarityOf(db, versionId);

    const result = await writeWhileStepHolds(db, indicatorId, 'resubmit', () =>
      updateIndicatorDraft(db, indicatorId, 'polarity', { polarity }, {}, AS_OTHER_ACTOR),
    );

    expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'locked' } });
    expect(await flagCleared(db, indicatorId)).toBe(false);
  });
});

describe('a resubmission beside a data table confirmation', () => {
  repositoryTest(
    'is refused as changed when the confirmation holding the draft commits first',
    async ({ db }) => {
      const { indicatorId, versionId, batchId, shown } = await sentBackDraft(
        db,
        'Confirm then resubmit',
        ['data-table'],
      );
      await replied(db, versionId);

      const result = await stepWhileWriteHolds(
        db,
        () => confirmDataTable(db, indicatorId, batchId, AS_OTHER_ACTOR),
        () => submitIndicator(db, indicatorId, shown, AS_ACTOR),
      );

      expect(result).toMatchObject({ write: { ok: true }, step: { ok: false, reason: 'changed' } });
      expect(await flagCleared(db, indicatorId)).toBe(true);
    },
  );

  repositoryTest(
    'locks out the confirmation that waited on it, leaving the flag',
    async ({ db }) => {
      const { indicatorId, batchId } = await sentBackDraft(db, 'Resubmit then confirm', [
        'data-table',
      ]);

      const result = await writeWhileStepHolds(db, indicatorId, 'resubmit', () =>
        confirmDataTable(db, indicatorId, batchId, AS_OTHER_ACTOR),
      );

      expect(result).toEqual({ step: { ok: true }, write: { ok: false, reason: 'locked' } });
      expect(await flagCleared(db, indicatorId)).toBe(false);
    },
  );
});

describe('two publishers writing the reply', () => {
  repositoryTest('take turns, and the second is refused as changed', async ({ db }) => {
    const { indicatorId, versionId } = await sentBackDraft(db, 'Two replies', ['polarity']);
    const shown = {
      version: revisionReplyVersion({ submissionNumber: 1, revisionResponse: null }),
      versionOf: revisionReplyVersion,
    };

    const result = await stepWhileWriteHolds(
      db,
      () => saveRevisionResponse(db, indicatorId, 'First', shown, AS_ACTOR),
      () => saveRevisionResponse(db, indicatorId, 'Second', shown, AS_OTHER_ACTOR),
    );

    expect(result).toEqual({
      write: { ok: true },
      step: {
        ok: false,
        reason: 'changed',
        version: revisionReplyVersion({ submissionNumber: 1, revisionResponse: 'First' }),
      },
    });
    const [latest] = await db
      .select({ revisionResponse: indicatorVersionSubmission.revisionResponse })
      .from(indicatorVersionSubmission)
      .where(eq(indicatorVersionSubmission.indicatorVersionId, versionId))
      .orderBy(desc(indicatorVersionSubmission.number))
      .limit(1);
    expect(latest?.revisionResponse).toBe('First');
  });
});
