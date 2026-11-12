import {
  indicatorSectionAnswersSchema,
  definitionAndRationaleSection as section,
} from '@fphd/internal-api-features/contract';
import { ApiConflictError } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient, fails, refused } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

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
const SECTION = `/api/internal/indicators/${id}/definition-and-rationale` as const;

function load(indicatorId: string, api: FakeApiClient) {
  const context = new RouterContextProvider();
  context.set(apiContext, api);

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
  api: FakeApiClient,
  controlNames?: ControlNamesOf<'definition' | 'rationale'>,
) {
  const context = new RouterContextProvider();
  context.set(apiContext, api);

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

/** An API that saves the section, answering with what it saved at its new version. */
function saves() {
  return createFakeApiClient({ [`PUT ${SECTION}`]: { answers, version: NEWER_VERSION } });
}

function isNotFound(error: unknown) {
  return error instanceof Response && error.status === 404;
}

describe('loadIndicatorSection', () => {
  it('fills an unanswered field with nothing', async () => {
    const api = createFakeApiClient({
      [`GET ${SECTION}`]: {
        answers: { definition: 'A definition', rationale: null },
        version: SHOWN_VERSION,
      },
    });

    await expect(load(id, api)).resolves.toEqual({
      id,
      values: { definition: 'A definition', rationale: '' },
      version: SHOWN_VERSION,
    });
  });

  it('lets the not-found page through when the indicator has no draft', async () => {
    const api = createFakeApiClient({
      [`GET ${SECTION}`]: fails(new Response('Not Found', { status: 404 })),
    });

    await expect(load(id, api)).rejects.toSatisfy(isNotFound);
  });
});

describe('a section of a draft locked for review', () => {
  const path = `https://internal.test/publish/indicators/${id}/definition-and-rationale`;

  function lockedContext(api: FakeApiClient) {
    const context = withFlashStorage(new RouterContextProvider());
    context.set(apiContext, api);
    return context;
  }

  it('sends the publisher who opens it to the overview, saying why', async () => {
    const context = lockedContext(
      createFakeApiClient({
        [`GET ${SECTION}`]: fails(new ApiConflictError(SECTION, { error: 'locked' })),
      }),
    );
    const request = new Request(path);

    const response = await flashedResponse(context, request, () =>
      loadIndicatorSection({ context, params: { id }, request } as never, section),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/dashboard/indicators/${id}`);
    expect(await flashLeftBy(response)).toBe('draft-locked');
  });

  it('sends the publisher whose save it refuses to the overview, saying why', async () => {
    const context = lockedContext(
      createFakeApiClient({ [`PUT ${SECTION}`]: refused(409, { error: 'locked' }) }),
    );
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
    const api = saves();

    const outcome = await save(id, sent, api);

    expect(api.calls).toEqual([
      { method: 'PUT', path: SECTION, body: { answers, version: SHOWN_VERSION } },
    ]);
    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).status).toBe(302);
    expect((outcome as Response).headers.get('location')).toBe(
      `/publish/indicators/${id}/task-list`,
    );
  });

  it('reads each field from the control an answer in the submission chooses', async () => {
    const api = saves();
    const body = { ...sent, which: 'second', second: 'A second rationale' };

    await save(id, body, api, (formData) =>
      formData.get('which') === 'second' ? { rationale: 'second' } : {},
    );

    expect(api.calls[0]?.body).toMatchObject({
      answers: { ...answers, rationale: 'A second rationale' },
    });
  });

  it('saves nothing while any answer is missing, keeping what was typed', async () => {
    const api = createFakeApiClient();

    const outcome = await save(id, { ...sent, definition: 'Kept', rationale: '' }, api);

    expect(outcome).toEqual({
      values: { definition: 'Kept', rationale: '' },
      fieldErrors: { rationale: 'Enter the rationale for the indicator' },
      version: SHOWN_VERSION,
    });
    expect(api.calls).toEqual([]);
  });

  it('shows what the API refused, keeping what was typed', async () => {
    const api = createFakeApiClient({
      [`PUT ${SECTION}`]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { definition: 'Refused by the API' },
      }),
    });

    const outcome = await save(id, sent, api);

    expect(outcome).toEqual({
      values: answers,
      fieldErrors: { definition: 'Refused by the API' },
      version: SHOWN_VERSION,
    });
  });

  it('keeps what was typed when the section changed since, to save against its version now', async () => {
    const api = createFakeApiClient({
      [`PUT ${SECTION}`]: refused(409, { error: 'changed', version: NEWER_VERSION }),
    });

    await expect(save(id, sent, api)).resolves.toEqual({
      values: answers,
      fieldErrors: {},
      formError: SECTION_CHANGED,
      version: NEWER_VERSION,
    });
  });

  it('sends an empty version when the form carries none, for the API to refuse', async () => {
    const api = createFakeApiClient({
      [`PUT ${SECTION}`]: refused(400, { error: 'invalid_version' }),
    });

    await expect(save(id, answers, api)).resolves.toMatchObject({ formError: FORM_NOT_SAVED });
    expect(api.calls[0]?.body).toEqual({ answers, version: '' });
  });

  it('reports a refusal that names no field as the form not saved', async () => {
    const api = createFakeApiClient({ [`PUT ${SECTION}`]: refused(400, { error: 'invalid_id' }) });

    await expect(save(id, sent, api)).resolves.toEqual({
      values: answers,
      fieldErrors: {},
      formError: FORM_NOT_SAVED,
      version: SHOWN_VERSION,
    });
  });

  // The API answers 404 when the draft went while the form was open; the client throws it.
  it('lets the not-found page through when the indicator no longer has a draft', async () => {
    const api = createFakeApiClient({
      [`PUT ${SECTION}`]: fails(new Response('Not Found', { status: 404 })),
    });

    await expect(save(id, sent, api)).rejects.toSatisfy(isNotFound);
  });
});

describe('saveIndicatorSectionValues', () => {
  function saveValues(
    values: { definition: string; rationale: string; typed: string },
    api: FakeApiClient,
  ) {
    const context = new RouterContextProvider();
    context.set(apiContext, api);

    return saveIndicatorSectionValues(context, id, section, values, {
      answersSchema: indicatorSectionAnswersSchema(section.fields),
      // Takes in what was typed as the rationale, refusing a typed "refuse".
      takeIn: (sent) =>
        sent.typed === 'refuse'
          ? { values: sent, fieldErrors: { typed: 'Refused before saving' } }
          : { values: { ...sent, typed: '' }, answers: { ...sent, rationale: sent.typed } },
      version: SHOWN_VERSION,
    });
  }

  it('saves the answers the page takes in', async () => {
    const api = saves();

    await saveValues({ definition: 'A definition', rationale: '', typed: 'Typed' }, api);

    expect(api.calls[0]?.body).toEqual({
      answers: { definition: 'A definition', rationale: 'Typed' },
      version: SHOWN_VERSION,
    });
  });

  it('re-renders the page as taken in when the answers are refused', async () => {
    const api = createFakeApiClient();

    const outcome = await saveValues({ definition: '', rationale: '', typed: 'Typed' }, api);

    expect(outcome).toEqual({
      values: { definition: '', rationale: '', typed: '' },
      fieldErrors: { definition: 'Enter the definition of the indicator' },
    });
    expect(api.calls).toEqual([]);
  });

  it('saves nothing when the page refuses what it would take in', async () => {
    const api = createFakeApiClient();
    const values = { definition: 'A definition', rationale: '', typed: 'refuse' };

    await expect(saveValues(values, api)).resolves.toEqual({
      values,
      fieldErrors: { typed: 'Refused before saving' },
    });
    expect(api.calls).toEqual([]);
  });
});
