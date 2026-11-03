import { Readable } from 'node:stream';

import { type Database, schema } from '@fphd/db';
import { auditEntriesFor } from '@fphd/db/testing';
import { asc, eq } from 'drizzle-orm';
import { v7 as randomUuidV7 } from 'uuid';
import { describe, expect } from 'vitest';

import { confirmDataTable } from './data-table-check-repository.ts';
import { processDataUpload } from './data-upload-load-repository.ts';
import { updateIndicatorDraft } from './indicator-draft-repository.ts';
import { ACTOR, AS_ACTOR, AS_OTHER_ACTOR, repositoryTest } from './indicator-repository.testing.ts';
import { sentBackDraft } from './indicator-workflow.testing.ts';

const {
  indicatorVersion,
  indicatorVersionSubmission,
  indicatorVersionSubmissionFlag,
  indicatorVersionSubmissionResponse,
} = schema;

const CSV = [
  'area_code,period_start,period_end,value,count,sex,age,category_type,category,value_note',
  'E92000001,2019-04-01,2020-03-31,83.8,1234,Female,<75 yrs,,,',
].join('\n');

async function flagsOf(db: Database, indicatorId: string) {
  return db
    .select({
      task: indicatorVersionSubmissionFlag.taskKey,
      clearedBy: indicatorVersionSubmissionFlag.clearedBy,
      clearedAt: indicatorVersionSubmissionFlag.clearedAt,
    })
    .from(indicatorVersionSubmissionFlag)
    .innerJoin(
      indicatorVersionSubmissionResponse,
      eq(indicatorVersionSubmissionResponse.id, indicatorVersionSubmissionFlag.responseId),
    )
    .innerJoin(
      indicatorVersionSubmission,
      eq(indicatorVersionSubmission.id, indicatorVersionSubmissionResponse.submissionId),
    )
    .where(eq(indicatorVersionSubmission.indicatorId, indicatorId))
    .orderBy(asc(indicatorVersionSubmissionFlag.taskKey));
}

async function polarityOf(db: Database, versionId: string) {
  const [row] = await db
    .select({ polarity: indicatorVersion.polarity })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  return row?.polarity ?? null;
}

async function draftUpdates(db: Database, indicatorId: string) {
  return (await auditEntriesFor(db, indicatorId)).filter(
    ({ action }) => action === 'indicator.draft_updated',
  );
}

describe('saving a flagged task', () => {
  repositoryTest(
    'clears its flag though nothing changed, and leaves the other tasks flagged',
    async ({ db }) => {
      const { indicatorId, versionId } = await sentBackDraft(db, 'Saved unchanged', [
        'polarity',
        'definition-and-rationale',
      ]);
      const before = await draftUpdates(db, indicatorId);

      const saved = await updateIndicatorDraft(
        db,
        indicatorId,
        'polarity',
        { polarity: await polarityOf(db, versionId) },
        {},
        AS_ACTOR,
      );

      expect(saved).toEqual({ ok: true });
      expect(await flagsOf(db, indicatorId)).toEqual([
        { task: 'definition-and-rationale', clearedBy: null, clearedAt: null },
        { task: 'polarity', clearedBy: ACTOR, clearedAt: expect.any(Date) },
      ]);
      const after = await draftUpdates(db, indicatorId);
      expect(after.slice(before.length)).toEqual([
        expect.objectContaining({
          actorId: ACTOR,
          changes: { flags: { before: ['polarity'], after: [] } },
        }),
      ]);
    },
  );

  repositoryTest('keeps the flag as the first save cleared it', async ({ db }) => {
    const { indicatorId, versionId } = await sentBackDraft(db, 'Saved twice', ['polarity']);
    const polarity = await polarityOf(db, versionId);

    await updateIndicatorDraft(db, indicatorId, 'polarity', { polarity }, {}, AS_ACTOR);
    const [cleared] = await flagsOf(db, indicatorId);
    const before = await draftUpdates(db, indicatorId);
    await updateIndicatorDraft(db, indicatorId, 'polarity', { polarity }, {}, AS_OTHER_ACTOR);

    expect(await flagsOf(db, indicatorId)).toEqual([cleared]);
    expect(await draftUpdates(db, indicatorId)).toHaveLength(before.length);
  });

  repositoryTest('clears the name flag on a rename to the same name', async ({ db }) => {
    const name = 'Renamed to itself';
    const { indicatorId } = await sentBackDraft(db, name, ['name', 'polarity']);

    await updateIndicatorDraft(db, indicatorId, 'name', { name }, {}, AS_ACTOR);

    expect(await flagsOf(db, indicatorId)).toEqual([
      { task: 'name', clearedBy: ACTOR, clearedAt: expect.any(Date) },
      { task: 'polarity', clearedBy: null, clearedAt: null },
    ]);
  });

  repositoryTest(
    'leaves the flags alone when a notes for reviewers task is saved',
    async ({ db }) => {
      const { indicatorId } = await sentBackDraft(db, 'Notes saved', ['polarity']);

      await updateIndicatorDraft(
        db,
        indicatorId,
        'other-comments',
        { sponsorsAndStakeholders: 'Someone' },
        {},
        AS_ACTOR,
      );

      expect(await flagsOf(db, indicatorId)).toEqual([
        { task: 'polarity', clearedBy: null, clearedAt: null },
      ]);
    },
  );
});

describe('the data table flag', () => {
  repositoryTest('is cleared by confirming the table, and recorded with it', async ({ db }) => {
    const { indicatorId, batchId } = await sentBackDraft(db, 'Table confirmed', ['data-table']);

    expect(await confirmDataTable(db, indicatorId, batchId, AS_ACTOR)).toMatchObject({ ok: true });

    expect(await flagsOf(db, indicatorId)).toEqual([
      { task: 'data-table', clearedBy: ACTOR, clearedAt: expect.any(Date) },
    ]);
    const [confirmed] = (await auditEntriesFor(db, indicatorId)).filter(
      ({ action }) => action === 'indicator.data_table_confirmed',
    );
    expect(confirmed?.changes).toMatchObject({ flags: { before: ['data-table'], after: [] } });
  });

  repositoryTest('is not cleared by an upload, only by its confirmation', async ({ db }) => {
    const { indicatorId } = await sentBackDraft(db, 'Table uploaded', ['data-table']);
    const batchId = randomUuidV7();

    const uploaded = await processDataUpload(
      db,
      {
        batchId,
        indicatorId,
        blobName: `${indicatorId}/${batchId}.csv`,
        originalFilename: 'data.csv',
        byteSize: CSV.length,
        sha256: '0'.repeat(64),
        actor: AS_ACTOR,
      },
      async () => Readable.from([CSV]),
      new AbortController().signal,
    );

    expect(uploaded).toMatchObject({ ok: true });
    expect(await flagsOf(db, indicatorId)).toEqual([
      { task: 'data-table', clearedBy: null, clearedAt: null },
    ]);
    expect(await confirmDataTable(db, indicatorId, batchId, AS_ACTOR)).toMatchObject({ ok: true });
    expect(await flagsOf(db, indicatorId)).toEqual([
      { task: 'data-table', clearedBy: ACTOR, clearedAt: expect.any(Date) },
    ]);
  });
});
