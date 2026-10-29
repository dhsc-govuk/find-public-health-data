import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { PassThrough, Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';
import { BlobServiceClient } from '@azure/storage-blob';
import { appEnvFields, parseEnv, z } from '@fphd/config';
import { createDb, type Database, dbEnvFields, dimensionKey, resolveDbTls, schema } from '@fphd/db';
import { auditEntriesFor, createTestDatabase } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import { BlobNotFoundError, createAzureBlobStorage } from '@fphd/internal-storage';
import { createCapturingLogger } from '@fphd/logger/testing';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { v7 as randomUuidV7 } from 'uuid';
import { afterAll, describe, expect, it } from 'vitest';

import type { DataTableEvent } from './data-table.ts';
import {
  cancellable,
  type DataUpload,
  processDataUpload,
  stageRows,
} from './data-upload-load-repository.ts';
import { dataUploadsRouter } from './data-uploads.ts';
import { updateIndicatorDraft } from './indicator-draft-repository.ts';
import { createDraftFromPublished } from './indicator-publish-repository.ts';
import { AS_ACTOR, newDraft } from './indicator-repository.testing.ts';
import { createInternalRepositories } from './repositories.ts';
import {
  createRouterTestApp,
  handlerLogLines,
  TEST_TEAM_ID,
  TEST_USER_ID,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
const env = parseEnv(
  z.object({
    ...dbEnvFields,
    ...appEnvFields,
    POSTGRES_USER: z.string().default('fphd'),
    POSTGRES_PASSWORD: z.string().default('fphd'),
    INTERNAL_API_PASSWORD: z.string().default('internal_api'),
    STORAGE_CONNECTION_STRING: z.string(),
  }),
  process.env,
);

const {
  area,
  dimensionType,
  dimensionValue,
  indicatorVersion,
  noteType,
  observation,
  observationDimension,
  observationNote,
  uploadBatch,
  currentPublishedVersion,
} = schema;

const testDb = await createTestDatabase({ template: 'seeded' });
const connection = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: testDb.name,
  ssl: resolveDbTls(env.APP_ENV, env.DB_TLS),
};
// The uploads run as internal_api, so its grants are tested too; the checks read as the owner.
const internalDb = createDb({
  ...connection,
  user: 'internal_api',
  password: env.INTERNAL_API_PASSWORD,
});
const ownerDb = createDb({
  ...connection,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
});

const container = `fphd-test-${randomBytes(6).toString('hex')}`;
const storage = await createAzureBlobStorage({
  container,
  connectionString: env.STORAGE_CONNECTION_STRING,
});

const app = createRouterTestApp(
  dataUploadsRouter(
    createInternalRepositories(internalDb).dataUploads,
    createInternalRepositories(internalDb).indicators,
    storage,
    testSessionVerifier,
  ),
);

afterAll(async () => {
  await internalDb.$client.end();
  await ownerDb.$client.end();
  await testDb.drop();
  await BlobServiceClient.fromConnectionString(env.STORAGE_CONNECTION_STRING).deleteContainer(
    container,
  );
});

const HEADER =
  'area_code,period_start,period_end,value,count,sex,age,category_type,category,value_note';
const VALID_CSV = [
  HEADER,
  'E92000001,2019-04-01,2020-03-31,83.8,1234,Female,<75 yrs,,,',
  'E92000001,2019-04-01,2020-03-31,83.1,1200,Persons,All ages,,,',
  'E08000035,2019-04-01,2020-03-31,,,,,Ethnic groups [4],White,Aggregated from values for merged CCGs',
].join('\n');

async function upload(indicatorId: string, content: string, filename = 'data.csv') {
  return request(app)
    .post(`/api/internal/indicators/${indicatorId}/data-uploads`)
    .set('Cookie', await testSessionCookie(['internal', 'publisher']))
    .attach('dataTable', Buffer.from(content), filename);
}

async function draftOf(db: Database, indicatorId: string) {
  const [draft] = await db
    .select()
    .from(indicatorVersion)
    .where(
      and(eq(indicatorVersion.indicatorId, indicatorId), eq(indicatorVersion.status, 'draft')),
    );
  if (draft === undefined) throw new Error(`indicator ${indicatorId} has no draft`);
  return draft;
}

async function batchOf(batchId: string) {
  const [batch] = await ownerDb.select().from(uploadBatch).where(eq(uploadBatch.id, batchId));
  return batch;
}

async function rowsOf(batchId: string) {
  return ownerDb
    .select()
    .from(observation)
    .where(eq(observation.uploadBatchId, batchId))
    .orderBy(asc(observation.value));
}

/**
 * Published indicators with no draft open, the nth of them, so each test takes its own, moved from
 * Fingertips into the test session's team so its publisher may edit it.
 */
async function publishedWithoutDraft(nth: number): Promise<string> {
  const rows = await ownerDb
    .select({ indicatorId: currentPublishedVersion.indicatorId })
    .from(currentPublishedVersion)
    .leftJoin(
      indicatorVersion,
      and(
        eq(indicatorVersion.indicatorId, currentPublishedVersion.indicatorId),
        eq(indicatorVersion.status, 'draft'),
      ),
    )
    .where(sql`${indicatorVersion.id} IS NULL`)
    .orderBy(asc(currentPublishedVersion.indicatorId));
  const row = rows[nth];
  if (row === undefined)
    throw new Error(`the seed has no published indicator ${nth} without a draft`);
  await ownerDb
    .update(schema.indicator)
    .set({ teamId: TEST_TEAM_ID })
    .where(eq(schema.indicator.id, row.indicatorId));
  return row.indicatorId;
}

async function blobExists(name: string): Promise<boolean> {
  try {
    await text(await storage.get(name));
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false;
    throw error;
  }
}

describe('POST /api/internal/indicators/:id/data-uploads', () => {
  it('stores the file, loads its rows into a batch and points the draft at it', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Upload loads rows');

    const response = await upload(indicatorId, VALID_CSV, 'life.csv');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: expect.any(String), rowCount: 3 });
    const batchId: string = response.body.id;

    expect(await batchOf(batchId)).toMatchObject({
      indicatorId,
      status: 'processed',
      originalFilename: 'life.csv',
      uploadedBy: TEST_USER_ID,
      blobName: `${indicatorId}/${batchId}.csv`,
      byteSize: Buffer.byteLength(VALID_CSV),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      rowCount: 3,
      columnNames: HEADER.split(','),
      validationResult: null,
      kind: 'replace',
      baseBatchId: null,
    });
    expect(await text(await storage.get(`${indicatorId}/${batchId}.csv`))).toBe(VALID_CSV);
    expect(await draftOf(ownerDb, indicatorId)).toMatchObject({
      uploadBatchId: batchId,
      dataTableConfirmedAt: null,
      updatedBy: TEST_USER_ID,
    });

    const rows = await rowsOf(batchId);
    expect(rows.map(({ value, count }) => ({ value, count }))).toEqual([
      { value: 83.1, count: 1200 },
      { value: 83.8, count: 1234 },
      { value: null, count: null },
    ]);
  });

  it('reads the columns by their headings, in any order and case', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Upload in any column order');
    const csv = [
      ' Value_Note ,Category, COUNT ,period_end,Sex,value,Area_Code,Category_Type,age, PERIOD_START ,' +
        'denominator,upper_ci_95,lower_ci_95,upper_ci_998,lower_ci_998',
      'Aggregated from values for merged CCGs,White,1234,2020-03-31,Female,83.8,E08000035,' +
        'Ethnic groups [4],<75 yrs,2019-04-01,56789,84.1,83.5,84.4,83.2',
    ].join('\n');

    const response = await upload(indicatorId, csv);

    expect(response.status).toBe(201);
    const [row, ...others] = await rowsOf(response.body.id);
    expect(others).toEqual([]);
    const [leeds] = await ownerDb
      .select({ id: area.id })
      .from(area)
      .where(and(eq(area.code, 'E08000035'), isNull(area.validTo)));
    expect(row).toMatchObject({
      areaId: leeds?.id,
      fromDate: '2019-04-01',
      toDate: '2020-03-31',
      value: 83.8,
      count: 1234,
      numerator: null,
      denominator: 56789,
      lowerCi95: 83.5,
      upperCi95: 84.1,
      lowerCi998: 83.2,
      upperCi998: 84.4,
    });

    const valueId = async (type: string, name: string) => {
      const [found] = await ownerDb
        .select({ id: dimensionValue.id })
        .from(dimensionValue)
        .innerJoin(dimensionType, eq(dimensionType.id, dimensionValue.dimensionTypeId))
        .where(and(eq(dimensionType.name, type), eq(dimensionValue.name, name)));
      return found?.id;
    };
    const expected = [
      await valueId('Sex', 'Female'),
      await valueId('Age', '<75 yrs'),
      await valueId('Ethnic groups [4]', 'White'),
    ];
    const dimensions = await ownerDb
      .select({ id: observationDimension.dimensionValueId })
      .from(observationDimension)
      .where(eq(observationDimension.observationId, row?.id ?? ''));
    expect(dimensions.map(({ id }) => id).sort()).toEqual([...expected].sort());
    expect(row?.dimensionKey).toBe(dimensionKey(expected.map(String)));

    const [note] = await ownerDb
      .select({ text: noteType.text })
      .from(observationNote)
      .innerJoin(noteType, eq(noteType.id, observationNote.noteTypeId))
      .where(eq(observationNote.observationId, row?.id ?? ''));
    expect(note?.text).toBe('Aggregated from values for merged CCGs');
  });

  it('stores a numerator column apart from the count, recording the columns the file had', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Upload with a numerator');
    const csv = [
      'area_code,period_start,period_end,value,numerator,denominator',
      'E08000035,2019-04-01,2020-03-31,12.5,250,2000',
    ].join('\n');

    const response = await upload(indicatorId, csv);

    expect(response.status).toBe(201);
    expect(await rowsOf(response.body.id)).toMatchObject([
      { value: 12.5, count: null, numerator: 250, denominator: 2000 },
    ]);
    expect(await batchOf(response.body.id)).toMatchObject({
      columnNames: ['area_code', 'period_start', 'period_end', 'value', 'numerator', 'denominator'],
    });
  });

  it('logs how long each stage of the upload took, in whole milliseconds', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Upload logs its timings');
    const { logger, lines } = createCapturingLogger('internal-api');
    const logged = createRouterTestApp(
      dataUploadsRouter(
        createInternalRepositories(internalDb).dataUploads,
        createInternalRepositories(internalDb).indicators,
        storage,
        testSessionVerifier,
      ),
      logger,
    );

    const response = await request(logged)
      .post(`/api/internal/indicators/${indicatorId}/data-uploads`)
      .set('Cookie', await testSessionCookie(['internal', 'publisher']))
      .attach('dataTable', Buffer.from(VALID_CSV), 'data.csv');

    expect(response.status).toBe(201);
    const [line] = (await handlerLogLines(lines)).filter(
      ({ msg }) => msg === 'Data table uploaded',
    );
    expect(line).toMatchObject({ byteSize: Buffer.byteLength(VALID_CSV), rowCount: 3 });
    const timings = line?.timings as Record<string, unknown>;
    expect(Object.keys(timings).sort()).toEqual(
      [
        'receiveMs',
        'lockWaitMs',
        'stageMs',
        'duplicatesMs',
        'insertMs',
        'observationMs',
        'dimensionMs',
        'noteMs',
        'deleteEarlierMs',
        'commitMs',
        'totalMs',
      ].sort(),
    );
    for (const ms of Object.values(timings)) {
      expect(Number.isInteger(ms) && (ms as number) >= 0).toBe(true);
    }
  });

  it('stores totals without the dimension and keys each row by its dimension values', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Upload stores totals');

    const response = await upload(indicatorId, VALID_CSV);
    const rows = await rowsOf(response.body.id);
    const dimensions = await ownerDb
      .select()
      .from(observationDimension)
      .where(
        inArray(
          observationDimension.observationId,
          rows.map(({ id }) => id),
        ),
      );
    const notes = await ownerDb
      .select()
      .from(observationNote)
      .where(
        inArray(
          observationNote.observationId,
          rows.map(({ id }) => id),
        ),
      );

    const [total, female, white] = [rows[0], rows[1], rows[2]];
    const valuesOf = (id: string | undefined) =>
      dimensions.filter((row) => row.observationId === id).map((row) => row.dimensionValueId);

    expect(valuesOf(total?.id)).toEqual([]);
    expect(total?.dimensionKey).toBe('');
    expect(valuesOf(female?.id)).toHaveLength(2);
    expect(female?.dimensionKey).toBe(dimensionKey(valuesOf(female?.id)));
    expect(valuesOf(white?.id)).toHaveLength(1);
    expect(notes.map(({ observationId }) => observationId)).toEqual([white?.id]);
  });

  it("keeps a draft's rows out of the published views", async () => {
    const { indicatorId } = await newDraft(internalDb, 'Upload stays unpublished');

    await upload(indicatorId, VALID_CSV);

    const published = await ownerDb.execute(
      sql`SELECT count(*)::int AS n FROM published.observation WHERE indicator_id = ${indicatorId}`,
    );
    expect(published[0]).toEqual({ n: 0 });
  });

  it('keeps a refused file and its failed batch, loading nothing and leaving the draft alone', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Upload refused');
    const first = await upload(indicatorId, VALID_CSV);

    const response = await upload(
      indicatorId,
      [
        HEADER,
        'E99999999,2019-04-01,2020-03-31,1,,,,,,',
        'E92000001,2019-04-01,2020-03-31,lots,,,,,,',
        'E92000001,2020-04-01,2021-03-31,1,,,,,,',
        'E92000001,2020-04-01,2021-03-31,2,,Persons,,,,',
      ].join('\n'),
    );

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'invalid_data_table',
      id: expect.any(String),
      problems: [
        { code: 'unmatched_area_codes', items: ['E99999999'], count: 1 },
        { code: 'invalid_numbers', items: ['3'], count: 1 },
        { code: 'duplicate_rows', items: ['5'], count: 1 },
      ],
    });
    const failedId: string = response.body.id;
    expect(await batchOf(failedId)).toMatchObject({
      status: 'failed',
      validationResult: response.body.problems,
      rowCount: null,
      columnNames: HEADER.split(','),
    });
    expect(await rowsOf(failedId)).toEqual([]);
    expect(await blobExists(`${indicatorId}/${failedId}.csv`)).toBe(true);
    expect((await draftOf(ownerDb, indicatorId)).uploadBatchId).toBe(first.body.id);
    expect(await rowsOf(first.body.id)).toHaveLength(3);
  });

  it('replaces the draft batch on a second upload, deleting its rows, its row and its file', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Upload replaces');
    const first = await upload(indicatorId, VALID_CSV);
    const firstBlob = `${indicatorId}/${first.body.id}.csv`;

    const second = await upload(indicatorId, `${HEADER}\nE12000001,2021-04-01,2022-03-31,7,,,,,,`);

    expect(second.status).toBe(201);
    expect((await draftOf(ownerDb, indicatorId)).uploadBatchId).toBe(second.body.id);
    expect(await batchOf(first.body.id)).toBeUndefined();
    expect(await rowsOf(first.body.id)).toEqual([]);
    await expect.poll(() => blobExists(firstBlob)).toBe(false);
    expect(await rowsOf(second.body.id)).toHaveLength(1);
  });

  const REFUSED_CSV = `${HEADER}\nE99999999,2019-04-01,2020-03-31,1,,,,,,`;

  async function batchIdsOf(versionId: string): Promise<string[]> {
    const batches = await ownerDb
      .select({ id: uploadBatch.id })
      .from(uploadBatch)
      .where(eq(uploadBatch.indicatorVersionId, versionId));
    return batches.map(({ id }) => id).sort();
  }

  it('deletes the earlier failed uploads, with their files, once an upload loads', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Upload clears failures');
    const loaded = await upload(indicatorId, VALID_CSV);
    const failed = await upload(indicatorId, REFUSED_CSV);
    const failedBlob = `${indicatorId}/${failed.body.id}.csv`;

    const latest = await upload(indicatorId, VALID_CSV);

    expect(latest.status).toBe(201);
    expect(await batchIdsOf(versionId)).toEqual([latest.body.id]);
    expect(await rowsOf(loaded.body.id)).toEqual([]);
    await expect.poll(() => blobExists(failedBlob)).toBe(false);
    await expect.poll(() => blobExists(`${indicatorId}/${loaded.body.id}.csv`)).toBe(false);
  });

  it('replaces an earlier failed upload with a newer one, keeping the loaded batch', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Upload replaces failure');
    const loaded = await upload(indicatorId, VALID_CSV);
    const first = await upload(indicatorId, REFUSED_CSV);

    const second = await upload(indicatorId, REFUSED_CSV);

    expect(second.status).toBe(422);
    expect(await batchIdsOf(versionId)).toEqual([loaded.body.id, second.body.id].sort());
    expect((await draftOf(ownerDb, indicatorId)).uploadBatchId).toBe(loaded.body.id);
    expect(await rowsOf(loaded.body.id)).toHaveLength(3);
    await expect.poll(() => blobExists(`${indicatorId}/${first.body.id}.csv`)).toBe(false);
    expect(await blobExists(`${indicatorId}/${loaded.body.id}.csv`)).toBe(true);
  });

  it("keeps the published batch through an update draft's failed and loaded uploads", async () => {
    const indicatorId = await publishedWithoutDraft(2);
    const draftResult = await createDraftFromPublished(internalDb, indicatorId, AS_ACTOR);
    if (!draftResult.ok) throw new Error('expected an update draft');
    const publishedBatchId = (await draftOf(ownerDb, indicatorId)).uploadBatchId;
    if (publishedBatchId === null) throw new Error('the update draft copied no batch');
    const publishedRows = (await rowsOf(publishedBatchId)).length;

    await upload(indicatorId, REFUSED_CSV);
    await upload(indicatorId, REFUSED_CSV);
    const loaded = await upload(indicatorId, VALID_CSV);

    expect(loaded.status).toBe(201);
    expect(await batchOf(publishedBatchId)).toMatchObject({ status: 'processed' });
    expect(await rowsOf(publishedBatchId)).toHaveLength(publishedRows);
    expect(await batchIdsOf(draftResult.versionId)).toEqual([loaded.body.id]);
  });

  it('clears the confirmation when a confirmed table is replaced', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Upload clears confirmation');
    const first = await upload(indicatorId, VALID_CSV);
    await ownerDb
      .update(indicatorVersion)
      .set({ dataTableConfirmedAt: sql`now()` })
      .where(eq(indicatorVersion.id, versionId));

    await upload(indicatorId, VALID_CSV);

    expect(first.status).toBe(201);
    expect((await draftOf(ownerDb, indicatorId)).dataTableConfirmedAt).toBeNull();
  });

  it('leaves the published rows unchanged when an update draft uploads', async () => {
    const indicatorId = await publishedWithoutDraft(0);
    const publishedRows = sql`
      SELECT id, area_id, from_date, to_date, value FROM published.observation
      WHERE indicator_id = ${indicatorId} ORDER BY id`;
    const before = await ownerDb.execute(publishedRows);
    expect(before.length).toBeGreaterThan(0);
    const draftResult = await createDraftFromPublished(internalDb, indicatorId, AS_ACTOR);
    if (!draftResult.ok) throw new Error('expected an update draft');
    const publishedBatchId = (await draftOf(ownerDb, indicatorId)).uploadBatchId;
    if (publishedBatchId === null) throw new Error('the update draft copied no batch');

    const response = await upload(indicatorId, VALID_CSV);

    expect(response.status).toBe(201);
    expect(await ownerDb.execute(publishedRows)).toEqual(before);
    expect(await batchOf(publishedBatchId)).toMatchObject({ status: 'processed' });
    expect((await draftOf(ownerDb, indicatorId)).uploadBatchId).toBe(response.body.id);
  });

  it('queues concurrent uploads to one draft, the later replacing the earlier', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Upload concurrently');

    const responses = await Promise.all([
      upload(indicatorId, VALID_CSV),
      upload(indicatorId, VALID_CSV),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    const batches = await ownerDb
      .select({ id: uploadBatch.id })
      .from(uploadBatch)
      .where(eq(uploadBatch.indicatorVersionId, versionId));
    expect(batches).toHaveLength(1);
    expect((await draftOf(ownerDb, indicatorId)).uploadBatchId).toBe(batches[0]?.id);
  });

  it('answers 404 for an indicator with no draft', async () => {
    const response = await upload(await publishedWithoutDraft(1), VALID_CSV);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });
});

