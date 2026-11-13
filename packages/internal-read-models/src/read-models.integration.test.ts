import { type Database, schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  rebuildReadModelTables,
  refreshIndicatorReadModels,
  type Transaction,
} from './read-models.ts';

/** Thrown to roll a transaction back once the test has read what it wrote. */
class RolledBack extends Error {}

let testDb: TestDb;
let db: Database;

beforeAll(async () => {
  testDb = await createTestDb({ template: 'seeded' });
  db = testDb.db;
});

afterAll(async () => {
  await testDb.drop();
});

/** The indicator's read-model rows, each as JSON text, in a stable order. */
async function readModelRowsOf(executor: Database | Transaction, indicatorId: string) {
  const rows = (await executor.execute(sql`
    SELECT 'available_data' AS model, to_jsonb(r)::text AS row
    FROM available_data r WHERE r.indicator_id = ${indicatorId}
    UNION ALL
    SELECT 'observation_range', to_jsonb(r)::text
    FROM observation_range r WHERE r.indicator_id = ${indicatorId}
    UNION ALL
    SELECT 'observation_series', to_jsonb(r)::text
    FROM observation_series r WHERE r.indicator_id = ${indicatorId}
    UNION ALL
    SELECT 'observation_series_batch', to_jsonb(r)::text
    FROM observation_series_batch r WHERE r.indicator_id = ${indicatorId}
    ORDER BY model, row
  `)) as unknown as { model: string; row: string }[];
  return rows.map(({ model, row }) => `${model} ${row}`);
}

