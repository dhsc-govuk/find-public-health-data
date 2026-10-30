import { Readable } from 'node:stream';

import { type Database, schema } from '@fphd/db';
import { apiLogin, auditEntriesFor, createTestDb } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import { and, asc, eq } from 'drizzle-orm';
import { v7 as randomUuidV7 } from 'uuid';
import { afterAll, describe, expect, it } from 'vitest';

import { dataTableCheckRouter } from './data-table-check.ts';
import { confirmDataTable } from './data-table-check-repository.ts';
import { processDataUpload } from './data-upload-load-repository.ts';
import { updateIndicatorDraft } from './indicator-draft-repository.ts';
import { createDraftFromPublished } from './indicator-publish-repository.ts';
import { ACTOR, AS_ACTOR, lockWaited, newDraft } from './indicator-repository.testing.ts';
import { createInternalRepositories } from './repositories.ts';
import {
  createRouterTestApp,
  TEST_TEAM_ID,
  TEST_USER_ID,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const { currentPublishedVersion, indicatorVersion } = schema;

const testDb = await createTestDb({ template: 'seeded' });
// The routes run as internal_api, so its grants are tested too; the setup writes as the owner.
const internalDb = testDb.connectDb({ login: apiLogin('internal_api') });
const ownerDb = testDb.db;

const app = createRouterTestApp(
  dataTableCheckRouter(
    createInternalRepositories(internalDb).dataUploads,
    createInternalRepositories(internalDb).indicators,
    testSessionVerifier,
  ),
);

afterAll(async () => {
  await testDb.drop();
});

const CSV = [
  ' Area_Code ,period_start,period_end,value,lower_ci_95,sex,age,category_type,category,value_note',
  'E92000001,2019-04-01,2020-03-31,83.8,83.7,Female,<75 yrs,,,',
  'E92000001,2019-04-01,2020-03-31,83.1,83.0,Persons,All ages,,,',
  'E08000035,2019-04-01,2020-03-31,,,,,Ethnic groups [4],White,Aggregated from values for merged CCGs',
  'E92000001,2020-04-01,2021-03-31,1.5e3,,Male,,,,',
].join('\n');

/** Loads a file into the draft as an upload does, without storage: the file is read in place. */
async function load(indicatorId: string, content = CSV): Promise<string> {
  const batchId = randomUuidV7();
  const result = await processDataUpload(
    internalDb,
    {
      batchId,
      indicatorId,
      blobName: `${indicatorId}/${batchId}.csv`,
      originalFilename: 'data.csv',
      byteSize: Buffer.byteLength(content),
      sha256: '0'.repeat(64),
      actor: AS_ACTOR,
    },
    async () => Readable.from([content]),
    new AbortController().signal,
  );
  if (!result.ok) throw new Error(`the upload was refused: ${JSON.stringify(result)}`);
  return batchId;
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

/**
 * The nth seeded published indicator by id, so each test that opens a draft takes its own, moved
 * from Fingertips into the test session's team so its publisher may edit it.
 */
async function seededPublished(nth: number) {
  const [published] = await ownerDb
    .select({ indicatorId: currentPublishedVersion.indicatorId, id: currentPublishedVersion.id })
    .from(currentPublishedVersion)
    .orderBy(asc(currentPublishedVersion.indicatorId))
    .offset(nth)
    .limit(1);
  if (published === undefined) throw new Error(`the seed has no published indicator ${nth}`);
  await ownerDb
    .update(schema.indicator)
    .set({ teamId: TEST_TEAM_ID })
    .where(eq(schema.indicator.id, published.indicatorId));
  return published;
}

async function check(indicatorId: string, query = '') {
  return request(app)
    .get(`/api/internal/indicators/${indicatorId}/data-table${query}`)
    .set('Cookie', await testSessionCookie(['internal', 'publisher']));
}

async function confirm(indicatorId: string, batchId: string) {
  return request(app)
    .put(`/api/internal/indicators/${indicatorId}/data-table/confirmation`)
    .set('Cookie', await testSessionCookie(['internal', 'publisher']))
    .send({ batchId });
}

describe('GET /api/internal/indicators/:id/data-table', () => {
  it("answers a page of the draft's batch with its references named", async () => {
    const { indicatorId } = await newDraft(internalDb, 'Check reads rows');
    const batchId = await load(indicatorId);

    const response = await check(indicatorId);

    expect(response.status).toBe(200);
    expect(response.body.dataTable).toMatchObject({
      batchId,
      rowCount: 4,
      columns: [
        'area_code',
        'period_start',
        'period_end',
        'value',
        'lower_ci_95',
        'sex',
        'age',
        'category_type',
        'category',
        'value_note',
      ],
      yearType: null,
      page: 1,
      rowsPerPage: 10,
    });
    expect(response.body.dataTable.rows).toHaveLength(4);
    expect(response.body.dataTable.rows).toEqual(
      expect.arrayContaining([
        {
          areaCode: 'E92000001',
          fromDate: '2019-04-01',
          toDate: '2020-03-31',
          dimensionKey: expect.any(String),
          value: 83.8,
          count: null,
          numerator: null,
          denominator: null,
          lowerCi95: 83.7,
          upperCi95: null,
          lowerCi998: null,
          upperCi998: null,
          sex: 'Female',
          age: '<75 yrs',
          categoryType: null,
          category: null,
          valueNotes: [],
        },
        expect.objectContaining({ areaCode: 'E92000001', value: 83.1, sex: null, age: null }),
        expect.objectContaining({
          areaCode: 'E08000035',
          value: null,
          categoryType: 'Ethnic groups [4]',
          category: 'White',
          valueNotes: ['Aggregated from values for merged CCGs'],
        }),
        expect.objectContaining({ fromDate: '2020-04-01', value: 1500, sex: 'Male' }),
      ]),
    );
  });

  it('pages through the rows in a stable order, each row once', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Check pages rows');
    await load(indicatorId);

    const first = await check(indicatorId, '?rowsPerPage=10');
    const pages = await Promise.all(
      [1, 2, 3].map((page) => check(indicatorId, `?page=${page}&rowsPerPage=25`)),
    );

    expect(pages[0]?.body.dataTable.rows).toEqual(first.body.dataTable.rows);
    expect(pages[1]?.body.dataTable.rows).toEqual([]);
    expect(pages[2]?.body.dataTable).toMatchObject({ page: 3, rowsPerPage: 25, rows: [] });
  });

  it('splits the rows across pages, read from either end, without repeating or losing one', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Check splits pages');
    const rows = Array.from(
      { length: 41 },
      (_, index) => `E92000001,${1950 + index}-01-01,${1950 + index}-12-31,${index}`,
    );
    await load(indicatorId, ['area_code,period_start,period_end,value', ...rows].join('\n'));

    const pages = await Promise.all(
      [1, 2, 3, 4, 5].map((page) => check(indicatorId, `?page=${page}&rowsPerPage=10`)),
    );
    const values = pages.flatMap((page) =>
      page.body.dataTable.rows.map((row: { value: number }) => row.value),
    );

    expect(pages.map((page) => page.body.dataTable.rows.length)).toEqual([10, 10, 10, 10, 1]);
    expect(values).toEqual(Array.from({ length: 41 }, (_, index) => index));
  });

  it("answers the draft's year type for labelling its periods", async () => {
    const { indicatorId } = await newDraft(internalDb, 'Check year type');
    await load(indicatorId);
    await updateIndicatorDraft(
      internalDb,
      indicatorId,
      { periodType: 'years', yearType: 'specified-end-date', yearEndDay: 31, yearEndMonth: 7 },
      {},
      AS_ACTOR,
    );

    const response = await check(indicatorId);

    expect(response.body.dataTable.yearType).toEqual({
      value: 'specified-end-date',
      label: 'August to July',
    });
  });

  it('answers no data table before a file has loaded', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Check nothing loaded');

    const response = await check(indicatorId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ dataTable: null });
  });

  it('answers 404 for an indicator with no draft', async () => {
    const { indicatorId } = await seededPublished(0);

    const response = await check(indicatorId);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });
});

