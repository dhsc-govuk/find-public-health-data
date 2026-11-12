import { ApiConflictError } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiAnswer,
  type FakeApiClient,
  fails,
  refused,
} from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { BATCH, DATA_TABLE } from './check-data.testing.ts';
import { confirmDataTable, DATA_TABLE_CHANGED, loadDataTableCheck } from './check-loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const CHECK = `https://internal.test/publish/indicators/${ID}/data-table/check`;
const DATA_TABLE_PATH = `/api/internal/indicators/${ID}/data-table` as const;
const CONFIRMATION = `PUT /api/internal/indicators/${ID}/data-table/confirmation` as const;

/** An API that answers the data table's page `query` with `answer`. */
function answering(answer: FakeApiAnswer, query = '?page=1&rowsPerPage=10') {
  return createFakeApiClient({ [`GET ${DATA_TABLE_PATH}${query}`]: answer });
}

function contextWith(api: FakeApiClient) {
  const context = new RouterContextProvider();
  context.set(apiContext, api);
  return context;
}

function load(api: FakeApiClient, query = '', id = ID) {
  return loadDataTableCheck({
    context: contextWith(api),
    params: { id },
    request: new Request(`${CHECK}${query}`),
  } as never);
}

function confirm(api: FakeApiClient, batchId: string | null = BATCH) {
  const form = new FormData();
  if (batchId !== null) form.set('batchId', batchId);

  return confirmDataTable({
    context: contextWith(api),
    params: { id: ID },
    request: new Request(CHECK, { method: 'POST', body: form }),
  } as never);
}

function locationOf(outcome: unknown) {
  expect(outcome).toBeInstanceOf(Response);
  return (outcome as Response).headers.get('location');
}

describe('loadDataTableCheck', () => {
  it('asks for the first page of 10 rows by default, and counts the pages', async () => {
    const api = answering({ dataTable: DATA_TABLE });

    expect(await load(api)).toEqual({ id: ID, dataTable: DATA_TABLE, totalPages: 5237 });
  });

  it('asks for the page and rows per page in the address', async () => {
    const api = answering(
      { dataTable: { ...DATA_TABLE, page: 4, rowsPerPage: 50 } },
      '?page=4&rowsPerPage=50',
    );

    expect((await load(api, '?page=4&rowsPerPage=50')).totalPages).toBe(1048);
  });

  it('sends the publisher to upload a file when none has loaded', async () => {
    const api = answering({ dataTable: null });

    const outcome = await load(api).catch((thrown: unknown) => thrown);

    expect(locationOf(outcome)).toBe(`/publish/indicators/${ID}/data-table`);
  });

  it('sends a page past the last to the last page, keeping the rows per page', async () => {
    const api = answering(
      { dataTable: { ...DATA_TABLE, page: 40, rowsPerPage: 25, rowCount: 60, rows: [] } },
      '?page=40&rowsPerPage=25',
    );

    const outcome = await load(api, '?page=40&rowsPerPage=25').catch((thrown: unknown) => thrown);

    expect(locationOf(outcome)).toBe(
      `/publish/indicators/${ID}/data-table/check?page=3&rowsPerPage=25`,
    );
  });

  it('sends a page past the end of a one-page table to the first page', async () => {
    const api = answering(
      { dataTable: { ...DATA_TABLE, page: 2, rowCount: 10, rows: [] } },
      '?page=2&rowsPerPage=10',
    );

    const outcome = await load(api, '?page=2').catch((thrown: unknown) => thrown);

    expect(locationOf(outcome)).toBe(`/publish/indicators/${ID}/data-table/check`);
  });

  it.each(['?page=0', '?rowsPerPage=20', '?page=1&page=2'])(
    'is not found for %s, without asking the API',
    async (query) => {
      const api = createFakeApiClient();

      await expect(load(api, query)).rejects.toMatchObject({ status: 404 });
      expect(api.calls).toEqual([]);
    },
  );

  it('is not found for an id that is not one, without asking the API', async () => {
    const api = createFakeApiClient();

    await expect(load(api, '', 'nope')).rejects.toMatchObject({ status: 404 });
    expect(api.calls).toEqual([]);
  });
});

describe('confirmDataTable', () => {
  it('confirms the batch the page showed and returns to the task list', async () => {
    const api = createFakeApiClient({
      [CONFIRMATION]: { confirmedAt: '2026-10-12T09:30:00.000Z' },
    });

    const outcome = await confirm(api);

    expect(locationOf(outcome)).toBe(`/publish/indicators/${ID}/task-list`);
    expect(api.calls[0]?.body).toEqual({ batchId: BATCH });
  });

  it('says the table was replaced when the draft points at another batch', async () => {
    const api = createFakeApiClient({
      [CONFIRMATION]: refused(409, { error: 'data_table_changed' }),
    });

    expect(await confirm(api)).toEqual({ formError: DATA_TABLE_CHANGED });
  });

  it('says it was not saved when the API refuses the form', async () => {
    const api = createFakeApiClient({
      [CONFIRMATION]: refused(400, { error: 'validation_failed' }),
    });

    expect(await confirm(api, null)).toEqual({ formError: FORM_NOT_SAVED });
    expect(api.calls[0]?.body).toEqual({ batchId: '' });
  });
});

describe('the check page of a draft locked for review', () => {
  const toOverview = {
    status: 302,
    location: `/dashboard/indicators/${ID}`,
    flash: 'draft-locked',
  };

  function respond(
    handler: (args: never) => Promise<unknown>,
    api: FakeApiClient,
    request: Request,
  ) {
    const context = withFlashStorage(contextWith(api));
    return flashedResponse(context, request, () =>
      handler({ context, params: { id: ID }, request } as never),
    );
  }

  it('sends the publisher who opens it to the overview, saying why', async () => {
    const path = `${DATA_TABLE_PATH}?page=1&rowsPerPage=10` as const;
    const api = createFakeApiClient({
      [`GET ${path}`]: fails(new ApiConflictError(path, { error: 'locked' })),
    });

    expect(
      await redirectWithFlash(await respond(loadDataTableCheck, api, new Request(CHECK))),
    ).toEqual(toOverview);
  });

  it('sends the publisher whose confirmation it refuses to the overview, saying why', async () => {
    const api = createFakeApiClient({ [CONFIRMATION]: refused(409, { error: 'locked' }) });
    const form = new FormData();
    form.set('batchId', BATCH);
    const request = new Request(CHECK, { method: 'POST', body: form });

    expect(await redirectWithFlash(await respond(confirmDataTable, api, request))).toEqual(
      toOverview,
    );
  });
});