describe('the audit log of uploads', () => {
  it('records a loaded batch, naming its indicator and version, under the request', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Upload on the record');

    const response = await upload(indicatorId, VALID_CSV, 'life.csv');

    const [entry, ...others] = await auditEntriesFor(ownerDb, response.body.id);
    expect(others).toEqual([]);
    expect(entry).toMatchObject({
      actorId: TEST_USER_ID,
      action: 'upload_batch.loaded',
      entityType: 'upload_batch',
      requestId: response.headers['x-fphd-request-id'],
    });
    expect(entry?.changes).toMatchObject({
      id: { before: null, after: response.body.id },
      indicatorId: { before: null, after: indicatorId },
      indicatorVersionId: { before: null, after: versionId },
      originalFilename: { before: null, after: 'life.csv' },
      byteSize: { before: null, after: Buffer.byteLength(VALID_CSV) },
      status: { before: null, after: 'processed' },
      rowCount: { before: null, after: 3 },
      columnNames: { before: null, after: HEADER.split(',') },
    });
  });

  it('records a refused batch with its problems', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Refusal on the record');

    const response = await upload(
      indicatorId,
      `${HEADER}\nE99999999,2019-04-01,2020-03-31,1,,,,,,`,
    );

    const [entry] = await auditEntriesFor(ownerDb, response.body.id);
    expect(entry).toMatchObject({ action: 'upload_batch.refused' });
    expect(entry?.changes).toMatchObject({
      indicatorId: { before: null, after: indicatorId },
      status: { before: null, after: 'failed' },
      validationResult: { before: null, after: response.body.problems },
    });
  });

  it('records each batch an upload replaces, every column before', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Replacement on the record');
    const first = await upload(indicatorId, VALID_CSV);

    const second = await upload(indicatorId, `${HEADER}\nE12000001,2021-04-01,2022-03-31,7,,,,,,`);

    const entries = await auditEntriesFor(ownerDb, first.body.id);
    expect(entries.map(({ action }) => action)).toEqual([
      'upload_batch.loaded',
      'upload_batch.deleted',
    ]);
    expect(entries[1]).toMatchObject({
      actorId: TEST_USER_ID,
      requestId: second.headers['x-fphd-request-id'],
    });
    expect(entries[1]?.changes).toMatchObject({
      id: { before: first.body.id, after: null },
      indicatorId: { before: indicatorId, after: null },
      rowCount: { before: 3, after: null },
      uploadedBy: { before: TEST_USER_ID, after: null },
    });
  });
});

