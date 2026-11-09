import { type Database, schema } from '@fphd/db';
import { type Actor, type AuditChanges, changesBetween } from '@fphd/db/audit-log';
import { refreshIndicatorReadModels } from '@fphd/internal-read-models';
import type { Logger } from '@fphd/logger';
import { and, asc, eq, lt, lte, notInArray, sql } from 'drizzle-orm';

import { hasSqlState, type Transaction } from './indicator-repository-sql.ts';
import { type IndicatorStepResult, takeIndicatorStepIn } from './indicator-workflow-repository.ts';

const { indicator, indicatorVersion, isScheduled, SYSTEM_USER_IDS } = schema;

/** Who scheduled publication records as: its system user, outside any request. */
export const SCHEDULED_PUBLICATION: Actor = {
  userId: SYSTEM_USER_IDS.scheduledPublication,
  requestId: null,
};

const LOCK_NOT_AVAILABLE = '55P03';
const QUERY_CANCELED = '57014';

/** A publication published this many seconds after its time is logged as late. */
const LATE_AFTER_SECONDS = 120;

/** A version still due this long after its time is logged as overdue. */
const OVERDUE_AFTER = '10 minutes';

/** The version one call chose, and what became of it. */
export type PublicationResult =
  | { kind: 'none' }
  | {
      kind: 'published';
      indicatorId: string;
      versionId: string;
      scheduledPublishAt: Date;
      publishedAt: Date;
    }
  | {
      kind: 'refused';
      indicatorId: string;
      versionId: string;
      reason: Exclude<IndicatorStepResult<'not_due'>, { ok: true }>['reason'];
    }
  | { kind: 'failed'; indicatorId: string; versionId: string; error: unknown };

/**
 * Whether `error` ends the sweep: a lock timeout, which the next sweep may get past, or a statement
 * timeout before any version is chosen.
 */
function isPublicationBlocked(error: unknown): boolean {
  return hasSqlState(error, LOCK_NOT_AVAILABLE) || hasSqlState(error, QUERY_CANCELED);
}

/** Sets the indicator's data date to the version's publication time, answering the change. */
async function markDataUpdated(
  tx: Transaction,
  indicatorId: string,
  versionId: string,
): Promise<AuditChanges> {
  // Copied in the statement, so the two times are equal to the microsecond.
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
 * Publishes the version due soonest, other than those in `skip`, in one transaction: its status,
 * its publication time, the indicator's data date when it brings new data, the indicator's read
 * models and the audit entry, as Scheduled publication. A version another sweep holds is passed
 * over. A lock timeout, or any error before a version is chosen, throws. Any other error once a
 * version is chosen, a statement timeout included, answers `failed`, with nothing written.
 */
export async function publishNextDueVersion(
  db: Database,
  { skip }: { skip: readonly string[] },
): Promise<PublicationResult> {
  let chosen: { indicatorId: string; versionId: string } | undefined;
  let publishedAt: Date | null = null;

  try {
    return await db.transaction(async (tx): Promise<PublicationResult> => {
      // A held table lock delays the sweep rather than hanging it, and a hung query ends.
      await tx.execute(sql`SELECT
        set_config('lock_timeout', '5s', true),
        set_config('statement_timeout', '120s', true),
        set_config('idle_in_transaction_session_timeout', '60s', true)`);

      const [due] = await tx
        .select({
          indicatorId: indicatorVersion.indicatorId,
          versionId: indicatorVersion.id,
          scheduledPublishAt: indicatorVersion.scheduledPublishAt,
          // The batch the indicator's current publication shows, before this one replaces it.
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

      // The locks this publication's writes need on indicator and indicator_version, taken now and
      // in the order a live data package takes its own: a package that started first holds the
      // publication back until the lock timeout, and one that starts later waits for it to commit.
      // Keep indicator first: in the other order the two can deadlock.
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
          // The read models last, after every write to the indicator's own rows.
          write: async (stepTx, _submission, draft, version) => {
            publishedAt = version.publishedAt;
            if (publishedAt === null) throw new Error(`published ${draft.id} without a time`);
            const changes =
              draft.uploadBatchId !== null && draft.uploadBatchId !== due.previousBatchId
                ? await markDataUpdated(stepTx, due.indicatorId, draft.id)
                : {};
            await refreshIndicatorReadModels(stepTx, due.indicatorId);
            return changes;
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
      };
    });
  } catch (error) {
    if (chosen === undefined || hasSqlState(error, LOCK_NOT_AVAILABLE)) throw error;
    return { kind: 'failed', ...chosen, error };
  }
}

/** Versions still scheduled more than `OVERDUE_AFTER` after their time. */
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

/** What one sweep did. */
export interface PublicationSweep {
  published: number;
  failed: number;
  /** True when a lock timeout, or a statement timeout before a version was chosen, ended it early. */
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
}

/**
 * Publishes every version now due, one transaction each, oldest first. A version refused or
 * failing, a statement timeout included, is logged and passed over for the rest of the sweep. A
 * lock timeout ends the sweep, and so does `shouldStop` answering true before the next version,
 * which leaves the rest for the next sweep. Then any version overdue is logged, so a held-up
 * publication is noticed.
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
