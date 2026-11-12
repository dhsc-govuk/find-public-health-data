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

import { flashedResponse, flashLeftBy, withFlashStorage } from '../flash.testing.ts';
import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { SHOWN_VERSION } from '../testing.ts';
import { loadRevisionResponse, REPLY_CHANGED, saveRevisionResponse } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const url = `https://internal.test/publish/indicators/${id}/revision-response`;
const NEWER_VERSION = 'b'.repeat(64);
const REPLY = `/api/internal/indicators/${id}/revision-response` as const;

const reply = {
  kind: 'minor_revisions',
  clarificationRequest: 'Which **years**?',
  flaggedTaskCount: 1,
  revisionResponse: null,
  version: SHOWN_VERSION,
};

function contextWith(api: FakeApiClient) {
  const context = withFlashStorage(new RouterContextProvider());
  context.set(apiContext, api);
  return context;
}

/** Loads the page, the API answering the reply with `answer`. */
function load(answer: FakeApiAnswer) {
  const api = createFakeApiClient({ [`GET ${REPLY}`]: answer });
  const context = contextWith(api);
  const request = new Request(url);
  return {
    context,
    request,
    run: () => loadRevisionResponse({ context, params: { id }, request } as never),
  };
}

/** Saves the reply, the API answering with `answer`. */
function save(answer: FakeApiAnswer, body: Record<string, string>) {
  const api = createFakeApiClient({ [`PUT ${REPLY}`]: answer });
  const context = contextWith(api);
  const request = new Request(url, { method: 'POST', body: new URLSearchParams(body) });
  return {
    api,
    context,
    request,
    run: () => saveRevisionResponse({ context, params: { id }, request } as never),
  };
}

describe('loadRevisionResponse', () => {
  it('reads the reply and renders the clarification request from its Markdown', async () => {
    await expect(load(reply).run()).resolves.toEqual({
      id,
      clarificationRequest: {
        markdownHtml: '<p class="govuk-body-s">Which <strong>years</strong>?</p>',
      },
      values: { revisionResponse: '' },
      version: SHOWN_VERSION,
    });
  });

  it('shows no clarification request when the round asked for none', async () => {
    const answer = { ...reply, clarificationRequest: null, revisionResponse: 'Done' };

    await expect(load(answer).run()).resolves.toMatchObject({
      clarificationRequest: null,
      values: { revisionResponse: 'Done' },
    });
  });

  it('sends the publisher to the overview while the draft is locked, saying why', async () => {
    const { context, request, run } = load(fails(new ApiConflictError(REPLY, { error: 'locked' })));

    const response = await flashedResponse(context, request, run);

    expect(response.headers.get('Location')).toBe(`/dashboard/indicators/${id}`);
    expect(await flashLeftBy(response)).toBe('draft-locked');
  });

  it('sends the publisher to the task list when no round has sent the draft back', async () => {
    const { run } = load(fails(new ApiConflictError(REPLY, { error: 'not_allowed' })));

    const response = await run().catch((thrown: unknown) => thrown);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get('Location')).toBe(
      `/publish/indicators/${id}/task-list`,
    );
  });
});

describe('saveRevisionResponse', () => {
  it('saves the reply with the version shown, returning to the task list', async () => {
    const { api, run } = save(
      { ...reply, revisionResponse: 'Checked', version: NEWER_VERSION },
      { revisionResponse: 'Checked', version: SHOWN_VERSION },
    );

    const response = (await run()) as Response;

    expect(response.headers.get('Location')).toBe(`/publish/indicators/${id}/task-list`);
    expect(api.calls[0]?.body).toEqual({ revisionResponse: 'Checked', version: SHOWN_VERSION });
  });

  it('shows the field error the API gives, keeping what was typed', async () => {
    const message = 'Enter your response to the requested revisions';
    const refusal = refused(400, {
      error: 'validation_failed',
      fieldErrors: { revisionResponse: message },
    });

    await expect(
      save(refusal, { revisionResponse: ' ', version: SHOWN_VERSION }).run(),
    ).resolves.toEqual({
      values: { revisionResponse: ' ' },
      fieldErrors: { revisionResponse: message },
      version: SHOWN_VERSION,
    });
  });

  it('says a teammate changed the reply, taking its version so Continue replaces it', async () => {
    const refusal = refused(409, { error: 'changed', version: NEWER_VERSION });

    await expect(
      save(refusal, { revisionResponse: 'Mine', version: SHOWN_VERSION }).run(),
    ).resolves.toEqual({
      values: { revisionResponse: 'Mine' },
      fieldErrors: {},
      formError: REPLY_CHANGED,
      version: NEWER_VERSION,
    });
  });

  it('sends the publisher to the overview once the draft is locked, saying why', async () => {
    const { context, request, run } = save(refused(409, { error: 'locked' }), {
      revisionResponse: 'Late',
      version: SHOWN_VERSION,
    });

    const response = await flashedResponse(context, request, run);

    expect(response.headers.get('Location')).toBe(`/dashboard/indicators/${id}`);
    expect(await flashLeftBy(response)).toBe('draft-locked');
  });

  it('returns to the task list when no round has sent the draft back any more', async () => {
    const response = (await save(refused(409, { error: 'not_allowed' }), {
      revisionResponse: 'Late',
      version: SHOWN_VERSION,
    }).run()) as Response;

    expect(response.headers.get('Location')).toBe(`/publish/indicators/${id}/task-list`);
  });

  it('says the reply was not saved for a refusal that names no field', async () => {
    await expect(
      save(refused(400, { error: 'invalid_request' }), {
        revisionResponse: 'Mine',
        version: SHOWN_VERSION,
      }).run(),
    ).resolves.toMatchObject({
      formError: FORM_NOT_SAVED,
    });
  });
});