describe('GET /api/internal/indicators/:id/data-uploads/latest', () => {
  it('answers the failed upload until a later upload loads', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Upload latest');
    const latest = async () =>
      (
        await request(app)
          .get(`/api/internal/indicators/${indicatorId}/data-uploads/latest`)
          .set('Cookie', await testSessionCookie(['internal', 'publisher']))
      ).body;

    expect(await latest()).toEqual({ latestUpload: null });

    const refused = await upload(indicatorId, 'area_code\nE92000001', 'short.csv');
    expect(await latest()).toEqual({
      latestUpload: {
        id: refused.body.id,
        status: 'failed',
        originalFilename: 'short.csv',
        uploadedAt: expect.any(String),
        problems: refused.body.problems,
      },
    });

    const loaded = await upload(indicatorId, VALID_CSV);
    expect(await latest()).toMatchObject({
      latestUpload: { id: loaded.body.id, status: 'processed', problems: [] },
    });
  });
});

describe('processDataUpload', () => {
  async function storedUpload(name: string) {
    const { indicatorId } = await newDraft(internalDb, name);
    const batchId = randomUuidV7();
    const blobName = `${indicatorId}/${batchId}.csv`;
    await storage.put(blobName, Readable.from([VALID_CSV]));
    const upload = {
      batchId,
      indicatorId,
      blobName,
      originalFilename: 'data.csv',
      byteSize: Buffer.byteLength(VALID_CSV),
      sha256: '0'.repeat(64),
      actor: AS_ACTOR,
    };
    return { indicatorId, batchId, blobName, upload };
  }

  it('leaves the draft free for section saves while its file loads', async () => {
    const { indicatorId, blobName, upload } = await storedUpload('Upload beside a save');
    const file = new PassThrough();
    let loading: () => void = () => {};
    const reached = new Promise<void>((resolve) => {
      loading = resolve;
    });
    const openFile = async () => {
      loading();
      return file;
    };

    const uploaded = processDataUpload(internalDb, upload, openFile, new AbortController().signal);
    await reached;
    const saved = await Promise.race([
      updateIndicatorDraft(
        internalDb,
        indicatorId,
        { definition: 'Saved meanwhile' },
        {},
        AS_ACTOR,
      ),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 2000)),
    ]);
    file.end(await text(await storage.get(blobName)));

    expect(saved).toEqual({ ok: true });
    expect(await uploaded).toMatchObject({ ok: true, rowCount: 3 });
    expect((await draftOf(ownerDb, indicatorId)).definition).toBe('Saved meanwhile');
  });

  /** Starts loading `upload`, waits until it opens its file, and answers how to finish it. */
  async function startLoading(upload: DataUpload) {
    const file = new PassThrough();
    let opened: () => void = () => {};
    const reading = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const uploaded = processDataUpload(
      internalDb,
      upload,
      async () => {
        opened();
        return file;
      },
      new AbortController().signal,
    );
    await reading;
    return {
      finish: (content: string) => {
        file.end(content);
        return uploaded;
      },
    };
  }

  async function publish(indicatorId: string) {
    await ownerDb
      .update(indicatorVersion)
      .set({ status: 'published', publishedAt: sql`now()` })
      .where(eq(indicatorVersion.indicatorId, indicatorId));
  }

  const OUTCOMES = [
    ['loads', VALID_CSV],
    ['is refused', `${HEADER}\nE99999999,2019-04-01,2020-03-31,1,,,,,,`],
  ];

  it.each(OUTCOMES)(
    'keeps nothing when the draft stops being a draft while a file that %s loads',
    async (outcome, content) => {
      const { indicatorId, batchId, upload } = await storedUpload(
        `Upload outlives draft ${outcome}`,
      );
      const loading = await startLoading(upload);
      await publish(indicatorId);

      expect(await loading.finish(content)).toMatchObject({ ok: false, reason: 'no_draft' });
      expect(await batchOf(batchId)).toBeUndefined();
      expect(await rowsOf(batchId)).toEqual([]);
    },
  );

  it.each(OUTCOMES)(
    'answers no_draft when the draft is published and another opened while a file that %s loads',
    async (outcome, content) => {
      const { indicatorId, batchId, upload } = await storedUpload(
        `Upload outlives draft, reopened, ${outcome}`,
      );
      const loading = await startLoading(upload);
      await publish(indicatorId);
      const reopened = await createDraftFromPublished(internalDb, indicatorId, AS_ACTOR);
      if (!reopened.ok) throw new Error('expected an update draft');

      expect(await loading.finish(content)).toMatchObject({ ok: false, reason: 'no_draft' });
      expect(await batchOf(batchId)).toBeUndefined();
      expect((await draftOf(ownerDb, indicatorId)).uploadBatchId).toBeNull();
    },
  );

  it('rolls back, recording nothing, when the upload is abandoned before it loads', async () => {
    const { indicatorId, batchId, blobName, upload } = await storedUpload('Upload abandoned');

    await expect(
      processDataUpload(internalDb, upload, () => storage.get(blobName), AbortSignal.abort()),
    ).rejects.toThrow();

    expect(await batchOf(batchId)).toBeUndefined();
    expect((await draftOf(ownerDb, indicatorId)).uploadBatchId).toBeNull();
    expect(await auditEntriesFor(ownerDb, batchId)).toEqual([]);
  });

  it('rolls back when the upload is abandoned as its rows are read', async () => {
    const { indicatorId, batchId, blobName, upload } = await storedUpload('Upload abandoned late');
    const abandoned = new AbortController();
    const openFile = async () => {
      const file = await storage.get(blobName);
      file.on('end', () => abandoned.abort());
      return file;
    };

    await expect(
      processDataUpload(internalDb, upload, openFile, abandoned.signal),
    ).rejects.toThrow();

    expect(await batchOf(batchId)).toBeUndefined();
    expect(await rowsOf(batchId)).toEqual([]);
    expect((await draftOf(ownerDb, indicatorId)).uploadBatchId).toBeNull();
  });
});

