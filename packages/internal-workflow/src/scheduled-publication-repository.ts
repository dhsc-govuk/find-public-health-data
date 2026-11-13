import { type Database, schema } from '@fphd/db';
import { type Actor, type AuditChanges, changesBetween } from '@fphd/db/audit-log';
import { refreshIndicatorReadModels } from '@fphd/internal-read-models';
import type { Logger } from '@fphd/logger';
import { slugify } from '@fphd/utils/slug';
import { and, asc, eq, lt, lte, ne, notInArray, sql } from 'drizzle-orm';

import { hasSqlState, type Transaction } from './database.ts';
import { type IndicatorStepResult, takeIndicatorStepIn } from './indicator-step-repository.ts';
import type { IndicatorDraftVersion } from './indicator-version-repository.ts';
import { lockSlugs } from './slug-lock.ts';

const { indicator, indicatorVersion, isScheduled, SYSTEM_USER_IDS } = schema;

/**
 * The actor that scheduled publication records on its audit entries. It is the Scheduled
 * publication system user, and has no request id because publication does not run in a request.
 */
export const SCHEDULED_PUBLICATION: Actor = {
  userId: SYSTEM_USER_IDS.scheduledPublication,
  requestId: null,
};

const LOCK_NOT_AVAILABLE = '55P03';
const QUERY_CANCELED = '57014';

/** A version published more than this many seconds after its scheduled time is logged as late. */
const LATE_AFTER_SECONDS = 120;

/** A version still scheduled more than this long after its scheduled time is logged as overdue. */
const OVERDUE_AFTER = '10 minutes';

/**
 * The outcome of one call to `publishNextDueVersion`: no version was due, or the version it chose
 * was published, refused by the publish step, or failed with an error. `slugTaken` is the slug a
 * renamed update could not move to because another indicator holds it, and null otherwise.
 */
export type PublicationResult =
  | { kind: 'none' }
  | {
      kind: 'published';
      indicatorId: string;
      versionId: string;
      scheduledPublishAt: Date;
      publishedAt: Date;
      slugTaken: string | null;
    }
  | {
      kind: 'refused';
      indicatorId: string;
      versionId: string;
      reason: Exclude<IndicatorStepResult<'not_due'>, { ok: true }>['reason'];
    }
  | { kind: 'failed'; indicatorId: string; versionId: string; error: unknown };

/**
 * Whether `error` should end the sweep early rather than be thrown from it. That is a lock timeout,
 * which the next sweep may get past once the lock is released, or a statement timeout before a
 * version was chosen.
 */
function isPublicationBlocked(error: unknown): boolean {
  return hasSqlState(error, LOCK_NOT_AVAILABLE) || hasSqlState(error, QUERY_CANCELED);
}

/**
 * Sets the indicator's data date, `data_updated_at`, to the version's publication time, and returns
 * the change for the audit entry.
 */
async function markDataUpdated(
  tx: Transaction,
  indicatorId: string,
  versionId: string,
): Promise<AuditChanges> {
  // The publication time is read from the version's row inside this statement rather than passed
  // in from JavaScript. A JavaScript Date holds only milliseconds, so passing it in would lose the
  // microseconds and leave the two times slightly different.
  const [row] = await tx
    .update(indicator)
    .set({
      dataUpdatedAt: sql`(SELECT ${indicatorVersion.publishedAt} FROM ${indicatorVersion}
        WHERE ${indicatorVersion.id} = ${versionId})`,
    })
    .where(eq(indicator.id, indicatorId))
    .returning({
      before: sql`old.data_updated_at`.mapWith(indicator.dataUpdatedAt),
      after: indicator.dataUpdatedAt,
    });
  if (row === undefined) throw new Error(`no indicator ${indicatorId} to mark updated`);
  return changesBetween({ dataUpdatedAt: row.before }, { dataUpdatedAt: row.after });
}

/**
 * Gives a version the slug of its name, when that differs from the slug it carries. A renamed
 * update keeps the indicator's published slug until it is published, so publishing it moves the
 * indicator to the new slug. The earlier published versions keep the old slug, so the old address
 * still finds the indicator, and the public site redirects it to the new one.
 *
 * Two indicators never share a slug. If another indicator has taken the new slug since the update
 * was renamed, the version keeps the slug it carries, and the indicator keeps its address.
 * Returns the slug change for the audit entry, and the slug that was taken, if it was.
 */
