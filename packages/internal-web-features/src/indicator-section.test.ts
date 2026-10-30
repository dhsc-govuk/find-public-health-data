import { definitionAndRationaleSection as section } from '@fphd/internal-api-features/contract';
import { type ApiClient, ApiConflictError } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { flashedResponse, flashLeftBy, withFlashStorage } from './flash.testing.ts';
import { FORM_NOT_SAVED } from './form-refusal.ts';
import {
  type ControlNamesOf,
  loadIndicatorSection,
  SECTION_CHANGED,
  saveIndicatorSection,
  saveIndicatorSectionValues,
} from './indicator-section.ts';
import { SHOWN_VERSION } from './testing.ts';

// What every section's loader and action share, shown through the first section built on them.

const id = '00000000-0000-7000-8000-000000000001';
const answers = { definition: 'A definition', rationale: 'A rationale' };
const sent = { ...answers, version: SHOWN_VERSION };
const NEWER_VERSION = 'b'.repeat(64);

function load(indicatorId: string, get: ApiClient['get']) {
  const context = new RouterContextProvider();
  context.set(apiContext, { get } as unknown as ApiClient);

  return loadIndicatorSection(
    {
      context,
      params: { id: indicatorId },
      request: new Request(`https://internal.test/publish/indicators/${indicatorId}/section`),
    } as never,
    section,
  );
}

function save(
  indicatorId: string,
  body: Record<string, string>,
  put: ApiClient['put'],
  controlNames?: ControlNamesOf<'definition' | 'rationale'>,
) {
  const context = new RouterContextProvider();
  context.set(apiContext, { put } as unknown as ApiClient);

  return saveIndicatorSection(
    {
      context,
      params: { id: indicatorId },
      request: new Request(`https://internal.test/publish/indicators/${indicatorId}/section`, {
        method: 'POST',
        body: new URLSearchParams(body),
      }),
    } as never,
    section,
    controlNames,
  );
}

function isNotFound(error: unknown) {
  return error instanceof Response && error.status === 404;
}

describe('loadIndicatorSection', () => {
  it('fills an unanswered field with nothing', async () => {
    const get = vi.fn().mockResolvedValue({
      answers: { definition: 'A definition', rationale: null },
      version: SHOWN_VERSION,
    });

    await expect(load(id, get)).resolves.toEqual({
      id,
      values: { definition: 'A definition', rationale: '' },
      version: SHOWN_VERSION,
    });
  });

  it('lets the not-found page through when the indicator has no draft', async () => {
    const get = vi.fn().mockRejectedValue(new Response('Not Found', { status: 404 }));

    await expect(load(id, get)).rejects.toSatisfy(isNotFound);
  });
});

describe('a section of a draft locked for review', () => {
  const path = `https://internal.test/publish/indicators/${id}/definition-and-rationale`;

  function lockedContext(api: Partial<ApiClient>) {
    const context = withFlashStorage(new RouterContextProvider());
    context.set(apiContext, api as ApiClient);
    return context;
  }

  it('sends the publisher who opens it to the overview, saying why', async () => {
    const context = lockedContext({
      get: vi.fn().mockRejectedValue(new ApiConflictError(path, { error: 'locked' })),
    });
    const request = new Request(path);

    const response = await flashedResponse(context, request, () =>
      loadIndicatorSection({ context, params: { id }, request } as never, section),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/dashboard/indicators/${id}`);
    expect(await flashLeftBy(response)).toBe('draft-locked');
  });

  it('sends the publisher whose save it refuses to the overview, saying why', async () => {
    const context = lockedContext({
      put: vi.fn().mockResolvedValue({ ok: false, status: 409, error: { error: 'locked' } }),
    });
    const request = new Request(path, { method: 'POST', body: new URLSearchParams(sent) });

    const response = await flashedResponse(context, request, () =>
      saveIndicatorSection({ context, params: { id }, request } as never, section),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/dashboard/indicators/${id}`);
    expect(await flashLeftBy(response)).toBe('draft-locked');
  });
});

