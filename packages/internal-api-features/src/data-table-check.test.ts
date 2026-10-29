import { request } from '@fphd/express/testing';
import { createCapturingLogger } from '@fphd/logger/testing';
import { describe, expect, it, vi } from 'vitest';

import { dataTableCheckRouter } from './data-table-check.ts';
import type { DataTableRow } from './data-table-check-contract.ts';
import type { DraftDataTableRow } from './data-table-check-repository.ts';
import type { InternalDataUploadRepository } from './repositories.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  handlerLogLines,
  inTestTeam,
  testActor,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const INDICATOR = '00000000-0000-7000-8000-000000000001';
const BATCH = '00000000-0000-7000-8000-000000000003';
const DATA_TABLE = `/api/internal/indicators/${INDICATOR}/data-table`;
const CONFIRMATION = `${DATA_TABLE}/confirmation`;

const DRAFT_TABLE: DraftDataTableRow = {
  batchId: BATCH,
  columns: ['area_code', 'period_start', 'period_end', 'value'],
  rowCount: 52,
  yearType: { value: 'financial', label: 'Financial' },
};

const ROW: DataTableRow = {
  areaCode: 'E92000001',
  fromDate: '2019-04-01',
  toDate: '2020-03-31',
  dimensionKey: '',
  value: 83.8,
  count: null,
  numerator: null,
  denominator: null,
  lowerCi95: null,
  upperCi95: null,
  lowerCi998: null,
  upperCi998: null,
  sex: null,
  age: null,
  categoryType: null,
  category: null,
  valueNotes: [],
};

const EDITABLE = { id: '00000000-0000-7000-8000-000000000002', isLocked: false };
const LOCKED = { ...EDITABLE, isLocked: true };

function createTestApp(
  overrides: Partial<InternalDataUploadRepository> = {},
  logger?: ReturnType<typeof createCapturingLogger>['logger'],
) {
  const { dataUploads } = createFakeInternalRepositories({
    dataUploads: {
      findDraftDataTable: async () => ({ found: true, dataTable: DRAFT_TABLE }),
      ...overrides,
    },
  });

  return createRouterTestApp(
    dataTableCheckRouter(dataUploads, inTestTeam, testSessionVerifier),
    logger,
  );
}

async function get(app: ReturnType<typeof createTestApp>, path = DATA_TABLE) {
  return request(app)
    .get(path)
    .set('Cookie', await testSessionCookie(['internal', 'publisher']));
}

async function put(app: ReturnType<typeof createTestApp>, body: object) {
  return request(app)
    .put(CONFIRMATION)
    .set('Cookie', await testSessionCookie(['internal', 'publisher']))
    .send(body);
}

describe('GET /api/internal/indicators/:id/data-table', () => {
  it('answers the first page of 10 rows by default', async () => {
    const listRows = vi.fn(async () => [ROW]);

    const response = await get(createTestApp({ listRows }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      dataTable: { ...DRAFT_TABLE, page: 1, rowsPerPage: 10, rows: [ROW] },
    });
    expect(listRows).toHaveBeenCalledWith(DRAFT_TABLE, 1, 10);
  });

  it('reads the page and rows per page asked for', async () => {
    const listRows = vi.fn(async () => [ROW]);

    await get(createTestApp({ listRows }), `${DATA_TABLE}?page=3&rowsPerPage=25`);

    expect(listRows).toHaveBeenCalledWith(DRAFT_TABLE, 3, 25);
  });

  it('answers a page past the last with no rows, without reading the batch', async () => {
    const listRows = vi.fn(async () => [ROW]);

    const response = await get(createTestApp({ listRows }), `${DATA_TABLE}?page=3&rowsPerPage=50`);

    expect(response.body.dataTable).toMatchObject({ page: 3, rowsPerPage: 50, rows: [] });
    expect(listRows).not.toHaveBeenCalled();
  });

  it('answers 400 for a page the query schema refuses', async () => {
    const response = await get(createTestApp(), `${DATA_TABLE}?rowsPerPage=20`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_page' });
  });

  it('answers no data table before a file has loaded', async () => {
    const response = await get(
      createTestApp({ findDraftDataTable: async () => ({ found: true, dataTable: null }) }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ dataTable: null });
  });

  it.each(['no_draft', 'not_found'] as const)('answers 404 %s', async (reason) => {
    const response = await get(
      createTestApp({ findDraftDataTable: async () => ({ found: false, reason }) }),
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: reason });
  });

  it('answers 409 for a draft locked for review', async () => {
    const response = await get(
      createTestApp({ findDraftDataTable: async () => ({ found: false, reason: 'locked' }) }),
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
  });

  it('answers 400 for an id that is not one', async () => {
    const response = await get(createTestApp(), '/api/internal/indicators/nope/data-table');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('refuses a session without the publisher role', async () => {
    const response = await request(createTestApp())
      .get(DATA_TABLE)
      .set('Cookie', await testSessionCookie(['internal']));

    expect(response.status).toBe(403);
  });
});

describe('PUT /api/internal/indicators/:id/data-table/confirmation', () => {
  it('confirms the batch as the signed-in user, and logs it', async () => {
    const confirm = vi.fn(async () => ({
      ok: true as const,
      confirmedAt: new Date('2026-10-12T10:00:00.000Z'),
    }));
    const { logger, lines } = createCapturingLogger('internal-api');

    const response = await put(createTestApp({ confirm }, logger), { batchId: BATCH });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ confirmedAt: '2026-10-12T10:00:00.000Z' });
    expect(confirm).toHaveBeenCalledWith(INDICATOR, BATCH, testActor(response));
    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({
        msg: 'Data table confirmed',
        indicatorId: INDICATOR,
        uploadBatchId: BATCH,
      }),
    ]);
  });

  it('answers 409 when the draft points at another batch', async () => {
    const response = await put(
      createTestApp({
        confirm: async () => ({ ok: false, reason: 'data_table_changed' }),
      }),
      { batchId: BATCH },
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'data_table_changed' });
  });

  it.each(['no_draft', 'not_found'] as const)('answers 404 %s', async (reason) => {
    const response = await put(createTestApp({ confirm: async () => ({ ok: false, reason }) }), {
      batchId: BATCH,
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: reason });
  });

  it('answers 409 for a draft locked for review', async () => {
    const response = await put(
      createTestApp({ confirm: async () => ({ ok: false, reason: 'locked' }) }),
      { batchId: BATCH },
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
  });

  it.each([{}, { batchId: 'nope' }])('answers 400 for %j', async (body) => {
    const response = await put(createTestApp({ findDraft: async () => EDITABLE }), body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'validation_failed' });
  });

  it.each([
    ['no indicator', undefined],
    ['no draft', null],
  ])('answers 400 for a refused body when there is %s', async (_, found) => {
    const response = await put(createTestApp({ findDraft: async () => found }), {});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'validation_failed' });
  });

  it('answers 409 rather than 400 for a draft locked for review', async () => {
    const response = await put(createTestApp({ findDraft: async () => LOCKED }), {});

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
  });
});