async function moveToSlugOfName(
  tx: Transaction,
  draft: IndicatorDraftVersion,
): Promise<{ changes: AuditChanges; slugTaken: string | null }> {
  const slug = slugify(draft.name);
  if (slug === draft.slug) return { changes: {}, slugTaken: null };

  // Holds the slug, as a create or a rename of a draft does, so no other writer can take it
  // between this check and the update.
  await lockSlugs(tx, [slug]);
  const [holder] = await tx
    .select({ id: indicatorVersion.id })
    .from(indicatorVersion)
    .where(
      and(eq(indicatorVersion.slug, slug), ne(indicatorVersion.indicatorId, draft.indicatorId)),
    )
    .limit(1);
  if (holder !== undefined) return { changes: {}, slugTaken: slug };

  await tx.update(indicatorVersion).set({ slug }).where(eq(indicatorVersion.id, draft.id));
  return { changes: changesBetween({ slug: draft.slug }, { slug }), slugTaken: null };
}

/**
 * Publishes the scheduled version with the earliest due publication time, leaving out the versions
 * in `skip`. The version is a new indicator's first, or an update that replaces the indicator's
 * published version. One transaction sets the version's status and publication time, moves a
 * renamed update to the slug of its new name, and records the audit entry as Scheduled
 * publication. When the version brings a new upload batch, the same transaction sets the
 * indicator's data date and refreshes the indicator's read models.
 *
 * A version whose row another transaction has locked, such as another sweep publishing it, is
 * passed over. A lock timeout, or any error before a version is chosen, is thrown. Any other error
 * after a version is chosen, including a statement timeout, rolls the transaction back and returns
 * `failed`, so nothing is written.
 */
export async function publishNextDueVersion(
  db: Database,
  { skip }: { skip: readonly string[] },
): Promise<PublicationResult> {
  let chosen: { indicatorId: string; versionId: string } | undefined;
  let publishedAt: Date | null = null;
  let slugTaken: string | null = null;

  try {
    return await db.transaction(async (tx): Promise<PublicationResult> => {
      // Timeouts for this transaction only, so the pooled connection keeps its own settings.
      // A wait of more than five seconds for a lock, such as on a table a live-data package has
      // locked, fails with a lock timeout and ends the sweep. A statement running for more than
      // two minutes is cancelled, and a transaction left idle for a minute has its session ended.
      await tx.execute(sql`SELECT
        set_config('lock_timeout', '5s', true),
        set_config('statement_timeout', '120s', true),
        set_config('idle_in_transaction_session_timeout', '60s', true)`);

      const [due] = await tx
        .select({
          indicatorId: indicatorVersion.indicatorId,
          versionId: indicatorVersion.id,
          scheduledPublishAt: indicatorVersion.scheduledPublishAt,
          // The upload batch of the indicator's currently published version, read before this
          // version replaces it. It is null when the indicator has never been published.
          previousBatchId: sql<string | null>`(
            SELECT pv.upload_batch_id FROM current_published_version cpv
            JOIN indicator_version pv ON pv.id = cpv.id
            WHERE cpv.indicator_id = indicator_version.indicator_id
          )`,
        })
        .from(indicatorVersion)
        .where(
          and(
            isScheduled(indicatorVersion.status),
            lte(indicatorVersion.scheduledPublishAt, sql`clock_timestamp()`),
            skip.length > 0 ? notInArray(indicatorVersion.id, [...skip]) : undefined,
          ),
        )
        .orderBy(asc(indicatorVersion.scheduledPublishAt), asc(indicatorVersion.id))
        .limit(1)
        .for('no key update', { skipLocked: true });

      if (due === undefined || due.scheduledPublishAt === null) return { kind: 'none' };
      chosen = { indicatorId: due.indicatorId, versionId: due.versionId };

      // Takes the ROW EXCLUSIVE table locks that the publication's updates need on indicator and
      // indicator_version now, before the first update, in the same order a live-data package
      // locks them. A package that has already locked the tables makes this statement wait until
      // the lock timeout. A package that starts later waits until this transaction commits.
      // Keep indicator first. In the other order, a package could hold indicator while waiting for
      // indicator_version, while the publication holds indicator_version and waits for indicator,
      // and the two would deadlock.
      await tx.execute(sql`LOCK TABLE ${indicator}, ${indicatorVersion} IN ROW EXCLUSIVE MODE`);

      const stepped = await takeIndicatorStepIn(
        tx,
        due.indicatorId,
        'publish',
        SCHEDULED_PUBLICATION,
        {
          precondition: async (stepTx, { draft }) => {
            const [row] = await stepTx
              .select({
                later: sql<boolean>`${indicatorVersion.scheduledPublishAt} > clock_timestamp()`,
              })
              .from(indicatorVersion)
              .where(eq(indicatorVersion.id, draft.id));
            return row?.later === false ? undefined : 'not_due';
          },
          // The read models hold only what the published upload batch gives, so they change only
          // when the version brings a different batch from the one published before it. Their
          // refresh reads the indicator's data through the published views, so it runs last,
          // after the version is published and the indicator's data date is set.
          write: async (stepTx, _submission, draft, version) => {
            publishedAt = version.publishedAt;
            if (publishedAt === null) throw new Error(`published ${draft.id} without a time`);
            const slugMove = await moveToSlugOfName(stepTx, draft);
            slugTaken = slugMove.slugTaken;
            if (draft.uploadBatchId === due.previousBatchId) return slugMove.changes;

            const dataChanges =
              draft.uploadBatchId === null
                ? {}
                : await markDataUpdated(stepTx, due.indicatorId, draft.id);
            await refreshIndicatorReadModels(stepTx, due.indicatorId);
            return { ...slugMove.changes, ...dataChanges };
          },
        },
      );

      if (!stepped.ok) return { kind: 'refused', ...chosen, reason: stepped.reason };
      if (publishedAt === null) throw new Error(`published ${due.versionId} without a time`);

      return {
        kind: 'published',
        ...chosen,
        scheduledPublishAt: due.scheduledPublishAt,
        publishedAt,
        slugTaken,
      };
    });
  } catch (error) {
    if (chosen === undefined || hasSqlState(error, LOCK_NOT_AVAILABLE)) throw error;
    return { kind: 'failed', ...chosen, error };
  }
}