describe('PUT /api/internal/indicators/:id/data-table/confirmation', () => {
  it('confirms the batch the draft points at', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Confirm the batch');
    const batchId = await load(indicatorId);

    const response = await confirm(indicatorId, batchId);

    expect(response.status).toBe(200);
    const draft = await draftOf(ownerDb, indicatorId);
    expect(draft.dataTableConfirmedAt?.toISOString()).toBe(response.body.confirmedAt);
    expect(draft.updatedBy).toBe(TEST_USER_ID);
  });

  it('records the confirmation under the request that made it', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Confirm on the record');
    const batchId = await load(indicatorId);

    const response = await confirm(indicatorId, batchId);

    expect((await auditEntriesFor(ownerDb, indicatorId)).at(-1)).toEqual({
      actorId: TEST_USER_ID,
      action: 'indicator.data_table_confirmed',
      entityType: 'indicator',
      requestId: response.headers['x-fphd-request-id'],
      changes: { dataTableConfirmedAt: { before: null, after: response.body.confirmedAt } },
    });
  });

  it('refuses a batch another upload has replaced, confirming neither', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Confirm a replaced batch');
    const shown = await load(indicatorId);
    const replacement = await load(indicatorId);

    const response = await confirm(indicatorId, shown);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'data_table_changed' });
    const draft = await draftOf(ownerDb, indicatorId);
    expect(draft).toMatchObject({ uploadBatchId: replacement, dataTableConfirmedAt: null });
    expect((await auditEntriesFor(ownerDb, indicatorId)).map(({ action }) => action)).not.toContain(
      'indicator.data_table_confirmed',
    );
  });

  it('refuses once the draft is published', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Confirm after publication');
    const batchId = await load(indicatorId);
    await ownerDb
      .update(indicatorVersion)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(indicatorVersion.id, versionId));

    const response = await confirm(indicatorId, batchId);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
    const [version] = await ownerDb
      .select()
      .from(indicatorVersion)
      .where(eq(indicatorVersion.id, versionId));
    expect(version?.dataTableConfirmedAt).toBeNull();
  });

  it("confirms an update draft's copy of the published batch on the draft alone", async () => {
    const published = await seededPublished(1);
    await ownerDb
      .update(indicatorVersion)
      .set({ dataTableConfirmedAt: null })
      .where(eq(indicatorVersion.id, published.id));
    await createDraftFromPublished(internalDb, published.indicatorId, AS_ACTOR);
    const draft = await draftOf(ownerDb, published.indicatorId);

    const response = await confirm(published.indicatorId, draft.uploadBatchId ?? '');

    expect(response.status).toBe(200);
    const [publishedAfter] = await ownerDb
      .select()
      .from(indicatorVersion)
      .where(eq(indicatorVersion.id, published.id));
    expect(publishedAfter?.dataTableConfirmedAt).toBeNull();
  });

  it('refuses a batch that is not a uuid', async () => {
    const { indicatorId } = await newDraft(internalDb, 'Confirm a bad id');

    const response = await confirm(indicatorId, 'not-a-batch');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'validation_failed' });
  });
});

