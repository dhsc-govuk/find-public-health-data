import { type Database, schema } from '@fphd/db';
import { type Actor, changesBetween, listChanges, recordAudit } from '@fphd/db/audit-log';
import { CLASSIFICATION_DIMENSIONS } from '@fphd/utils/classification-dimension';
import { eq, getTableColumns, sql } from 'drizzle-orm';

import { hasSqlState, UNIQUE_VIOLATION } from './indicator-repository-sql.ts';
import {
  ageRangesOf,
  classificationsOf,
  copyTaxonomyPlacements,
  replaceLists,
  sourcesOf,
  topicIdsOf,
} from './indicator-version-lists-repository.ts';

const { currentPublishedVersion, indicatorVersion } = schema;

export type CreateDraftFromPublishedResult =
  | { ok: true; versionId: string }
  | { ok: false; reason: 'draft_exists' | 'not_published' };

/**
 * Opens a draft from the most recently published version: columns, slug and lists alike. The
 * one-unpublished index refuses it beside a draft or a scheduled version, rather than this reading
 * first and racing.
 */
export async function createDraftFromPublished(
  db: Database,
  indicatorId: string,
  actor: Actor,
): Promise<CreateDraftFromPublishedResult> {
  try {
    // Copy publication attributes and lists from the same snapshot during a refresh.
    return await db.transaction(
      async (tx) => {
        // Wait for a live refresh before taking the publication snapshot.
        await tx.execute(sql`LOCK TABLE indicator_version IN ROW EXCLUSIVE MODE`);
        const [published] = await tx
          .select(getTableColumns(indicatorVersion))
          .from(currentPublishedVersion)
          .innerJoin(indicatorVersion, eq(indicatorVersion.id, currentPublishedVersion.id))
          .where(eq(currentPublishedVersion.indicatorId, indicatorId));

        if (published === undefined) return { ok: false, reason: 'not_published' };

        const {
          id: publishedId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          createdBy: _createdBy,
          updatedBy: _updatedBy,
          ...attributes
        } = published;

        const [draft] = await tx
          .insert(indicatorVersion)
          .values({
            ...attributes,
            status: 'draft',
            isLocked: false,
            publishedAt: null,
            // A new version is published when its own publisher says.
            scheduledPublishAt: null,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          })
          .returning();

        if (draft === undefined) throw new Error('createDraftFromPublished inserted no version');

        const [topicIds, classifications, ageRanges, sources] = await Promise.all([
          topicIdsOf(tx, publishedId),
          classificationsOf(tx, publishedId),
          ageRangesOf(tx, publishedId),
          sourcesOf(tx, publishedId),
        ]);

        const copied = await replaceLists(tx, draft.id, {
          topicIds,
          classificationIds: Object.fromEntries(
            CLASSIFICATION_DIMENSIONS.map((dimension) => [
              dimension,
              classifications.filter((row) => row.dimension === dimension).map(({ id }) => id),
            ]),
          ),
          ageRanges,
          ...sources,
        });
        const placements = await copyTaxonomyPlacements(tx, publishedId, draft.id);

        await recordAudit(tx, actor, [
          {
            action: 'indicator.draft_created_from_published',
            entityId: indicatorId,
            changes: {
              ...changesBetween(null, draft),
              ...listChanges({}, copied.after),
              ...listChanges({}, { taxonomyPlacements: placements }),
            },
          },
        ]);

        return { ok: true, versionId: draft.id };
      },
      { isolationLevel: 'repeatable read' },
    );
  } catch (error) {
    if (hasSqlState(error, UNIQUE_VIOLATION)) return { ok: false, reason: 'draft_exists' };
    throw error;
  }
}