/**
 * The ids of versions still scheduled more than `OVERDUE_AFTER` after their scheduled time,
 * earliest first.
 */
async function overdueVersionIds(db: Database): Promise<string[]> {
  const rows = await db
    .select({ id: indicatorVersion.id })
    .from(indicatorVersion)
    .where(
      and(
        isScheduled(indicatorVersion.status),
        lt(
          indicatorVersion.scheduledPublishAt,
          sql`clock_timestamp() - ${OVERDUE_AFTER}::interval`,
        ),
      ),
    )
    .orderBy(asc(indicatorVersion.scheduledPublishAt), asc(indicatorVersion.id));
  return rows.map(({ id }) => id);
}

/** What one sweep did: how many versions it published and failed, and how many are overdue. */
export interface PublicationSweep {
  published: number;
  failed: number;
  /**
   * True when the sweep ended early because of a lock timeout, or a statement timeout before a
   * version was chosen.
   */
  blocked: boolean;
  overdue: number;
}

function logPublished(logger: Logger, result: Extract<PublicationResult, { kind: 'published' }>) {
  const lateSeconds = Math.round(
    (result.publishedAt.getTime() - result.scheduledPublishAt.getTime()) / 1000,
  );
  const fields = {
    indicatorId: result.indicatorId,
    versionId: result.versionId,
    scheduledPublishAt: result.scheduledPublishAt.toISOString(),
    publishedAt: result.publishedAt.toISOString(),
    lateSeconds,
  };
  if (lateSeconds > LATE_AFTER_SECONDS) logger.warn(fields, 'Indicator published late');
  else logger.info(fields, 'Indicator published');
  if (result.slugTaken !== null) {
    logger.warn(
      { indicatorId: result.indicatorId, versionId: result.versionId, slug: result.slugTaken },
      'Indicator kept its slug because another indicator holds the new one',
    );
  }
}

/**
 * Publishes every version that is now due, each in its own transaction, earliest scheduled time
 * first. When the publish step refuses a version, or its publication fails after it was chosen
 * (including by a statement timeout), the version is logged as failed and skipped for the rest of
 * the sweep.
 *
 * A lock timeout, or a statement timeout before a version is chosen, ends the sweep early, and so
 * does `shouldStop` returning true before the next version. The versions left are published by
 * the next sweep. Finally the sweep logs a warning listing any overdue versions, so that a
 * publication that keeps failing or being held up gets noticed.
 */
export async function publishDueVersions(
  db: Database,
  logger: Logger,
  { shouldStop = () => false }: { shouldStop?: () => boolean } = {},
): Promise<PublicationSweep> {
  let skip: readonly string[] = [];
  let published = 0;
  let blocked = false;

  while (!shouldStop()) {
    let result: PublicationResult;
    try {
      result = await publishNextDueVersion(db, { skip });
    } catch (error) {
      if (!isPublicationBlocked(error)) throw error;
      logger.warn({ err: error }, 'Publication sweep blocked');
      blocked = true;
      break;
    }

    if (result.kind === 'none') break;
    if (result.kind === 'published') {
      logPublished(logger, result);
      published += 1;
      continue;
    }

    const { indicatorId, versionId } = result;
    logger.error(
      result.kind === 'refused'
        ? { indicatorId, versionId, reason: result.reason }
        : { indicatorId, versionId, err: result.error },
      'Indicator publication failed',
    );
    skip = [...skip, versionId];
  }

  const overdue = await overdueVersionIds(db);
  if (overdue.length > 0) {
    logger.warn({ versionIds: overdue, count: overdue.length }, 'Publication overdue');
  }

  return { published, failed: skip.length, blocked, overdue: overdue.length };
}