describe('confirmDataTable', () => {
  it('refuses when an upload repoints the draft while the confirmation waits on it', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Confirm during upload');
    const shown = await load(indicatorId);
    const replacement = randomUuidV7();

    // The end of an upload adds its batch and points the draft at it. The confirmation waits
    // for that to commit, then sees the new batch.
    const confirmed = await ownerDb.$client.begin(async (tx) => {
      await tx`
        INSERT INTO upload_batch
          (id, indicator_id, indicator_version_id, original_filename, uploaded_by, status)
        VALUES (${replacement}, ${indicatorId}, ${versionId}, 'data.csv', ${ACTOR}, 'processed')`;
      await tx`UPDATE indicator_version SET upload_batch_id = ${replacement} WHERE id = ${versionId}`;
      const waiting = confirmDataTable(internalDb, indicatorId, shown, AS_ACTOR);
      await lockWaited(ownerDb);
      return { waiting };
    });

    expect(await confirmed.waiting).toEqual({ ok: false, reason: 'data_table_changed' });
    expect(await draftOf(ownerDb, indicatorId)).toMatchObject({
      uploadBatchId: replacement,
      dataTableConfirmedAt: null,
    });
  });

  it('confirms once a section save holding the draft commits', async () => {
    const { indicatorId, versionId } = await newDraft(internalDb, 'Confirm beside a save');
    const shown = await load(indicatorId);

    const confirmed = await ownerDb.$client.begin(async (tx) => {
      await tx`UPDATE indicator_version SET definition = 'Saved meanwhile' WHERE id = ${versionId}`;
      const waiting = confirmDataTable(internalDb, indicatorId, shown, AS_ACTOR);
      await lockWaited(ownerDb);
      return { waiting };
    });

    expect(await confirmed.waiting).toMatchObject({ ok: true });
    expect((await draftOf(ownerDb, indicatorId)).definition).toBe('Saved meanwhile');
  });
});
