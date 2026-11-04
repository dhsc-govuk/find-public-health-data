import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { devToolsContext } from '../dev-tools.ts';
import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { loadIndicatorTaskList, submitIndicator } from './loader.ts';

const tasksLeft = { name: 'completed', polarity: 'not_started' };

const taskList = {
  indicator: {
    id: '00000000-0000-7000-8000-000000000001',
    shortId: 90366,
    name: 'Life expectancy at birth',
    indicatorStatus: 'new',
    draftStatus: 'draft',
    draftSubmissionStatus: null,
  },
  isUpdate: false,
  canSubmit: true,
  review: null,
  draftUpdatedAt: '2026-10-22T09:30:00.123Z',
  editable: true,
  actions: ['submit'],
  tasks: { name: 'completed' },
};

/** Leaves the development tools context unset unless `devTools` is given, as an app might. */
function load(id: string, get: ApiClient['get'], devTools?: boolean) {
  const context = new RouterContextProvider();
  context.set(apiContext, { get } as unknown as ApiClient);
  if (devTools !== undefined) context.set(devToolsContext, devTools);

  return loadIndicatorTaskList({
    context,
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/task-list`),
  } as never);
}

describe('loadIndicatorTaskList', () => {
  it('fetches the task list of the indicator the address names', async () => {
    const get = vi.fn().mockResolvedValue(taskList);

    const outcome = await load(taskList.indicator.id, get);

    expect(get.mock.calls[0]?.[0]).toBe(
      `/api/internal/indicators/${taskList.indicator.id}/task-list`,
    );
    expect(outcome).toEqual({ taskList, requests: null, offersSampleAnswers: false });
  });

  it('offers sample answers where the app offers development tools and tasks are left', async () => {
    const get = vi.fn().mockResolvedValue({ ...taskList, canSubmit: false, tasks: tasksLeft });

    const outcome = await load(taskList.indicator.id, get, true);

    expect(outcome.offersSampleAnswers).toBe(true);
  });

  it.each([
    ['off', false],
    ['unset', undefined],
  ])(
    'offers no sample answers with development tools %s, though tasks are left',
    async (_, devTools) => {
      const get = vi.fn().mockResolvedValue({ ...taskList, canSubmit: false, tasks: tasksLeft });

      const outcome = await load(taskList.indicator.id, get, devTools);

      expect(outcome.offersSampleAnswers).toBe(false);
    },
  );

  it('offers no sample answers to a complete draft held back by its review', async () => {
    const review = {
      kind: 'minor_revisions',
      clarificationRequest: null,
      flags: [],
      revisionResponse: null,
    };
    const get = vi.fn().mockResolvedValue({ ...taskList, canSubmit: false, review });

    const outcome = await load(taskList.indicator.id, get, true);

    expect(outcome.offersSampleAnswers).toBe(false);
  });

  it('renders what the round asks from the reviewer’s Markdown', async () => {
    const review = {
      kind: 'pre_imrg_feedback',
      clarificationRequest: { notes: 'Which *years*?', reviewerName: 'Sam Reviewer' },
      flags: [
        {
          task: 'polarity',
          notes: 'Is **higher** better?',
          reviewerName: 'Sam Reviewer',
          cleared: false,
        },
        { task: 'name', notes: 'Shorter', reviewerName: 'Ali Reviewer', cleared: true },
      ],
      revisionResponse: '  ',
    };

    const outcome = await load(
      taskList.indicator.id,
      vi.fn().mockResolvedValue({ ...taskList, review }),
    );

    expect(outcome.requests).toEqual({
      advised: true,
      clarificationRequest: {
        reviewerName: 'Sam Reviewer',
        notes: { markdownHtml: '<p class="govuk-body">Which <em>years</em>?</p>' },
      },
      flags: {
        polarity: {
          reviewerName: 'Sam Reviewer',
          notes: { markdownHtml: '<p class="govuk-body">Is <strong>higher</strong> better?</p>' },
          cleared: false,
        },
        name: {
          reviewerName: 'Ali Reviewer',
          notes: { markdownHtml: '<p class="govuk-body">Shorter</p>' },
          cleared: true,
        },
      },
      replied: false,
    });
  });

  it('offers no sample answers once every task is complete', async () => {
    const outcome = await load(taskList.indicator.id, vi.fn().mockResolvedValue(taskList), true);

    expect(outcome.offersSampleAnswers).toBe(false);
  });

  it('sends the publisher to the overview, saying why, while the draft is locked', async () => {
    const id = taskList.indicator.id;
    const context = withFlashStorage(new RouterContextProvider());
    context.set(apiContext, {
      get: vi.fn().mockResolvedValue({ ...taskList, editable: false }),
    } as unknown as ApiClient);
    const request = new Request(`https://internal.test/publish/indicators/${id}/task-list`);

    const response = await flashedResponse(context, request, () =>
      loadIndicatorTaskList({ context, params: { id }, request } as never),
    );

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `/dashboard/indicators/${id}`,
      flash: 'draft-locked',
    });
  });
});

describe('submitIndicator', () => {
  const id = taskList.indicator.id;
  const path = `https://internal.test/publish/indicators/${id}/task-list`;

  function submit(postToMember: ApiClient['postToMember'], body: Record<string, string>) {
    const context = withFlashStorage(new RouterContextProvider());
    context.set(apiContext, { postToMember } as unknown as ApiClient);
    const request = new Request(path, { method: 'POST', body: new URLSearchParams(body) });

    return {
      context,
      request,
      run: () => submitIndicator({ context, params: { id }, request } as never),
    };
  }

  it('submits the draft as the page showed it, then says so on the overview', async () => {
    const postToMember = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const { context, request, run } = submit(postToMember, {
      draftUpdatedAt: '2026-10-22T09:30:00.123Z',
    });

    const response = await flashedResponse(context, request, run);

    expect(postToMember.mock.calls[0]?.slice(0, 2)).toEqual([
      `/api/internal/indicators/${id}/submit`,
      { draftUpdatedAt: '2026-10-22T09:30:00.123Z' },
    ]);
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `/dashboard/indicators/${id}`,
      flash: 'indicator-submitted',
    });
  });

  it.each([
    [
      'changed',
      'This indicator has changed since you opened this page. Check the changes, then submit again.',
    ],
    ['incomplete', 'Complete every task before you submit this indicator.'],
    ['not_allowed', 'This indicator cannot be submitted for approval.'],
    ['invalid_draft_updated_at', 'The indicator could not be submitted. Try again.'],
  ])('stays on the task list saying why when the API refuses it as %s', async (error, message) => {
    const postToMember = vi.fn().mockResolvedValue({ ok: false, status: 409, error: { error } });

    const outcome = await submit(postToMember, { draftUpdatedAt: 'x' }).run();

    expect(outcome).toEqual({ formError: message });
  });

  it('sends an empty last edit when the form carries none, for the API to refuse', async () => {
    const postToMember = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'invalid_draft_updated_at' },
    });

    await submit(postToMember, {}).run();

    expect(postToMember.mock.calls[0]?.[1]).toEqual({ draftUpdatedAt: '' });
  });
});