describe('saveIndicatorSection', () => {
  it('sends every answer and returns to the task list', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: { answers, version: NEWER_VERSION } });

    const outcome = await save(id, sent, put);

    expect(put.mock.calls[0]?.[1]).toEqual({ answers, version: SHOWN_VERSION });
    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).status).toBe(302);
    expect((outcome as Response).headers.get('location')).toBe(
      `/publish/indicators/${id}/task-list`,
    );
  });

  it('reads each field from the control an answer in the submission chooses', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: { answers, version: NEWER_VERSION } });
    const body = { ...sent, which: 'second', second: 'A second rationale' };

    await save(id, body, put, (formData) =>
      formData.get('which') === 'second' ? { rationale: 'second' } : {},
    );

    expect(put.mock.calls[0]?.[1]).toMatchObject({
      answers: { ...answers, rationale: 'A second rationale' },
    });
  });

  it('saves nothing while any answer is missing, keeping what was typed', async () => {
    const put = vi.fn();

    const outcome = await save(id, { ...sent, definition: 'Kept', rationale: '' }, put);

    expect(outcome).toEqual({
      values: { definition: 'Kept', rationale: '' },
      fieldErrors: { rationale: 'Enter the rationale for the indicator' },
      version: SHOWN_VERSION,
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('shows what the API refused, keeping what was typed', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'validation_failed', fieldErrors: { definition: 'Refused by the API' } },
    });

    const outcome = await save(id, sent, put);

    expect(outcome).toEqual({
      values: answers,
      fieldErrors: { definition: 'Refused by the API' },
      version: SHOWN_VERSION,
    });
  });

  it('keeps what was typed when the section changed since, to save against its version now', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      error: { error: 'changed', version: NEWER_VERSION },
    });

    await expect(save(id, sent, put)).resolves.toEqual({
      values: answers,
      fieldErrors: {},
      formError: SECTION_CHANGED,
      version: NEWER_VERSION,
    });
  });

  it('sends an empty version when the form carries none, for the API to refuse', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'invalid_version' },
    });

    await expect(save(id, answers, put)).resolves.toMatchObject({ formError: FORM_NOT_SAVED });
    expect(put.mock.calls[0]?.[1]).toEqual({ answers, version: '' });
  });

  it('reports a refusal that names no field as the form not saved', async () => {
    const put = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, error: { error: 'invalid_id' } });

    await expect(save(id, sent, put)).resolves.toEqual({
      values: answers,
      fieldErrors: {},
      formError: FORM_NOT_SAVED,
      version: SHOWN_VERSION,
    });
  });

  // The API answers 404 when the draft went while the form was open; the client throws it.
  it('lets the not-found page through when the indicator no longer has a draft', async () => {
    const put = vi.fn().mockRejectedValue(new Response('Not Found', { status: 404 }));

    await expect(save(id, sent, put)).rejects.toSatisfy(isNotFound);
  });
});

describe('saveIndicatorSectionValues', () => {
  function saveValues(
    values: { definition: string; rationale: string; typed: string },
    put: ApiClient['put'],
  ) {
    const context = new RouterContextProvider();
    context.set(apiContext, { put } as unknown as ApiClient);

    return saveIndicatorSectionValues(context, id, section, values, {
      answersSchema: {} as never,
      // Takes in what was typed as the rationale, refusing a typed "refuse".
      takeIn: (sent) =>
        sent.typed === 'refuse'
          ? { values: sent, fieldErrors: { typed: 'Refused before saving' } }
          : { values: { ...sent, typed: '' }, answers: { ...sent, rationale: sent.typed } },
      version: SHOWN_VERSION,
    });
  }

  it('saves the answers the page takes in', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: answers });

    await saveValues({ definition: 'A definition', rationale: '', typed: 'Typed' }, put);

    expect(put.mock.calls[0]?.[1]).toEqual({
      answers: { definition: 'A definition', rationale: 'Typed' },
      version: SHOWN_VERSION,
    });
  });

  it('re-renders the page as taken in when the answers are refused', async () => {
    const put = vi.fn();

    const outcome = await saveValues({ definition: '', rationale: '', typed: 'Typed' }, put);

    expect(outcome).toEqual({
      values: { definition: '', rationale: '', typed: '' },
      fieldErrors: { definition: 'Enter the definition of the indicator' },
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('saves nothing when the page refuses what it would take in', async () => {
    const put = vi.fn();
    const values = { definition: 'A definition', rationale: '', typed: 'refuse' };

    await expect(saveValues(values, put)).resolves.toEqual({
      values,
      fieldErrors: { typed: 'Refused before saving' },
    });
    expect(put).not.toHaveBeenCalled();
  });
});
