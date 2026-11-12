import { TEAM_IDS } from '@fphd/auth';
import { DATA_TABLE_MAX_BYTES, DATA_TABLE_MESSAGES } from '@fphd/internal-api-features/contract';
import { ApiConflictError, ApiTimeoutError } from '@fphd/web-server/api-client';
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
import { signedInContext } from '../session.testing.ts';
import { indicatorDetail } from '../testing.ts';
import {
  DATA_TABLE_TOO_SLOW,
  exceedsFormLimit,
  loadDataTableProblems,
  loadDataTableUpload,
  uploadDataTable,
} from './loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const PROBLEMS = [{ code: 'no_rows', items: [], count: 1 }];
const DETAIL = `GET /api/internal/indicators/${ID}` as const;
const UPLOAD = `POST /api/internal/indicators/${ID}/data-uploads` as const;
const LATEST = `/api/internal/indicators/${ID}/data-uploads/latest` as const;
const CREATED = { [UPLOAD]: { id: ID, rowCount: 3 } };

/** The draft's latest upload, as the API answers for one with `status` and `problems`. */
function latestUpload(status: 'processed' | 'failed', problems: FakeApiAnswer[]) {
  return {
    id: ID,
    status,
    originalFilename: 'data-table.csv',
    uploadedAt: '2026-10-12T09:30:00.000Z',
    problems,
  };
}

function contextWith(api: FakeApiClient) {
  const context = new RouterContextProvider();
  context.set(apiContext, api);
  return context;
}

async function load<T>(
  loader: (args: never) => T,
  api: FakeApiClient,
  id = ID,
  teams: readonly string[] = [TEAM_IDS.teamA],
) {
  const context = await signedInContext(['publisher'], teams);
  context.set(apiContext, api);
  return loader({
    context,
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/data-table`),
  } as never);
}

function upload(api: FakeApiClient, headers: Record<string, string> = {}) {
  const request = new Request(`https://internal.test/publish/indicators/${ID}/data-table`, {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=b', ...headers },
    body: '--b--\r\n',
  });

  return uploadDataTable({
    context: contextWith(api),
    params: { id: ID },
    request,
  } as never).then((outcome) => ({ outcome, request }));
}

function locationOf(outcome: unknown) {
  expect(outcome).toBeInstanceOf(Response);
  return (outcome as Response).headers.get('location');
}

describe('loadDataTableUpload', () => {
  it('opens for a draft', async () => {
    const api = createFakeApiClient({ [DETAIL]: indicatorDetail({ id: ID }) });

    expect(await load(loadDataTableUpload, api)).toEqual({ id: ID });
  });

  it("is not found for another team's draft, which the publisher may not edit", async () => {
    const api = createFakeApiClient({ [DETAIL]: indicatorDetail({ id: ID }) });

    await expect(load(loadDataTableUpload, api, ID, [TEAM_IDS.teamB])).rejects.toMatchObject({
      status: 404,
    });
  });

  it('is not found for an indicator with no draft', async () => {
    const api = createFakeApiClient({
      [DETAIL]: indicatorDetail({
        id: ID,
        indicatorStatus: 'live',
        publishedSlug: 'life-expectancy-at-birth',
        draftStatus: null,
      }),
    });

    await expect(load(loadDataTableUpload, api)).rejects.toMatchObject({ status: 404 });
  });

  it('is not found for an id that is not one, without asking the API', async () => {
    const api = createFakeApiClient();

    await expect(load(loadDataTableUpload, api, 'nope')).rejects.toMatchObject({
      status: 404,
    });
    expect(api.calls).toEqual([]);
  });
});

describe('exceedsFormLimit', () => {
  it.each([
    ['no Content-Length', null, false],
    ['a form just over the file cap', String(DATA_TABLE_MAX_BYTES + 1), false],
    ['a form a megabyte over the file cap', String(DATA_TABLE_MAX_BYTES + 1_000_000), false],
    ['a form more than a megabyte over it', String(DATA_TABLE_MAX_BYTES + 1_000_001), true],
    ['a Content-Length that is not a number', 'lots', false],
    ['a negative Content-Length', '-1', false],
  ])('answers %s with %s', (_case, contentLength, exceeds) => {
    expect(exceedsFormLimit(contentLength)).toBe(exceeds);
  });
});

