import { type Database, schema } from '@fphd/db';
import { rebuildReadModelTables } from '@fphd/internal-read-models';
import { type SQL, sql, TransactionRollbackError } from 'drizzle-orm';
import { expect } from 'vitest';

import type { IndicatorDraftAttributes } from './indicator-draft-repository.ts';
import { LOCK_WAIT } from './indicator-repository.testing.ts';
import type { Transaction } from './indicator-repository-sql.ts';
import {
  type OpenedUpdate,
  type PublishingDecision,
  type SentBackDraft,
  scheduledDraft,
  scheduledUpdate,
} from './indicator-workflow.testing.ts';

const { indicator, indicatorVersion } = schema;

/**
 * Creates a new indicator with a scheduled version whose upload batch holds one observation, and
 * sets the version's publication time to `minutesAgo` minutes ago. A negative `minutesAgo` puts the
 * time in the future. The time is taken from the database's clock, which the sweep also uses.
 */
export async function dueDraft(
  db: Database,
  name: string,
  minutesAgo: number,
): Promise<SentBackDraft> {
  const draft = await scheduledDraft(db, name);
  await db.execute(sql`
    INSERT INTO observation
      (indicator_id, area_id, from_date, to_date, value, upload_batch_id, dimension_key)
    SELECT ${draft.indicatorId}, a.id, '2024-01-01', '2024-12-31', 1, ${draft.batchId}, ''
    FROM published.area a
    JOIN published.area_type at ON at.id = a.area_type_id
    WHERE at.display_group IS NOT NULL
    ORDER BY a.id LIMIT 1
  `);
  await makeDue(db, draft.versionId, minutesAgo);
  return draft;
}

/** Sets the version's publication time to `minutesAgo` minutes ago by the database's clock. */
async function makeDue(db: Database, versionId: string, minutesAgo: number): Promise<void> {
  await db.execute(sql`
    UPDATE indicator_version
    SET scheduled_publish_at = clock_timestamp() - make_interval(secs => ${minutesAgo * 60}::float8)
    WHERE id = ${versionId}
  `);
}

/**
 * Creates a live indicator with a scheduled update to it, which changes the polarity and
 * `answers` besides, and sets the update's publication time to a minute ago.
 */
export async function dueUpdate(
  db: Database,
  name: string,
  decision: PublishingDecision,
  answers: IndicatorDraftAttributes = {},
): Promise<OpenedUpdate> {
  const update = await scheduledUpdate(db, name, decision, answers);
  await makeDue(db, update.versionId, 1);
  return update;
}

/**
 * Moves every scheduled version's publication time a year into the future, so a version that one
 * test left due is not published by the next test's sweep.
 */
export async function deferScheduledVersions(db: Database): Promise<void> {
  await db.execute(sql`
    UPDATE indicator_version SET scheduled_publish_at = clock_timestamp() + interval '1 year'
    WHERE status = 'scheduled'
  `);
}

export async function versionOf(db: Database, versionId: string) {
  const [row] = await db
    .select({
      status: indicatorVersion.status,
      isLocked: indicatorVersion.isLocked,
      publishedAt: indicatorVersion.publishedAt,
    })
    .from(indicatorVersion)
    .where(sql`${indicatorVersion.id} = ${versionId}`);
  if (row === undefined) throw new Error(`no version ${versionId}`);
  return row;
}

export async function dataUpdatedAtOf(db: Database, indicatorId: string): Promise<Date | null> {
  const [row] = await db
    .select({ dataUpdatedAt: indicator.dataUpdatedAt })
    .from(indicator)
    .where(sql`${indicator.id} = ${indicatorId}`);
  if (row === undefined) throw new Error(`no indicator ${indicatorId}`);
  return row.dataUpdatedAt;
}

/** The indicator's read-model rows, each as JSON text, in a stable order. */
export async function readModelRowsOf(
  db: Database | Transaction,
  indicatorId: string,
): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT 'available_data' AS model, to_jsonb(r)::text AS row
    FROM available_data r WHERE r.indicator_id = ${indicatorId}
    UNION ALL
    SELECT 'observation_range', to_jsonb(r)::text
    FROM observation_range r WHERE r.indicator_id = ${indicatorId}
    ORDER BY model, row
  `)) as unknown as { model: string; row: string }[];
  return rows.map(({ model, row }) => `${model} ${row}`);
}

class RolledBack extends Error {}

/**
 * The read-model rows that rebuilding every indicator's read models would give this indicator. The
 * rebuild runs in a transaction that is rolled back once the rows are read, so it changes nothing.
 */
export async function rowsAfterWholeRebuild(db: Database, indicatorId: string): Promise<string[]> {
  let rows: string[] = [];
  await expect(
    db.transaction(async (tx) => {
      await rebuildReadModelTables(tx);
      rows = await readModelRowsOf(tx, indicatorId);
      throw new RolledBack();
    }),
  ).rejects.toBeInstanceOf(RolledBack);
  return rows;
}

/**
 * Runs `statements` in a new transaction and keeps that transaction open, so it goes on holding
 * any locks the statements took. Calling `release` rolls the transaction back and waits for it to
 * end.
 */
export async function holdOpen(
  db: Database,
  statements: readonly SQL[],
): Promise<{ release: () => Promise<void> }> {
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { promise: holding, resolve: held, reject: failed } = Promise.withResolvers<void>();
  const done = db
    .transaction(async (tx) => {
      for (const statement of statements) await tx.execute(statement);
      held();
      await released;
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) failed(error);
    });
  await holding;
  return {
    release: async () => {
      release();
      await done;
    },
  };
}

/**
 * Waits until some session in this database is waiting for a lock of the given kind: an advisory
 * lock, or a lock on a table (`relation`).
 */
export async function lockWaitedOn(db: Database, waitEvent: 'advisory' | 'relation') {
  await expect
    .poll(async () => {
      const [row] = (await db.execute(sql`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND wait_event = ${waitEvent}
          AND datname = current_database()
      `)) as unknown as { waiting: number }[];
      return row?.waiting ?? 0;
    }, LOCK_WAIT)
    .toBeGreaterThan(0);
}
