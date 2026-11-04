import { TEAM_IDS } from '@fphd/auth';
import { DATA_TABLE_MAX_BYTES, DATA_TABLE_MESSAGES } from '@fphd/internal-api-features/contract';
import { type ApiClient, ApiConflictError, ApiTimeoutError } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { signedInContext } from '../session.testing.ts';
import {
  DATA_TABLE_TOO_SLOW,
  exceedsFormLimit,
  loadDataTableProblems,
  loadDataTableUpload,
  uploadDataTable,
} from './loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const PROBLEMS = [{ code: 'no_rows', items: [], count: 1 }];

function contextWith(client: Partial<ApiClient>) {
  const context = new RouterContextProvider();
  context.set(apiContext, client as ApiClient);
  return context;
}

async function load<T>(
  loader: (args: never) => T,
  client: Partial<ApiClient>,
  id = ID,
  teams: readonly string[] = [TEAM_IDS.teamA],
) {
  const context = await signedInContext(['publisher'], teams);
  context.set(apiContext, client as ApiClient);
  return loader({
    context,
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/data-table`),
  } as never);
}

function upload(postStream: ApiClient['postStream'], headers: Record<string, string> = {}) {
  const request = new Request(`https://internal.test/publish/indicators/${ID}/data-table`, {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=b', ...headers },
    body: '--b--\r\n',
  });

  return uploadDataTable({
    context: contextWith({ postStream }),
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
    const get = vi.fn().mockResolvedValue({ draftStatus: 'draft', teamId: TEAM_IDS.teamA });

    expect(await load(loadDataTableUpload, { get })).toEqual({ id: ID });
    expect(get.mock.calls[0]?.[0]).toBe(`/api/internal/indicators/${ID}`);
  });

  it("is not found for another team's draft, which the publisher may not edit", async () => {
    const get = vi.fn().mockResolvedValue({ draftStatus: 'draft', teamId: TEAM_IDS.teamA });

    await expect(load(loadDataTableUpload, { get }, ID, [TEAM_IDS.teamB])).rejects.toMatchObject({
      status: 404,
    });
  });

  it('is not found for an indicator with no draft', async () => {
    const get = vi.fn().mockResolvedValue({ draftStatus: null });

    await expect(load(loadDataTableUpload, { get })).rejects.toMatchObject({ status: 404 });
  });

  it('is not found for an id that is not one, without asking the API', async () => {
    const get = vi.fn();

    await expect(load(loadDataTableUpload, { get }, 'nope')).rejects.toMatchObject({
      status: 404,
    });
    expect(get).not.toHaveBeenCalled();
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
    const postStream = vi.fn().mockResolvedValue({ ok: true, data: { id: ID, rowCount: 3 } });

    const { request } = await upload(postStream);

    const [path, body] = postStream.mock.calls[0] ?? [];
    expect(path).toBe(`/api/internal/indicators/${ID}/data-uploads`);
    expect(body).toEqual({
      body: request.body,
      contentType: 'multipart/form-data; boundary=b',
    });
    expect(request.bodyUsed).toBe(false);
  });

  it('refuses a form too big for any acceptable file without calling the API', async () => {
    const postStream = vi.fn();

    const { outcome, request } = await upload(postStream, {
      'content-length': String(DATA_TABLE_MAX_BYTES + 2_000_000),
    });

    expect(postStream).not.toHaveBeenCalled();
    expect(outcome).toEqual({ fieldErrors: { dataTable: DATA_TABLE_MESSAGES.tooLarge } });
    expect(request.bodyUsed).toBe(true);
  });

  it('passes on a form whose Content-Length is within the limit', async () => {
    const postStream = vi.fn().mockResolvedValue({ ok: true, data: { id: ID, rowCount: 3 } });

    const { request } = await upload(postStream, { 'content-length': '7' });

    expect(postStream).toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it('moves on to the check page once the file has loaded', async () => {
    const postStream = vi.fn().mockResolvedValue({ ok: true, data: { id: ID, rowCount: 3 } });

    const { outcome } = await upload(postStream);

    expect(locationOf(outcome)).toBe(`/publish/indicators/${ID}/data-table/check`);
  });

  it('shows the problems page when the file was refused', async () => {
    const postStream = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      error: { error: 'invalid_data_table', id: ID, problems: PROBLEMS },
    });

    const { outcome } = await upload(postStream);

    expect(locationOf(outcome)).toBe(`/publish/indicators/${ID}/data-table/problems`);
  });

  it('answers the field error the API gives for the file', async () => {
    const postStream = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'validation_failed', fieldErrors: { dataTable: 'Select a data table' } },
    });

    const { outcome } = await upload(postStream);

    expect(outcome).toEqual({ fieldErrors: { dataTable: 'Select a data table' } });
  });

  it('says the check took too long when the API does not answer in time', async () => {
    const postStream = vi.fn().mockRejectedValue(new ApiTimeoutError('/api/internal/uploads'));

    const { outcome } = await upload(postStream);

    expect(outcome).toEqual({ fieldErrors: {}, formError: DATA_TABLE_TOO_SLOW });
  });

  it('answers a refusal that names no field for the whole form', async () => {
    const postStream = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, error: { error: 'invalid_id' } });

    const { outcome } = await upload(postStream);

    expect(outcome).toEqual({ fieldErrors: {}, formError: FORM_NOT_SAVED });
  });
});

describe('loadDataTableProblems', () => {
  it("shows the problems of the draft's latest upload while it is a refused one", async () => {
    const get = vi.fn().mockResolvedValue({
      latestUpload: { status: 'failed', problems: PROBLEMS },
    });

    expect(await load(loadDataTableProblems, { get })).toEqual({ id: ID, problems: PROBLEMS });
    expect(get.mock.calls[0]?.[0]).toBe(`/api/internal/indicators/${ID}/data-uploads/latest`);
  });

  it.each([
    ['there is no upload', null],
    ['the latest upload loaded', { status: 'processed', problems: [] }],
  ])('sends the publisher to the upload page when %s', async (_case, latestUpload) => {
    const get = vi.fn().mockResolvedValue({ latestUpload });

    const outcome = await load(loadDataTableProblems, { get }).catch((thrown) => thrown);

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
    client: Partial<ApiClient>,
    request = new Request(path),
  ) {
    const context = withFlashStorage(await signedInContext(['publisher'], [TEAM_IDS.teamA]));
    context.set(apiContext, client as ApiClient);
    return flashedResponse(context, request, () =>
      handler({ context, params: { id: ID }, request } as never),
    );
  }

  it('sends the publisher who opens the upload page to the overview, saying why', async () => {
    const get = vi.fn().mockResolvedValue({
      id: ID,
      teamId: TEAM_IDS.teamA,
      draftStatus: 'draft',
      draftLocked: true,
    });

    expect(await redirectWithFlash(await respond(loadDataTableUpload, { get }))).toEqual(
      toOverview,
    );
  });

  it('sends the publisher whose upload it refuses to the overview, saying why', async () => {
    const postStream = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 409, error: { error: 'locked' } });
    const request = new Request(path, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=b' },
      body: '--b--\r\n',
    });

    expect(
      await redirectWithFlash(await respond(uploadDataTable, { postStream }, request)),
    ).toEqual(toOverview);
  });

  it('sends the publisher who opens the problems page to the overview, saying why', async () => {
    const get = vi.fn().mockRejectedValue(new ApiConflictError(path, { error: 'locked' }));

    expect(await redirectWithFlash(await respond(loadDataTableProblems, { get }))).toEqual(
      toOverview,
    );
  });
});