describe('uploadDataTable', () => {
  it('passes the form on unread, with its content type', async () => {
    const api = createFakeApiClient(CREATED);

    const { request } = await upload(api);

    expect(api.calls[0]?.body).toEqual({
      body: request.body,
      contentType: 'multipart/form-data; boundary=b',
    });
    expect(request.bodyUsed).toBe(false);
  });

  it('refuses a form too big for any acceptable file without calling the API', async () => {
    const api = createFakeApiClient();

    const { outcome, request } = await upload(api, {
      'content-length': String(DATA_TABLE_MAX_BYTES + 2_000_000),
    });

    expect(api.calls).toEqual([]);
    expect(outcome).toEqual({ fieldErrors: { dataTable: DATA_TABLE_MESSAGES.tooLarge } });
    expect(request.bodyUsed).toBe(true);
  });

  it('passes on a form whose Content-Length is within the limit', async () => {
    const api = createFakeApiClient(CREATED);

    const { request } = await upload(api, { 'content-length': '7' });

    expect(api.calls).toHaveLength(1);
    expect(request.bodyUsed).toBe(false);
  });

  it('moves on to the check page once the file has loaded', async () => {
    const { outcome } = await upload(createFakeApiClient(CREATED));

    expect(locationOf(outcome)).toBe(`/publish/indicators/${ID}/data-table/check`);
  });

  it('shows the problems page when the file was refused', async () => {
    const api = createFakeApiClient({
      [UPLOAD]: refused(422, { error: 'invalid_data_table', id: ID, problems: PROBLEMS }),
    });

    const { outcome } = await upload(api);

    expect(locationOf(outcome)).toBe(`/publish/indicators/${ID}/data-table/problems`);
  });

  it('answers the field error the API gives for the file', async () => {
    const api = createFakeApiClient({
      [UPLOAD]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { dataTable: 'Select a data table' },
      }),
    });

    const { outcome } = await upload(api);

    expect(outcome).toEqual({ fieldErrors: { dataTable: 'Select a data table' } });
  });

  it('says the check took too long when the API does not answer in time', async () => {
    const api = createFakeApiClient({
      [UPLOAD]: fails(new ApiTimeoutError(`/api/internal/indicators/${ID}/data-uploads`)),
    });

    const { outcome } = await upload(api);

    expect(outcome).toEqual({ fieldErrors: {}, formError: DATA_TABLE_TOO_SLOW });
  });

  it('answers a refusal that names no field for the whole form', async () => {
    const api = createFakeApiClient({ [UPLOAD]: refused(400, { error: 'invalid_id' }) });

    const { outcome } = await upload(api);

    expect(outcome).toEqual({ fieldErrors: {}, formError: FORM_NOT_SAVED });
  });
});

describe('loadDataTableProblems', () => {
  it("shows the problems of the draft's latest upload while it is a refused one", async () => {
    const api = createFakeApiClient({
      [`GET ${LATEST}`]: { latestUpload: latestUpload('failed', PROBLEMS) },
    });

    expect(await load(loadDataTableProblems, api)).toEqual({ id: ID, problems: PROBLEMS });
  });

  it.each([
    ['there is no upload', null],
    ['the latest upload loaded', latestUpload('processed', [])],
  ])('sends the publisher to the upload page when %s', async (_case, latest) => {
    const api = createFakeApiClient({ [`GET ${LATEST}`]: { latestUpload: latest } });

    const outcome = await load(loadDataTableProblems, api).catch((thrown) => thrown);

    expect(locationOf(outcome)).toBe(`/publish/indicators/${ID}/data-table`);
  });
});

describe('the data table pages of a draft locked for review', () => {
  const path = `https://internal.test/publish/indicators/${ID}/data-table`;
  const toOverview = {
    status: 302,
    location: `/dashboard/indicators/${ID}`,
    flash: 'draft-locked',
  };

  async function respond(
    handler: (args: never) => Promise<unknown>,
    api: FakeApiClient,
    request = new Request(path),
  ) {
    const context = withFlashStorage(await signedInContext(['publisher'], [TEAM_IDS.teamA]));
    context.set(apiContext, api);
    return flashedResponse(context, request, () =>
      handler({ context, params: { id: ID }, request } as never),
    );
  }

  it('sends the publisher who opens the upload page to the overview, saying why', async () => {
    const api = createFakeApiClient({ [DETAIL]: indicatorDetail({ id: ID, draftLocked: true }) });

    expect(await redirectWithFlash(await respond(loadDataTableUpload, api))).toEqual(toOverview);
  });

  it('sends the publisher whose upload it refuses to the overview, saying why', async () => {
    const api = createFakeApiClient({ [UPLOAD]: refused(409, { error: 'locked' }) });
    const request = new Request(path, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=b' },
      body: '--b--\r\n',
    });

    expect(await redirectWithFlash(await respond(uploadDataTable, api, request))).toEqual(
      toOverview,
    );
  });

  it('sends the publisher who opens the problems page to the overview, saying why', async () => {
    const api = createFakeApiClient({
      [`GET ${LATEST}`]: fails(new ApiConflictError(LATEST, { error: 'locked' })),
    });

    expect(await redirectWithFlash(await respond(loadDataTableProblems, api))).toEqual(toOverview);
  });
});
