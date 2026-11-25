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
  replacesPublished: false,
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
    .set('Cookie', await testSessionCookie(['publisher']));
}

async function put(app: ReturnType<typeof createTestApp>, body: object) {
  return request(app)
    .put(CONFIRMATION)
    .set('Cookie', await testSessionCookie(['publisher']))
    .send(body);
}

const FILTER = { id: 'sex.0123456789', label: 'Female', column: 'sex' as const };
const PAGE = { filters: [], matchingRowCount: 52, rows: [ROW] };

describe('GET /api/internal/indicators/:id/data-table', () => {
  it('answers the first page of 10 rows by default', async () => {
    const readPage = vi.fn(async () => PAGE);

    const response = await get(createTestApp({ readPage }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      dataTable: { ...DRAFT_TABLE, page: 1, rowsPerPage: 10, ...PAGE },
    });
    expect(readPage).toHaveBeenCalledWith(DRAFT_TABLE, { page: 1, rowsPerPage: 10, filterIds: [] });
  });

  it('reads the page, rows per page and filters asked for', async () => {
    const readPage = vi.fn(async () => ({ ...PAGE, filters: [FILTER], matchingRowCount: 1 }));

    const response = await get(
      createTestApp({ readPage }),
      `${DATA_TABLE}?page=3&rowsPerPage=25&f=sex.0123456789&f=age.abcdef0123`,
    );

    expect(readPage).toHaveBeenCalledWith(DRAFT_TABLE, {
      page: 3,
      rowsPerPage: 25,
      filterIds: ['sex.0123456789', 'age.abcdef0123'],
    });
    expect(response.body.dataTable).toMatchObject({
      filters: [FILTER],
      rowCount: 52,
      matchingRowCount: 1,
    });
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

  it('refuses an admin, who may see the indicator but not edit it', async () => {
    const response = await request(createTestApp())
      .get(DATA_TABLE)
      .set('Cookie', await testSessionCookie(['admin']));

    expect(response.status).toBe(403);
  });
});

describe('GET /api/internal/indicators/:id/data-table/values', () => {
  const VALUES = `${DATA_TABLE}/values`;
  const COLUMNS = [
    { column: 'sex' as const, values: [{ id: FILTER.id, label: FILTER.label }], more: false },
  ];

  it('answers the values of a column', async () => {
    const listValues = vi.fn(async () => COLUMNS);

    const response = await get(createTestApp({ listValues }), `${VALUES}?column=sex`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ columns: COLUMNS });
    expect(listValues).toHaveBeenCalledWith(DRAFT_TABLE, { column: 'sex', search: '' });
  });

  it('answers the values that contain a search', async () => {
    const listValues = vi.fn(async () => COLUMNS);

    await get(createTestApp({ listValues }), `${VALUES}?search=${encodeURIComponent(' <1 yr')}`);

    expect(listValues).toHaveBeenCalledWith(DRAFT_TABLE, { search: '<1 yr' });
  });

  it('answers no values before a file has loaded', async () => {
    const response = await get(
      createTestApp({ findDraftDataTable: async () => ({ found: true, dataTable: null }) }),
      `${VALUES}?column=sex`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ columns: [] });
  });

  it('answers 400 for a query the schema refuses', async () => {
    const response = await get(createTestApp(), VALUES);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_query' });
  });

  it.each([
    ['no_draft', 404],
    ['not_found', 404],
    ['locked', 409],
  ] as const)('answers %s with %i', async (reason, status) => {
    const response = await get(
      createTestApp({ findDraftDataTable: async () => ({ found: false, reason }) }),
      `${VALUES}?column=sex`,
    );

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: reason });
  });

  it('refuses an admin, who may see the indicator but not edit it', async () => {
    const response = await request(createTestApp())
      .get(`${VALUES}?column=sex`)
      .set('Cookie', await testSessionCookie(['admin']));

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
