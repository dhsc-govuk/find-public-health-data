import { dimensionKey } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const MIGRATION = '0044_upload-batch-versions';

interface Reference {
  areaId: string;
  female: string;
  ageBand: string;
}

/** A database migrated to just before this one, with an area and two dimension values. */
async function beforeMigration(): Promise<[TestDb, postgres.Sql, Reference]> {
  const testDb = await createTestDb({ template: 'unmigrated' });
  const sql = testDb.sql;
  await migrateBefore(sql, MIGRATION);

  const [area] = await sql<{ id: string }[]>`
    WITH t AS (
      INSERT INTO area_type (name, hierarchy_type, level)
      VALUES ('Region', 'Administrative', 1) RETURNING id
    )
    INSERT INTO area (code, name, area_type_id, valid_from)
    SELECT 'E12000001', 'North East', t.id, '2009-01-01' FROM t
    RETURNING id
  `;
  const [sex] = await sql<{ id: string }[]>`
    INSERT INTO dimension_type (name, dimension_class) VALUES ('Sex', 'demographic') RETURNING id
  `;
  const [age] = await sql<{ id: string }[]>`
    INSERT INTO dimension_type (name, dimension_class) VALUES ('Age', 'demographic') RETURNING id
  `;
  const [female] = await sql<{ id: string }[]>`
    INSERT INTO dimension_value (dimension_type_id, name) VALUES (${sex?.id ?? ''}, 'Female')
    RETURNING id
  `;
  const [ageBand] = await sql<{ id: string }[]>`
    INSERT INTO dimension_value (dimension_type_id, name) VALUES (${age?.id ?? ''}, '0-4 yrs')
    RETURNING id
  `;
  if (!area || !female || !ageBand) throw new Error('inserted no reference data');

  return [testDb, sql, { areaId: area.id, female: female.id, ageBand: ageBand.id }];
}

let shortId = 0;