/** What a whole rebuild would leave for the indicator, read inside it and rolled back. */
async function rowsAfterWholeRebuild(indicatorId: string) {
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

/** Seeded indicators with rows in every read model, so a change to any shows. */
async function seededIndicatorIds(): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT indicator_id AS id FROM observation_range
    INTERSECT SELECT indicator_id FROM available_data
    INTERSECT SELECT indicator_id FROM observation_series
    ORDER BY id
  `)) as unknown as { id: string }[];
  return rows.map(({ id }) => id);
}

/**
 * Adds a published observation for the indicator in a year no seeded row reaches, in an area its
 * read models group by, so a rebuild or refresh adds rows for it.
 */
async function publishNewObservation(indicatorId: string): Promise<void> {
  const inserted = (await db.execute(sql`
    INSERT INTO observation
      (indicator_id, area_id, from_date, to_date, value, upload_batch_id, dimension_key)
    SELECT ${indicatorId}, a.id, '2099-01-01', '2099-12-31', 1, v.upload_batch_id, ''
    FROM current_published_version cpv
    JOIN indicator_version v ON v.id = cpv.id
    CROSS JOIN (
      SELECT a.id FROM published.area a
      JOIN published.area_type at ON at.id = a.area_type_id
      WHERE at.display_group IS NOT NULL
      ORDER BY a.id LIMIT 1
    ) a
    WHERE cpv.indicator_id = ${indicatorId}
    RETURNING id
  `)) as unknown as { id: string }[];
  if (inserted.length !== 1) throw new Error(`published no observation for ${indicatorId}`);
}

/** Sessions in this test's database waiting on a table lock. */
async function tableLockWaiters(): Promise<number> {
  const [row] = (await db.execute(sql`
    SELECT count(*)::int AS waiting FROM pg_stat_activity
    WHERE wait_event_type = 'Lock' AND wait_event = 'relation'
      AND datname = current_database()
  `)) as unknown as { waiting: number }[];
  return row?.waiting ?? 0;
}

describe('refreshIndicatorReadModels', () => {
  it("leaves the indicator's rows as a whole rebuild would", async () => {
    const [indicatorId] = await seededIndicatorIds();
    if (indicatorId === undefined) throw new Error('The seed holds no indicator with read models');
    await publishNewObservation(indicatorId);
    const before = await readModelRowsOf(db, indicatorId);
    const expected = await rowsAfterWholeRebuild(indicatorId);

    await db.transaction((tx) => refreshIndicatorReadModels(tx, indicatorId));

    const after = await readModelRowsOf(db, indicatorId);
    expect(after).toEqual(expected);
    expect(after).not.toEqual(before);
  });

  it("leaves another indicator's rows alone, even ones a rebuild would change", async () => {
    const [, indicatorId, otherId] = await seededIndicatorIds();
    if (indicatorId === undefined || otherId === undefined) {
      throw new Error('The seed holds too few indicators with read models');
    }
    await publishNewObservation(otherId);
    const otherBefore = await readModelRowsOf(db, otherId);
    expect(await rowsAfterWholeRebuild(otherId)).not.toEqual(otherBefore);

    await db.transaction((tx) => refreshIndicatorReadModels(tx, indicatorId));

    expect(await readModelRowsOf(db, otherId)).toEqual(otherBefore);
  });

  it('leaves an indicator with nothing published with no rows', async () => {
    const [created] = (await db.execute(
      sql`INSERT INTO indicator (team_id) VALUES (${schema.IMPORTED_INDICATOR_TEAM_ID}) RETURNING id`,
    )) as unknown as { id: string }[];
    if (created === undefined) throw new Error('inserted no indicator');
    const indicatorId = created.id;
    await db.execute(sql`
      INSERT INTO available_data (indicator_id, area_type_id, area_type_name, area_count)
      VALUES (${indicatorId}, uuidv7(), 'Stale', 1)
    `);
    await db.execute(sql`
      INSERT INTO observation_range
        (indicator_id, display_group, from_date, to_date, segment, min, max)
      VALUES (${indicatorId}, 'Stale', '2099-01-01', '2099-12-31', '', 1, 1)
    `);
    await db.execute(sql`
      INSERT INTO observation_series_batch (upload_batch_id, indicator_id, trend_values)
      VALUES (uuidv7(), ${indicatorId}, '{1}')
    `);

    await db.transaction((tx) => refreshIndicatorReadModels(tx, indicatorId));

    expect(await readModelRowsOf(db, indicatorId)).toEqual([]);
  });

  it('rolls back every model if a refresh fails between phases', async () => {
    const indicatorId = (await seededIndicatorIds()).at(-2);
    if (!indicatorId) throw new Error('Expected a seeded indicator');
    const before = await readModelRowsOf(db, indicatorId);
    await publishNewObservation(indicatorId);

    await expect(
      db.transaction((tx) =>
        refreshIndicatorReadModels(tx, indicatorId, ({ table }) => {
          if (table === 'observation_range') throw new RolledBack();
        }),
      ),
    ).rejects.toBeInstanceOf(RolledBack);

    expect(await readModelRowsOf(db, indicatorId)).toEqual(before);
  });

  it('serializes the same indicator while another indicator can commit', async () => {
    const [indicatorId, otherId] = await seededIndicatorIds();
    if (!indicatorId || !otherId) throw new Error('Expected two seeded indicators');
    const expected = await rowsAfterWholeRebuild(indicatorId);
    let rebuilt: () => void = () => {};
    let release: () => void = () => {};
    const rebuilding = new Promise<void>((resolve) => {
      rebuilt = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = db.transaction(async (tx) => {
      await refreshIndicatorReadModels(tx, indicatorId);
      rebuilt();
      await released;
    });
    await rebuilding;
    const second = db.transaction((tx) => refreshIndicatorReadModels(tx, indicatorId));
    try {
      await expect
        .poll(
          async () => {
            const [row] = await db.execute<{ waiting: number }>(sql`
            SELECT count(*)::int AS waiting FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query LIKE 'select "id" from "indicator"%'
          `);
            return row?.waiting;
          },
          { timeout: 10_000 },
        )
        .toBe(1);
      await expect(
        db.transaction((tx) => refreshIndicatorReadModels(tx, otherId)),
      ).resolves.toBeUndefined();
    } finally {
      release();
      await Promise.all([first, second]);
    }
    expect(await readModelRowsOf(db, indicatorId)).toEqual(expected);
  });

  it('waits for a whole rebuild in progress, then commits', async () => {
    const indicatorId = (await seededIndicatorIds()).at(-1);
    if (indicatorId === undefined) throw new Error('The seed holds no indicator with read models');
    await publishNewObservation(indicatorId);
    const expected = await rowsAfterWholeRebuild(indicatorId);

    let rebuilt: () => void = () => {};
    let release: () => void = () => {};
    const rebuilding = new Promise<void>((resolve) => {
      rebuilt = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rebuild = db.transaction(async (tx) => {
      await rebuildReadModelTables(tx);
      rebuilt();
      await released;
    });
    await rebuilding;
    const refresh = db.transaction((tx) => refreshIndicatorReadModels(tx, indicatorId));
    try {
      await expect.poll(tableLockWaiters, { timeout: 10_000 }).toBe(1);
    } finally {
      release();
    }

    await expect(rebuild).resolves.toBeUndefined();
    await expect(refresh).resolves.toBeUndefined();
    expect(await readModelRowsOf(db, indicatorId)).toEqual(expected);
  });
});

describe('observation_range distributions', () => {
  it('orders quartiles and quintile cutoffs within each range, with cutoffs from five values', async () => {
    const rows = (await db.execute(sql`
      SELECT
        count(*)::int AS ranges,
        count(*) FILTER (WHERE quintile_cutoffs IS NOT NULL)::int AS with_cutoffs,
        count(*) FILTER (WHERE NOT (
          p25 BETWEEN min AND max AND p75 BETWEEN p25 AND max
          AND (quintile_cutoffs IS NULL OR (
            cardinality(quintile_cutoffs) = 4
            AND min <= quintile_cutoffs[1]
            AND quintile_cutoffs[1] <= quintile_cutoffs[2]
            AND quintile_cutoffs[2] <= quintile_cutoffs[3]
            AND quintile_cutoffs[3] <= quintile_cutoffs[4]
            AND quintile_cutoffs[4] <= max
          ))
        ))::int AS disordered
      FROM observation_range
    `)) as unknown as { ranges: number; with_cutoffs: number; disordered: number }[];
    expect(rows[0]?.ranges).toBeGreaterThan(0);
    expect(rows[0]?.with_cutoffs).toBeGreaterThan(0);
    expect(rows[0]?.disordered).toBe(0);
  });

  it('places each cutoff at the last value before the next fifth', async () => {
    const [indicatorId] = await seededIndicatorIds();
    if (indicatorId === undefined) throw new Error('The seed holds no indicator with read models');
    await db
      .transaction(async (tx) => {
        await tx.execute(sql`DELETE FROM observation WHERE indicator_id = ${indicatorId}`);
        await tx.execute(sql`
        INSERT INTO observation
          (indicator_id, area_id, from_date, to_date, value, upload_batch_id, dimension_key)
        SELECT ${indicatorId}, a.id, '2099-01-01', '2099-12-31', a.value, v.upload_batch_id, ''
        FROM current_published_version cpv
        JOIN indicator_version v ON v.id = cpv.id
        CROSS JOIN (
          SELECT a.id, row_number() OVER (ORDER BY a.id) * 10 AS value
          FROM published.area a
          JOIN published.area_type at ON at.id = a.area_type_id
          WHERE at.display_group = (
            SELECT display_group FROM published.area_type
            WHERE display_group IS NOT NULL ORDER BY display_group LIMIT 1
          )
          ORDER BY a.id LIMIT 7
        ) a
        WHERE cpv.indicator_id = ${indicatorId}
      `);
        await refreshIndicatorReadModels(tx, indicatorId);
        const ranges = (await tx.execute(sql`
        SELECT min, max, p25, p75, quintile_cutoffs AS cutoffs FROM observation_range
        WHERE indicator_id = ${indicatorId}
      `)) as unknown as { min: number; max: number; p25: number; p75: number; cutoffs: number[] }[];
        // Seven values 10..70: ranks ceil(7 × 0.2) = 2, 3, 5 and 6.
        expect(ranges).toEqual([{ min: 10, max: 70, p25: 25, p75: 55, cutoffs: [20, 30, 50, 60] }]);
        throw new RolledBack();
      })
      .catch((error: unknown) => {
        if (!(error instanceof RolledBack)) throw error;
      });
  });
});
