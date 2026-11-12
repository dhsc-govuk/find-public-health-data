import type { IndicatorTaskKey, IndicatorTaskList } from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiAnswer,
  type FakeApiCall,
  type FakeApiClient,
  type FakeApiStubs,
  refused,
} from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { devToolsContext } from '../dev-tools.ts';
import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { indicatorTaskList, SAVED_VERSION, taskStatuses } from '../testing.ts';
import { sampleAnswerOptions } from './answers.testing.ts';
import { SAMPLE_DATA_TABLE, sampleAnswers } from './answers.ts';
import { fillInSampleAnswers } from './loader.ts';

const id = '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b';
const batchId = '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5c';
const version = 'a'.repeat(64);
const UPLOAD = `POST /api/internal/indicators/${id}/data-uploads` as const;
const CONFIRMATION = `/api/internal/indicators/${id}/data-table/confirmation` as const;

const taskList: IndicatorTaskList = indicatorTaskList({
  indicator: { ...indicatorTaskList().indicator, id },
  canSubmit: false,
  actions: ['submit'],
  tasks: { ...taskStatuses('not_started'), name: 'completed' },
});

/** How the API answers a section's save, given the answer it gives when it saves it. */
type Save = (call: FakeApiCall, saved: FakeApiAnswer) => FakeApiAnswer;

const savesEach: Save = (_call, saved) => saved;

/**
 * A section's sample answers as the API keeps and returns them, which is as they were sent,
 * except that the API keeps an unanswered age as null rather than blank.
 */
function stored(key: IndicatorTaskKey, sent: unknown): FakeApiAnswer {
  const answers = sent as Record<string, unknown>;
  return key === 'sex-and-ages'
    ? { ...answers, specificAge: null, specificAgeUnit: null }
    : answers;
}

/**
 * The API's answers to the reads, and `save`'s answer to each section's save. Every section
 * reads as its sample answers, at `version`.
 */
function api(list: IndicatorTaskList, save: Save = savesEach, stubs: FakeApiStubs = {}) {
  const samples = sampleAnswers(sampleAnswerOptions, new Date());
  const sections = samples.flatMap(({ key, answers, schema }) => {
    const path = `/api/internal/indicators/${id}/${key}` as const;
    const kept = stored(key, schema.parse(answers));
    const saved = { answers: kept, version: SAVED_VERSION };
    return [
      [`GET ${path}`, { answers: kept, version }],
      [`PUT ${path}`, (call: FakeApiCall) => save(call, saved)],
    ] as const;
  });

  return createFakeApiClient({
    [`GET /api/internal/indicators/${id}/task-list`]: list,
    'GET /api/internal/value-types-and-units': sampleAnswerOptions.valueTypesAndUnits,
    'GET /api/internal/ci-methods': sampleAnswerOptions.ciMethods,
    'GET /api/internal/data-providers': sampleAnswerOptions.dataProviders,
    'GET /api/internal/tags': sampleAnswerOptions.tags,
    ...Object.fromEntries(sections),
    ...stubs,
  });
}

/** The upload and confirmation of the sample data table, as the API accepts them. */
const tableAccepted: FakeApiStubs = {
  [UPLOAD]: { id: batchId, rowCount: 4 },
  [`PUT ${CONFIRMATION}`]: { confirmedAt: '2026-10-22T09:31:00.000Z' },
};

function saves(client: FakeApiClient): FakeApiCall[] {
  return client.calls.filter(({ method }) => method === 'PUT');
}

function uploads(client: FakeApiClient): FakeApiCall[] {
  return client.calls.filter(({ method }) => method === 'POST');
}

function fillIn(client: FakeApiClient, devTools = true, signal?: AbortSignal) {
  const context = withFlashStorage(new RouterContextProvider());
  context.set(apiContext, client);
  context.set(devToolsContext, devTools);
  const request = new Request(`https://internal.test/publish/indicators/${id}/sample-answers`, {
    method: 'POST',
    ...(signal && { signal }),
  });

  return flashedResponse(context, request, () =>
    fillInSampleAnswers({ context, params: { id }, request } as never),
  );
}

