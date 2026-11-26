import { type Database, schema } from '@fphd/db';
import { type Actor, changesBetween, listChanges, recordAudit } from '@fphd/db/audit-log';
import { CLASSIFICATION_DIMENSIONS } from '@fphd/utils/classification-dimension';
import { and, asc, eq, exists, inArray, ne, not, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { draftStatusSchema } from './contract.ts';
import { tryUploadLock } from './data-upload-load-repository.ts';
import { submissionsWithdrawn, type Transaction } from './indicator-repository-sql.ts';
import { replaceLists } from './indicator-version-lists-repository.ts';
import { isDraftDiscardable } from './indicator-workflow.ts';

const {
  indicator,
  indicatorVersion,
  indicatorVersionSubmission,
  isUnpublished,
  observation,
  uploadBatch,
} = schema;

const otherVersion = alias(indicatorVersion, 'other_version');

// Scopes the per-indicator discard locks within the two-key advisory lock space.
const DISCARD_LOCK_NAMESPACE = 0x64697363; // 'disc'

/**
 * The draft deleted, with the files its uploads left to delete, or why it was not:
 *
 * - `already_discarded`: there is no draft
 * - `not_allowed`: a review has started on it, or it is submitted
 * - `changed`: it has been edited since the publisher was shown it
 * - `upload_running`: a data table is being uploaded to it
 */
export type DiscardDraftResult =
  | { ok: true; indicatorDeleted: boolean; deletedBlobNames: string[] }
  | { ok: false; reason: 'already_discarded' | 'not_allowed' | 'changed' | 'upload_running' };

/**
 * Waits for another discard of the indicator's draft to finish, so a second click waits for the
 * first and then finds no draft.
 */
async function lockDiscard(tx: Transaction, indicatorId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${DISCARD_LOCK_NAMESPACE}, hashtext(${indicatorId}))`,
  );
}

/**
 * Takes the table locks the discard's writes need on indicator and indicator_version before its
 * first write, in the order a live-data package locks them. Keep indicator first. In the other
 * order, a package could hold indicator while it waits for indicator_version, while the discard
 * holds indicator_version and waits for indicator, and the two would deadlock. A package that has
 * the tables makes this wait, and one that starts later waits for the discard.
 */
async function lockTables(tx: Transaction): Promise<void> {
  await tx.execute(sql`LOCK TABLE ${indicator}, ${indicatorVersion} IN ROW EXCLUSIVE MODE`);
}

async function allSubmissionsWithdrawn(tx: Transaction, versionId: string): Promise<boolean> {
  const [row] = await tx
    .select({ withdrawn: submissionsWithdrawn(indicatorVersion.id) })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.id, versionId));
  return row?.withdrawn === true;
}

/**
 * Deletes the batches uploaded to the draft, with their observations, and returns them. The
 * published batch an update started from was uploaded to the published version, so it is kept. No
 * other version should point at a batch uploaded to the draft. If one did, that batch would be kept
 * and its foreign key would stop the draft being deleted.
 */
async function deleteDraftBatches(tx: Transaction, draftId: string) {
  const owned = await tx
    .select({ id: uploadBatch.id })
    .from(uploadBatch)
    .where(
      and(
        eq(uploadBatch.indicatorVersionId, draftId),
        not(
          exists(
            tx
              .select({ one: sql`1` })
              .from(otherVersion)
              .where(
                and(eq(otherVersion.uploadBatchId, uploadBatch.id), ne(otherVersion.id, draftId)),
              ),
          ),
        ),
      ),
    );
  // The version and the batch refer to each other, so the version lets go of it first.
  await tx
    .update(indicatorVersion)
    .set({ uploadBatchId: null, dataTableConfirmedAt: null })
    .where(eq(indicatorVersion.id, draftId));
  if (owned.length === 0) return [];

  const ids = owned.map(({ id }) => id);
  await tx.delete(observation).where(inArray(observation.uploadBatchId, ids));
  return tx.delete(uploadBatch).where(inArray(uploadBatch.id, ids)).returning();
}

/** Empties the draft's lists and returns the change for the audit entry. */
async function deleteLists(tx: Transaction, draftId: string) {
  const { before, after } = await replaceLists(tx, draftId, {
    topicIds: [],
    classificationIds: Object.fromEntries(
      CLASSIFICATION_DIMENSIONS.map((dimension) => [dimension, []]),
    ),
    ageRanges: [],
    goals: [],
    numeratorSources: [],
    denominatorSources: [],
  });
  return listChanges(before, after);
}

/** The draft's submissions, which go with its version, as the change for the audit entry. */
async function submissionChanges(tx: Transaction, draftId: string) {
  const submissions = await tx
    .select()
    .from(indicatorVersionSubmission)
    .where(eq(indicatorVersionSubmission.indicatorVersionId, draftId))
    .orderBy(asc(indicatorVersionSubmission.number));
  return listChanges({ submissions }, { submissions: [] });
}

/** Deletes the indicator if it has no version left, and returns the change for the audit entry. */
async function deleteIndicatorWithoutVersion(tx: Transaction, indicatorId: string) {
  const [deleted] = await tx
    .delete(indicator)
    .where(
      and(
        eq(indicator.id, indicatorId),
        not(
          exists(
            tx
              .select({ one: sql`1` })
              .from(otherVersion)
              .where(eq(otherVersion.indicatorId, indicator.id)),
          ),
        ),
      ),
    )
    .returning({
      shortId: indicator.shortId,
      dataUpdatedAt: indicator.dataUpdatedAt,
      teamId: indicator.teamId,
    });
  return deleted;
}

/**
 * Deletes the indicator's draft: its version, lists and submissions, and the batches uploaded to
 * it with their observations. A new indicator is deleted with its draft, as it has no other
 * version. A live indicator keeps its published versions and their batches, and can be updated
 * again. The audit log keeps every value but the observations.
 *
 * `draftUpdatedAt` is the draft's `updatedAt` as the publisher was shown it: an edit since then
 * refuses the discard as `changed`, so nobody discards a draft they have not seen.
 *
 * The upload lock is tried first, so a running upload refuses the discard rather than making it
 * wait, and an upload that starts meanwhile waits and then finds no draft. The tables are locked
 * next, and then the draft's row FOR UPDATE, the lock its delete needs. A weaker one would deadlock
 * with any transaction that has inserted a row referring to the draft and then updates the draft.
 */
export async function discardDraft(
  db: Database,
  indicatorId: string,
  draftUpdatedAt: Date,
  actor: Actor,
): Promise<DiscardDraftResult> {
  return db.transaction(async (tx) => {
    await lockDiscard(tx, indicatorId);
    if (!(await tryUploadLock(tx, indicatorId))) return { ok: false, reason: 'upload_running' };
    await lockTables(tx);

    const [draft] = await tx
      .select()
      .from(indicatorVersion)
      .where(
        and(eq(indicatorVersion.indicatorId, indicatorId), isUnpublished(indicatorVersion.status)),
      )
      .for('update');
    if (draft === undefined) return { ok: false, reason: 'already_discarded' };

    // Read once the row is locked, so a submission that committed while this waited is seen.
    const discardable = isDraftDiscardable({
      draftStatus: draftStatusSchema.parse(draft.status),
      draftSubmissionsWithdrawn: await allSubmissionsWithdrawn(tx, draft.id),
    });
    if (!discardable) return { ok: false, reason: 'not_allowed' };
    if (draft.updatedAt.getTime() !== draftUpdatedAt.getTime()) {
      return { ok: false, reason: 'changed' };
    }

    // The lock keeps the submissions as they are until the delete takes them.
    const submissions = await submissionChanges(tx, draft.id);
    const batches = await deleteDraftBatches(tx, draft.id);
    const lists = await deleteLists(tx, draft.id);
    await tx.delete(indicatorVersion).where(eq(indicatorVersion.id, draft.id));
    const deletedIndicator = await deleteIndicatorWithoutVersion(tx, indicatorId);

    await recordAudit(tx, actor, [
      {
        action: 'indicator.draft_discarded',
        entityId: indicatorId,
        changes: {
          ...changesBetween(draft, null),
          ...lists,
          ...submissions,
          ...changesBetween(deletedIndicator ?? null, null),
        },
      },
      ...batches.map((batch) => ({
        action: 'upload_batch.deleted' as const,
        entityId: batch.id,
        changes: changesBetween(batch, null),
      })),
    ]);

    return {
      ok: true,
      indicatorDeleted: deletedIndicator !== undefined,
      deletedBlobNames: batches.flatMap(({ blobName }) => (blobName === null ? [] : [blobName])),
    };
  });
}