/** An indicator with a version of each status given, as the versions were before this migration. */
async function indicatorWith(
  sql: postgres.Sql,
  statuses: ('published' | 'draft')[],
): Promise<{ indicatorId: string; versionIds: string[] }> {
  shortId += 1;
  const [created] = await sql<{ id: string }[]>`
    INSERT INTO indicator (short_id) VALUES (${shortId}) RETURNING id
  `;
  const indicatorId = created?.id ?? '';
  const versionIds: string[] = [];
  for (const status of statuses) {
    const [version] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version
        (indicator_id, status, published_at, name, slug, created_by, updated_by)
      VALUES (
        ${indicatorId}, ${status}, ${status === 'published' ? '2026-02-01T00:00:00Z' : null},
        ${`Indicator ${shortId}`}, ${`indicator-${shortId}`}, 'migration-test', 'migration-test'
      )
      RETURNING id
    `;
    versionIds.push(version?.id ?? '');
  }
  return { indicatorId, versionIds };
}

async function batchFor(
  sql: postgres.Sql,
  indicatorId: string,
  uploadedAt: string,
  status = 'processed',
  supersededById: string | null = null,
): Promise<string> {
  const [batch] = await sql<{ id: string }[]>`
    INSERT INTO upload_batch
      (indicator_id, original_filename, uploaded_by, uploaded_at, status, superseded_by_id)
    VALUES (${indicatorId}, 'data.csv', 'migration-test', ${uploadedAt}, ${status}, ${supersededById})
    RETURNING id
  `;
  return batch?.id ?? '';
}

async function observationIn(
  sql: postgres.Sql,
  { indicatorId, batchId, areaId }: { indicatorId: string; batchId: string; areaId: string },
  dimensionValueIds: string[] = [],
  deleted = false,
): Promise<string> {
  const [observation] = await sql<{ id: string }[]>`
    INSERT INTO observation
      (indicator_id, area_id, from_date, to_date, value, published_at, upload_batch_id, created_by,
       deleted_at)
    VALUES (${indicatorId}, ${areaId}, '2024-01-01', '2024-12-31', 1, now(), ${batchId},
            'migration-test', CASE WHEN ${deleted} THEN now() END)
    RETURNING id
  `;
  const observationId = observation?.id ?? '';
  for (const valueId of dimensionValueIds) {
    await sql`
      INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id)
      SELECT ${observationId}, id, dimension_type_id FROM dimension_value WHERE id = ${valueId}
    `;
  }
  return observationId;
}

describe(`migration ${MIGRATION}`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;
  let reference: Reference;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    [testDb, sql, reference] = await beforeMigration();
    const { areaId, female, ageBand } = reference;

    // Published, with an update draft that changed only metadata.
    const updated = await indicatorWith(sql, ['published', 'draft']);
    ids.updated = updated.indicatorId;
    [ids.updatedPublished = '', ids.updatedDraft = ''] = updated.versionIds;
    ids.updatedBatch = await batchFor(sql, updated.indicatorId, '2026-01-15T09:00:00Z');
    const inUpdated = { indicatorId: updated.indicatorId, batchId: ids.updatedBatch, areaId };
    ids.total = await observationIn(sql, inUpdated);
    ids.female = await observationIn(sql, inUpdated, [female]);
    ids.femaleAgeBand = await observationIn(sql, inUpdated, [ageBand, female]);

    // A draft that has never been published.
    const drafted = await indicatorWith(sql, ['draft']);
    ids.drafted = drafted.indicatorId;
    [ids.draftedDraft = ''] = drafted.versionIds;
    ids.draftedBatch = await batchFor(sql, drafted.indicatorId, '2026-03-01T09:00:00Z');
    await observationIn(sql, {
      indicatorId: drafted.indicatorId,
      batchId: ids.draftedBatch,
      areaId,
    });

    // A draft with no data.
    const empty = await indicatorWith(sql, ['draft']);
    [ids.emptyDraft = ''] = empty.versionIds;

    // Published, with an earlier batch the later one superseded, whose rows were deleted, and a
    // failed upload since.
    const replaced = await indicatorWith(sql, ['published']);
    ids.replaced = replaced.indicatorId;
    [ids.replacedPublished = ''] = replaced.versionIds;
    ids.currentBatch = await batchFor(sql, replaced.indicatorId, '2026-01-01T09:00:00Z');
    ids.supersededBatch = await batchFor(
      sql,
      replaced.indicatorId,
      '2025-01-01T09:00:00Z',
      'superseded',
      ids.currentBatch,
    );
    const inReplaced = { indicatorId: replaced.indicatorId, areaId };
    await observationIn(sql, { ...inReplaced, batchId: ids.supersededBatch }, [], true);
    await observationIn(sql, { ...inReplaced, batchId: ids.currentBatch });
    ids.failedBatch = await batchFor(sql, replaced.indicatorId, '2026-06-01T09:00:00Z', 'failed');

    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it("links each batch to its indicator's published version, or its draft", async () => {
    const rows = await sql<{ id: string; indicatorVersionId: string }[]>`
      SELECT id, indicator_version_id AS "indicatorVersionId" FROM upload_batch
    `;

    expect(Object.fromEntries(rows.map((row) => [row.id, row.indicatorVersionId]))).toEqual({
      [ids.updatedBatch ?? '']: ids.updatedPublished,
      [ids.draftedBatch ?? '']: ids.draftedDraft,
      [ids.currentBatch ?? '']: ids.replacedPublished,
      [ids.supersededBatch ?? '']: ids.replacedPublished,
      [ids.failedBatch ?? '']: ids.replacedPublished,
    });
  });

  it("points every version at its indicator's latest processed batch, as confirmed", async () => {
    const rows = await sql<
      { id: string; uploadBatchId: string | null; confirmed: string | null }[]
    >`
      SELECT id, upload_batch_id AS "uploadBatchId",
             to_char(data_table_confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS confirmed
      FROM indicator_version
    `;

    expect(Object.fromEntries(rows.map(({ id, ...pointer }) => [id, pointer]))).toEqual({
      [ids.updatedPublished ?? '']: {
        uploadBatchId: ids.updatedBatch,
        confirmed: '2026-01-15T09:00',
      },
      [ids.updatedDraft ?? '']: { uploadBatchId: ids.updatedBatch, confirmed: '2026-01-15T09:00' },
      [ids.draftedDraft ?? '']: { uploadBatchId: ids.draftedBatch, confirmed: '2026-03-01T09:00' },
      [ids.emptyDraft ?? '']: { uploadBatchId: null, confirmed: null },
      [ids.replacedPublished ?? '']: {
        uploadBatchId: ids.currentBatch,
        confirmed: '2026-01-01T09:00',
      },
    });
  });

  it('gives each observation the key its dimension values make', async () => {
    const rows = await sql<{ id: string; dimensionKey: string }[]>`
      SELECT id, dimension_key AS "dimensionKey" FROM observation
      WHERE id IN (${ids.total ?? ''}, ${ids.female ?? ''}, ${ids.femaleAgeBand ?? ''})
    `;

    expect(Object.fromEntries(rows.map((row) => [row.id, row.dimensionKey]))).toEqual({
      [ids.total ?? '']: '',
      [ids.female ?? '']: reference.female,
      [ids.femaleAgeBand ?? '']: dimensionKey([reference.female, reference.ageBand]),
    });
  });

  it("shows the published versions' batches and nothing else", async () => {
    const rows = await sql<{ indicatorId: string; rows: number }[]>`
      SELECT indicator_id AS "indicatorId", count(*)::int AS rows
      FROM published.observation GROUP BY indicator_id
    `;

    expect(Object.fromEntries(rows.map((row) => [row.indicatorId, row.rows]))).toEqual({
      [ids.updated ?? '']: 3,
      [ids.replaced ?? '']: 1,
    });
  });
});

describe(`migration ${MIGRATION} stops`, () => {
  const opened: TestDb[] = [];

  async function opening(): Promise<[postgres.Sql, Reference]> {
    const [testDb, sql, reference] = await beforeMigration();
    opened.push(testDb);
    return [sql, reference];
  }

  afterAll(async () => {
    for (const testDb of opened) {
      await testDb.drop();
    }
  });

  it('rather than hide published rows held in a batch the version would not point at', async () => {
    const [sql, { areaId }] = await opening();
    const { indicatorId } = await indicatorWith(sql, ['published']);
    const earlier = await batchFor(sql, indicatorId, '2025-01-01T09:00:00Z');
    const later = await batchFor(sql, indicatorId, '2026-01-01T09:00:00Z');
    await observationIn(sql, { indicatorId, batchId: earlier, areaId });
    await observationIn(sql, { indicatorId, batchId: later, areaId });

    await expect(migrateThrough(sql, MIGRATION)).rejects.toThrow(
      'published observations lie outside the batch their published version points at',
    );
  });

  it('at a superseded batch with nothing superseding it, naming it', async () => {
    const [sql] = await opening();
    const { indicatorId } = await indicatorWith(sql, ['published']);
    await batchFor(sql, indicatorId, '2026-01-01T09:00:00Z');
    const unpaired = await batchFor(sql, indicatorId, '2025-01-01T09:00:00Z', 'superseded');

    await expect(migrateThrough(sql, MIGRATION)).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: `upload_batch rows superseded without a successor, or with one while not superseded: ${unpaired}`,
      }),
    });
  });

  it('at a batch whose indicator has no version', async () => {
    const [sql] = await opening();
    shortId += 1;
    const [created] = await sql<{ id: string }[]>`
      INSERT INTO indicator (short_id) VALUES (${shortId}) RETURNING id
    `;
    await batchFor(sql, created?.id ?? '', '2026-01-01T09:00:00Z');

    await expect(migrateThrough(sql, MIGRATION)).rejects.toThrow(
      'upload_batch belongs to an indicator with no version to link it to',
    );
  });

  it('at repeated rows rather than drop one', async () => {
    const [sql, { areaId, female }] = await opening();
    const { indicatorId } = await indicatorWith(sql, ['published']);
    const batchId = await batchFor(sql, indicatorId, '2026-01-01T09:00:00Z');
    await observationIn(sql, { indicatorId, batchId, areaId }, [female]);
    await observationIn(sql, { indicatorId, batchId, areaId }, [female]);

    await expect(migrateThrough(sql, MIGRATION)).rejects.toMatchObject({
      cause: expect.objectContaining({ code: '23505' }),
    });
  });
});
