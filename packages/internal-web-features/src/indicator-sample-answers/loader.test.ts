import type { IndicatorTaskList } from '@fphd/internal-api-features/contract';
import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { devToolsContext } from '../dev-tools.ts';
import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { taskStatuses } from '../testing.ts';
import { sampleAnswerOptions } from './answers.testing.ts';
import { SAMPLE_DATA_TABLE } from './answers.ts';
import { fillInSampleAnswers } from './loader.ts';

const id = '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b';
const batchId = '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5c';
const version = 'a'.repeat(64);

const taskList: IndicatorTaskList = {
  indicator: {
    id,
    shortId: 90366,
    name: 'Life expectancy at birth',
    indicatorStatus: 'new',
    draftStatus: 'draft',
    draftSubmissionStatus: null,
  },
  isUpdate: false,
  canSubmit: false,
  draftUpdatedAt: '2026-10-22T09:30:00.123Z',
  editable: true,
  actions: ['submit'],
  tasks: { ...taskStatuses('not_started'), name: 'completed' },
};

/** The API's answers to the reads, by path. Every section is unanswered, at `version`. */
function reads(list: IndicatorTaskList) {
  const answers: Record<string, unknown> = {
    [`/api/internal/indicators/${id}/task-list`]: list,
    '/api/internal/value-types-and-units': sampleAnswerOptions.valueTypesAndUnits,
    '/api/internal/ci-methods': sampleAnswerOptions.ciMethods,
    '/api/internal/data-providers': sampleAnswerOptions.dataProviders,
    '/api/internal/tags': sampleAnswerOptions.tags,
  };

  return vi.fn(
    async (path: string) => answers[path] ?? { answers: {}, version },
  ) as unknown as ApiClient['get'];
}

function fillIn(api: Partial<ApiClient>, devTools = true, signal?: AbortSignal) {
  const context = withFlashStorage(new RouterContextProvider());
  context.set(apiContext, api as ApiClient);
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
    const get = vi.fn();

    const response = await fillIn({ get }, false);

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it('saves every task left to do, data table included, then returns to the task list', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const postStream = vi.fn().mockResolvedValue({ ok: true, data: { id: batchId } });
    const list: IndicatorTaskList = {
      ...taskList,
      tasks: {
        ...taskList.tasks,
        polarity: 'completed',
        'data-table': 'in_progress',
      },
    };

    const response = await fillIn({ get: reads(list), put, postStream });

    const saved = put.mock.calls.map(([path]) => path);
    expect(saved).toContain(`/api/internal/indicators/${id}/value-type-and-units`);
    expect(saved).toContain(`/api/internal/indicators/${id}/tagging`);
    expect(saved).not.toContain(`/api/internal/indicators/${id}/polarity`);
    expect(put.mock.calls[0]?.[1]).toMatchObject({ version });
    // Every section but the name and polarity, then the data table's confirmation.
    expect(saved).toHaveLength(20);
    expect(saved.at(-1)).toBe(`/api/internal/indicators/${id}/data-table/confirmation`);
    expect(put.mock.calls.at(-1)?.[1]).toEqual({ batchId });

    const [path, { body, contentType }] = postStream.mock.calls[0] ?? [];
    expect(path).toBe(`/api/internal/indicators/${id}/data-uploads`);
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
    const put = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const postStream = vi.fn();
    const list: IndicatorTaskList = {
      ...taskList,
      tasks: { ...taskList.tasks, 'data-table': 'completed' },
    };

    await fillIn({ get: reads(list), put, postStream });

    expect(postStream).not.toHaveBeenCalled();
    expect(put.mock.calls.map(([path]) => path)).not.toContain(
      `/api/internal/indicators/${id}/data-table/confirmation`,
    );
  });

  it('returns to the task list when a second press has uploaded a table over the sample', async () => {
    const put = vi
      .fn()
      .mockImplementation(async (path: string) =>
        path.endsWith('/data-table/confirmation')
          ? { ok: false, status: 409, error: { error: 'data_table_changed' } }
          : { ok: true, data: {} },
      );
    const postStream = vi.fn().mockResolvedValue({ ok: true, data: { id: batchId } });

    const response = await fillIn({ get: reads(taskList), put, postStream });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`/publish/indicators/${id}/task-list`);
  });

  it('keeps a section someone saved after it was read, and fills in the rest', async () => {
    const put = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, error: { error: 'changed', version } })
      .mockResolvedValue({ ok: true, data: {} });
    const postStream = vi.fn().mockResolvedValue({ ok: true, data: { id: batchId } });

    const response = await fillIn({ get: reads(taskList), put, postStream });

    expect(put).toHaveBeenCalledTimes(21);
    expect(response.headers.get('location')).toBe(`/publish/indicators/${id}/task-list`);
  });

  it('saves nothing more once the browser has gone', async () => {
    const abandoned = new AbortController();
    const put = vi.fn().mockImplementation(async () => {
      abandoned.abort();
      return { ok: true, data: {} };
    });

    await expect(
      fillIn({ get: reads(taskList), put }, true, abandoned.signal),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('leaves the table unconfirmed once the browser has gone during the upload', async () => {
    const abandoned = new AbortController();
    const put = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const postStream = vi.fn().mockImplementation(async () => {
      abandoned.abort();
      return { ok: true, data: { id: batchId } };
    });

    await expect(
      fillIn({ get: reads(taskList), put, postStream }, true, abandoned.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(put.mock.calls.map(([path]) => path)).not.toContain(
      `/api/internal/indicators/${id}/data-table/confirmation`,
    );
  });

  it('sends the publisher to the overview, saying why, while the draft is locked', async () => {
    const put = vi.fn();

    const response = await fillIn({ get: reads({ ...taskList, editable: false }), put });

    expect(put).not.toHaveBeenCalled();
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `/dashboard/indicators/${id}`,
      flash: 'draft-locked',
    });
  });

  it('stops at the overview when the draft is locked part way through', async () => {
    const put = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: {} })
      .mockResolvedValue({ ok: false, status: 409, error: { error: 'locked' } });

    const response = await fillIn({ get: reads(taskList), put, postStream: vi.fn() });

    expect(put).toHaveBeenCalledTimes(2);
    expect((await redirectWithFlash(response)).location).toBe(`/dashboard/indicators/${id}`);
  });

  it('fails, naming the task, when the API refuses an answer', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'validation_failed', fieldErrors: { valueTypeId: 'Select the value type' } },
    });

    await expect(fillIn({ get: reads(taskList), put })).rejects.toThrow(
      'The API refused the sample value-type-and-units answers',
    );
  });
});