describe('fillInSampleAnswers', () => {
  it('is not found unless the app offers development tools, asking the API nothing', async () => {
    const client = createFakeApiClient();

    const response = await fillIn(client, false);

    expect(response.status).toBe(404);
    expect(client.calls).toEqual([]);
  });

  it('saves every task left to do, data table included, then returns to the task list', async () => {
    const list: IndicatorTaskList = {
      ...taskList,
      tasks: {
        ...taskList.tasks,
        polarity: 'completed',
        'data-table': 'in_progress',
      },
    };

    const client = api(list, savesEach, tableAccepted);

    const response = await fillIn(client);

    const saved = saves(client).map(({ path }) => path);
    expect(saved).toContain(`/api/internal/indicators/${id}/value-type-and-units`);
    expect(saved).toContain(`/api/internal/indicators/${id}/tagging`);
    expect(saved).not.toContain(`/api/internal/indicators/${id}/polarity`);
    expect(saves(client)[0]?.body).toMatchObject({ version });
    // Every section but the name and polarity, then the data table's confirmation.
    expect(saved).toHaveLength(20);
    expect(saved.at(-1)).toBe(CONFIRMATION);
    expect(saves(client).at(-1)?.body).toEqual({ batchId });

    const [upload] = uploads(client);
    expect(upload?.path).toBe(`/api/internal/indicators/${id}/data-uploads`);
    const { body, contentType } = (upload?.body ?? {}) as { body?: BodyInit; contentType?: string };
    const form = await new Request('https://internal.test', {
      method: 'POST',
      body,
      headers: { 'content-type': contentType },
      duplex: 'half',
    } as RequestInit).formData();
    const file = form.get('dataTable');
    expect(file instanceof File && (await file.text())).toBe(SAMPLE_DATA_TABLE);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`/publish/indicators/${id}/task-list`);
  });

  it('leaves a confirmed data table alone', async () => {
    const list: IndicatorTaskList = {
      ...taskList,
      tasks: { ...taskList.tasks, 'data-table': 'completed' },
    };
    const client = api(list);

    await fillIn(client);

    expect(uploads(client)).toEqual([]);
    expect(saves(client).map(({ path }) => path)).not.toContain(CONFIRMATION);
  });

  it('returns to the task list when a second press has uploaded a table over the sample', async () => {
    const client = api(taskList, savesEach, {
      ...tableAccepted,
      [`PUT ${CONFIRMATION}`]: refused(409, { error: 'data_table_changed' }),
    });

    const response = await fillIn(client);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`/publish/indicators/${id}/task-list`);
  });

  it('keeps a section someone saved after it was read, and fills in the rest', async () => {
    let first = true;
    const client = api(
      taskList,
      (_call, saved) => {
        if (!first) return saved;
        first = false;
        return refused(409, { error: 'changed', version });
      },
      tableAccepted,
    );

    const response = await fillIn(client);

    expect(saves(client)).toHaveLength(21);
    expect(response.headers.get('location')).toBe(`/publish/indicators/${id}/task-list`);
  });

  it('saves nothing more once the browser has gone', async () => {
    const abandoned = new AbortController();
    const client = api(taskList, (_call, saved) => {
      abandoned.abort();
      return saved;
    });

    await expect(fillIn(client, true, abandoned.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(saves(client)).toHaveLength(1);
  });

  it('leaves the table unconfirmed once the browser has gone during the upload', async () => {
    const abandoned = new AbortController();
    const client = api(taskList, savesEach, {
      ...tableAccepted,
      [UPLOAD]: () => {
        abandoned.abort();
        return { id: batchId, rowCount: 4 };
      },
    });

    await expect(fillIn(client, true, abandoned.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(saves(client).map(({ path }) => path)).not.toContain(CONFIRMATION);
  });

  it('sends the publisher to the overview, saying why, while the draft is locked', async () => {
    const client = api({ ...taskList, editable: false });

    const response = await fillIn(client);

    expect(saves(client)).toEqual([]);
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `/dashboard/indicators/${id}`,
      flash: 'draft-locked',
    });
  });

  it('stops at the overview when the draft is locked part way through', async () => {
    let first = true;
    const client = api(taskList, (_call, saved) => {
      if (!first) return refused(409, { error: 'locked' });
      first = false;
      return saved;
    });

    const response = await fillIn(client);

    expect(saves(client)).toHaveLength(2);
    expect((await redirectWithFlash(response)).location).toBe(`/dashboard/indicators/${id}`);
  });

  it('fails, naming the task, when the API refuses an answer', async () => {
    const client = api(taskList, () =>
      refused(400, {
        error: 'validation_failed',
        fieldErrors: { valueTypeId: 'Select the value type' },
      }),
    );

    await expect(fillIn(client)).rejects.toThrow(
      'The API refused the sample value-type-and-units answers',
    );
  });
});
