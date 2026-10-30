import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dimensionKey } from './dimension-key.ts';
import { SYSTEM_USER_IDS } from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

const ACTOR = SYSTEM_USER_IDS.pholioMigration;

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

let testDb: TestDb;
let sql: postgres.Sql;

beforeAll(async () => {
  testDb = await createTestDb({ template: 'seeded' });
  sql = testDb.sql;
});

afterAll(async () => {
  await testDb.drop();
});

describe('the seeded data', () => {
  it("puts every batch on its indicator's published version", async () => {
    const misplaced = await sql`
      SELECT b.id FROM upload_batch b
      LEFT JOIN current_published_version cpv ON cpv.id = b.indicator_version_id
      WHERE cpv.indicator_id IS DISTINCT FROM b.indicator_id
    `;
    const [batches] = await sql<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM upload_batch`;

    expect(batches?.count).toBe(12);
    expect(misplaced).toEqual([]);
  });

  it("points every version at its indicator's batch, confirmed", async () => {
    const unpointed = await sql`
      SELECT v.id FROM indicator_version v
      LEFT JOIN upload_batch b ON b.id = v.upload_batch_id
      WHERE b.indicator_id IS DISTINCT FROM v.indicator_id
         OR v.data_table_confirmed_at IS DISTINCT FROM b.uploaded_at
    `;

    expect(unpointed).toEqual([]);
  });

  it('keys every observation by its dimension values', async () => {
    const mismatched = await sql`
      SELECT o.id FROM observation o
      LEFT JOIN (
        SELECT observation_id,
               string_agg(dimension_value_id::text, ',' ORDER BY dimension_value_id) AS dimension_key
        FROM observation_dimension GROUP BY observation_id
      ) k ON k.observation_id = o.id
      WHERE o.dimension_key <> coalesce(k.dimension_key, '')
    `;

    expect(mismatched).toEqual([]);
  });

  it('keys observations in SQL as dimensionKey does', async () => {
    const rows = await sql<{ dimensionKey: string; valueIds: string[] }[]>`
      SELECT o.dimension_key AS "dimensionKey", array_agg(od.dimension_value_id::text) AS "valueIds"
      FROM observation o JOIN observation_dimension od ON od.observation_id = o.id
      GROUP BY o.id
      HAVING count(*) > 2
      LIMIT 1000
    `;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.dimensionKey !== dimensionKey(row.valueIds))).toEqual([]);
  });

  it('shows every seeded observation, all of them published', async () => {
    const [counts] = await sql<{ stored: number; shown: number }[]>`
      SELECT (SELECT count(*)::int FROM observation) AS stored,
             (SELECT count(*)::int FROM published.observation) AS shown
    `;

    expect(counts?.shown).toBe(counts?.stored);
  });
});

describe('the upload tables', () => {
  let indicatorId: string;
  let versionId: string;
  let batchId: string;
  let otherVersionId: string;
  let otherBatchId: string;

  /** A seeded indicator, its one version and that version's batch. */
  async function seededVersion(offset: number): Promise<[string, string, string]> {
    const [row] = await sql<{ indicatorId: string; versionId: string; batchId: string }[]>`
      SELECT indicator_id AS "indicatorId", id AS "versionId", upload_batch_id AS "batchId"
      FROM indicator_version ORDER BY id OFFSET ${offset} LIMIT 1
    `;
    if (!row) throw new Error('The seed holds too few versions');
    return [row.indicatorId, row.versionId, row.batchId];
  }

  /** Inserts a batch on the first seeded version, with the columns given. */
  function insertBatch(columns: Record<string, unknown>) {
    return sql`
      INSERT INTO upload_batch ${sql({
        indicator_id: indicatorId,
        indicator_version_id: versionId,
        original_filename: 'data.csv',
        uploaded_by: ACTOR,
        ...columns,
      })}
    `;
  }

  async function insertObservation(batch: string, dimensionKeyValue: string) {
    return sql`
      INSERT INTO observation
        (indicator_id, area_id, from_date, to_date, upload_batch_id, dimension_key)
      SELECT ${indicatorId}, a.id, '2099-01-01', '2099-12-31', ${batch}, ${dimensionKeyValue}
      FROM (SELECT id FROM area ORDER BY id LIMIT 1) a
    `;
  }

  beforeAll(async () => {
    [indicatorId, versionId, batchId] = await seededVersion(0);
    [, otherVersionId, otherBatchId] = await seededVersion(1);
  });

  it('holds what an upload records about its file', async () => {
    await expect(
      insertBatch({
        blob_name: `${indicatorId}/data.csv`,
        byte_size: 104_857_600,
        sha256: 'a'.repeat(64),
        row_count: 3,
        column_names: ['area_code', 'period_start', 'period_end', 'value'],
      }),
    ).resolves.toBeDefined();
  });

  it.each<[string, () => Record<string, unknown>]>([
    ['a kind outside the vocabulary', () => ({ kind: 'append' })],
    ['a base batch for a replacement', () => ({ base_batch_id: batchId })],
    ['a superseded batch with nothing superseding it', () => ({ status: 'superseded' })],
    ['a successor on a batch not superseded', () => ({ superseded_by_id: batchId })],
    ['a hash in capitals', () => ({ sha256: 'A'.repeat(64) })],
    ['a hash of the wrong length', () => ({ sha256: 'a'.repeat(63) })],
  ])('refuses %s', async (_, columns) => {
    await expect(insertBatch(columns())).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses a batch on a version of another indicator', async () => {
    await expect(insertBatch({ indicator_version_id: otherVersionId })).rejects.toMatchObject({
      code: FOREIGN_KEY_VIOLATION,
    });
  });

  it("refuses a version pointing at another indicator's batch", async () => {
    await expect(
      sql`UPDATE indicator_version SET upload_batch_id = ${otherBatchId} WHERE id = ${versionId}`,
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it('refuses a confirmed data table on a version with no batch', async () => {
    await expect(
      sql`UPDATE indicator_version SET upload_batch_id = NULL WHERE id = ${versionId}`,
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses a row repeated within a batch', async () => {
    await insertObservation(batchId, 'repeated');

    await expect(insertObservation(batchId, 'repeated')).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it('takes the same area and period with other dimension values, or in another batch', async () => {
    const [another] = await sql<{ id: string }[]>`
      INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
      VALUES (${indicatorId}, ${versionId}, 'another.csv', ${ACTOR})
      RETURNING id
    `;
    await insertObservation(batchId, 'first');

    await expect(insertObservation(batchId, 'second')).resolves.toBeDefined();
    await expect(insertObservation(another?.id ?? '', 'first')).resolves.toBeDefined();
  });
});
