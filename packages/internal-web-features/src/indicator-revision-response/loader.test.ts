import { type ApiClient, ApiConflictError } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { flashedResponse, flashLeftBy, withFlashStorage } from '../flash.testing.ts';
import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { SHOWN_VERSION } from '../testing.ts';
import { loadRevisionResponse, REPLY_CHANGED, saveRevisionResponse } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const url = `https://internal.test/publish/indicators/${id}/revision-response`;
const NEWER_VERSION = 'b'.repeat(64);

const reply = {
  kind: 'minor_revisions',
  clarificationRequest: 'Which **years**?',
  flaggedTaskCount: 1,
  revisionResponse: null,
  version: SHOWN_VERSION,
};

function contextWith(api: Partial<ApiClient>) {
  const context = withFlashStorage(new RouterContextProvider());
  context.set(apiContext, api as ApiClient);
  return context;
}

function load(api: Partial<ApiClient>) {
  const context = contextWith(api);
  const request = new Request(url);
  return {
    context,
    request,
    run: () => loadRevisionResponse({ context, params: { id }, request } as never),
  };
}

function save(put: ApiClient['put'], body: Record<string, string>) {
  const context = contextWith({ put });
  const request = new Request(url, { method: 'POST', body: new URLSearchParams(body) });
  return {
    context,
    request,
    run: () => saveRevisionResponse({ context, params: { id }, request } as never),
  };
}

describe('loadRevisionResponse', () => {
  it('reads the reply and renders the clarification request from its Markdown', async () => {
    const get = vi.fn().mockResolvedValue(reply);

    await expect(load({ get }).run()).resolves.toEqual({
      id,
      clarificationRequest: {
        markdownHtml: '<p class="govuk-body">Which <strong>years</strong>?</p>',
      },
      values: { revisionResponse: '' },
      version: SHOWN_VERSION,
    });
    expect(get).toHaveBeenCalledWith(
      `/api/internal/indicators/${id}/revision-response`,
      expect.anything(),
    );
  });

  it('shows no clarification request when the round asked for none', async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ ...reply, clarificationRequest: null, revisionResponse: 'Done' });

    await expect(load({ get }).run()).resolves.toMatchObject({
      clarificationRequest: null,
      values: { revisionResponse: 'Done' },
    });
  });

  it('sends the publisher to the overview while the draft is locked, saying why', async () => {
    const { context, request, run } = load({
      get: vi.fn().mockRejectedValue(new ApiConflictError(url, { error: 'locked' })),
    });

    const response = await flashedResponse(context, request, run);

    expect(response.headers.get('Location')).toBe(`/dashboard/indicators/${id}`);
    expect(await flashLeftBy(response)).toBe('draft-locked');
  });

  it('sends the publisher to the task list when no round has sent the draft back', async () => {
    const { run } = load({
      get: vi.fn().mockRejectedValue(new ApiConflictError(url, { error: 'not_allowed' })),
    });

    const response = await run().catch((thrown: unknown) => thrown);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get('Location')).toBe(
      `/publish/indicators/${id}/task-list`,
    );
  });
});

describe('saveRevisionResponse', () => {
  it('saves the reply with the version shown, returning to the task list', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, value: reply });

    const response = (await save(put, {
      revisionResponse: 'Checked',
      version: SHOWN_VERSION,
    }).run()) as Response;

    expect(response.headers.get('Location')).toBe(`/publish/indicators/${id}/task-list`);
    expect(put).toHaveBeenCalledWith(
      `/api/internal/indicators/${id}/revision-response`,
      { revisionResponse: 'Checked', version: SHOWN_VERSION },
      expect.anything(),
      expect.anything(),
    );
  });

  it('shows the field error the API gives, keeping what was typed', async () => {
    const message = 'Enter your response to the requested revisions';
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'validation_failed', fieldErrors: { revisionResponse: message } },
    });

    await expect(
      save(put, { revisionResponse: ' ', version: SHOWN_VERSION }).run(),
    ).resolves.toEqual({
      values: { revisionResponse: ' ' },
      fieldErrors: { revisionResponse: message },
      version: SHOWN_VERSION,
    });
  });

  it('says a teammate changed the reply, taking its version so Continue replaces it', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      error: { error: 'changed', version: NEWER_VERSION },
    });

    await expect(
      save(put, { revisionResponse: 'Mine', version: SHOWN_VERSION }).run(),
    ).resolves.toEqual({
      values: { revisionResponse: 'Mine' },
      fieldErrors: {},
      formError: REPLY_CHANGED,
      version: NEWER_VERSION,
    });
  });

  it('sends the publisher to the overview once the draft is locked, saying why', async () => {
    const { context, request, run } = save(
      vi.fn().mockResolvedValue({ ok: false, status: 409, error: { error: 'locked' } }),
      { revisionResponse: 'Late', version: SHOWN_VERSION },
    );

    const response = await flashedResponse(context, request, run);

    expect(response.headers.get('Location')).toBe(`/dashboard/indicators/${id}`);
    expect(await flashLeftBy(response)).toBe('draft-locked');
  });

  it('returns to the task list when no round has sent the draft back any more', async () => {
    const put = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 409, error: { error: 'not_allowed' } });

    const response = (await save(put, {
      revisionResponse: 'Late',
      version: SHOWN_VERSION,
    }).run()) as Response;

    expect(response.headers.get('Location')).toBe(`/publish/indicators/${id}/task-list`);
  });

  it('says the reply was not saved for a refusal that names no field', async () => {
    const put = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, error: { error: 'invalid_request' } });

    await expect(
      save(put, { revisionResponse: 'Mine', version: SHOWN_VERSION }).run(),
    ).resolves.toMatchObject({
      formError: FORM_NOT_SAVED,
    });
  });
});