describe('stageRows', () => {
  const LOCK = [0x74657374, 1] as const;
  const row = {
    line: 2,
    areaId: '019fa38f-073f-764e-9ac6-1c4d03b10001',
    fromDate: '2019-04-01',
    toDate: '2020-03-31',
    value: '1',
    count: null,
    numerator: null,
    denominator: null,
    lower_ci_95: null,
    upper_ci_95: null,
    lower_ci_998: null,
    upper_ci_998: null,
    sexId: null,
    ageId: null,
    categoryId: null,
    noteTypeId: null,
  };

  async function* rows(...values: string[]): AsyncGenerator<DataTableEvent> {
    for (const value of values) yield { kind: 'row', row: { ...row, value } };
  }

  it('rejects and rolls back, freeing its locks, when the server refuses a value', async () => {
    await expect(
      internalDb.$client.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(${LOCK[0]}, ${LOCK[1]})`;
        await stageRows(tx, rows('1', '1e-400'), new AbortController().signal);
      }),
    ).rejects.toThrow('The rows could not be copied into the staging table');

    const [lock] = await ownerDb.execute<{ taken: boolean }>(
      sql`SELECT pg_try_advisory_lock(${LOCK[0]}, ${LOCK[1]}) AS taken`,
    );
    expect(lock?.taken).toBe(true);
    await ownerDb.execute(sql`SELECT pg_advisory_unlock(${LOCK[0]}, ${LOCK[1]})`);
  });

  it('rejects when the server refuses a value while rows are still being sent', async () => {
    const many = Array.from({ length: 100_000 }, () => '1');

    await expect(
      internalDb.$client.begin((tx) =>
        stageRows(tx, rows('1e-400', ...many), new AbortController().signal),
      ),
    ).rejects.toThrow();
  });
});

describe('cancellable', () => {
  it('cancels a long statement when the upload is abandoned, rolling back promptly', async () => {
    const LOCK = [0x74657374, 2] as const;
    const abandoned = new AbortController();
    const started = Date.now();
    setTimeout(() => abandoned.abort(), 200);

    await expect(
      internalDb.$client.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(${LOCK[0]}, ${LOCK[1]})`;
        await cancellable(abandoned.signal, tx`SELECT pg_sleep(30)`);
      }),
    ).rejects.toMatchObject({ code: '57014' });

    expect(Date.now() - started).toBeLessThan(5000);
    const [lock] = await ownerDb.execute<{ taken: boolean }>(
      sql`SELECT pg_try_advisory_lock(${LOCK[0]}, ${LOCK[1]}) AS taken`,
    );
    expect(lock?.taken).toBe(true);
    await ownerDb.execute(sql`SELECT pg_advisory_unlock(${LOCK[0]}, ${LOCK[1]})`);
  });

  it('runs nothing once the upload is already abandoned', async () => {
    await expect(
      internalDb.$client.begin((tx) => cancellable(AbortSignal.abort(), tx`SELECT 1`)),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
