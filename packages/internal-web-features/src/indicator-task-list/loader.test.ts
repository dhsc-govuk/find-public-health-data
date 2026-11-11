import type { IndicatorTaskList } from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiAnswer,
  type FakeApiClient,
  noContent,
  refused,
} from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { devToolsContext } from '../dev-tools.ts';
import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { indicatorTaskList, taskStatuses } from '../testing.ts';
import { loadIndicatorTaskList, submitIndicator } from './loader.ts';

const taskList = indicatorTaskList();
const tasksLeft = { ...taskStatuses('completed'), polarity: 'not_started' } as const;
const TASK_LIST = `/api/internal/indicators/${taskList.indicator.id}/task-list` as const;

/** An API that answers the task list with `answer`. */
function answering(answer: FakeApiAnswer = taskList) {
  return createFakeApiClient({ [`GET ${TASK_LIST}`]: answer });
}

/** Leaves the development tools context unset unless `devTools` is given, as an app might. */
function load(id: string, api: FakeApiClient, devTools?: boolean) {
  const context = new RouterContextProvider();
  context.set(apiContext, api);
  if (devTools !== undefined) context.set(devToolsContext, devTools);

  return loadIndicatorTaskList({
    context,
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/task-list`),
  } as never);
}

describe('loadIndicatorTaskList', () => {
  it('fetches the task list of the indicator the address names', async () => {
    const outcome = await load(taskList.indicator.id, answering());

    expect(outcome).toEqual({ taskList, requests: null, offersSampleAnswers: false });
  });

  it('offers sample answers where the app offers development tools and tasks are left', async () => {
    const api = answering({ ...taskList, canSubmit: false, tasks: tasksLeft });

    const outcome = await load(taskList.indicator.id, api, true);

    expect(outcome.offersSampleAnswers).toBe(true);
  });

  it.each([
    ['off', false],
    ['unset', undefined],
  ])(
    'offers no sample answers with development tools %s, though tasks are left',
    async (_, devTools) => {
      const api = answering({ ...taskList, canSubmit: false, tasks: tasksLeft });

      const outcome = await load(taskList.indicator.id, api, devTools);

      expect(outcome.offersSampleAnswers).toBe(false);
    },
  );

  it('offers no sample answers to a complete draft held back by its review', async () => {
    const review: IndicatorTaskList['review'] = {
      kind: 'minor_revisions',
      clarificationRequest: null,
      flags: [],
      revisionResponse: null,
    };
    const api = answering({ ...taskList, canSubmit: false, review });

    const outcome = await load(taskList.indicator.id, api, true);

    expect(outcome.offersSampleAnswers).toBe(false);
  });

  it('renders what the round asks from the reviewer’s Markdown', async () => {
    const review: IndicatorTaskList['review'] = {
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

    const outcome = await load(taskList.indicator.id, answering({ ...taskList, review }));

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
    const outcome = await load(taskList.indicator.id, answering(), true);

    expect(outcome.offersSampleAnswers).toBe(false);
  });

  it('sends the publisher to the overview, saying why, while the draft is locked', async () => {
    const id = taskList.indicator.id;
    const context = withFlashStorage(new RouterContextProvider());
    context.set(apiContext, answering({ ...taskList, editable: false }));
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

  const SUBMIT = `POST /api/internal/indicators/${id}/submit` as const;

  function submit(api: FakeApiClient, body: Record<string, string>) {
    const context = withFlashStorage(new RouterContextProvider());
    context.set(apiContext, api);
    const request = new Request(path, { method: 'POST', body: new URLSearchParams(body) });

    return {
      context,
      request,
      run: () => submitIndicator({ context, params: { id }, request } as never),
    };
  }

  it('submits the draft as the page showed it, then says so on the overview', async () => {
    const api = createFakeApiClient({ [SUBMIT]: noContent });
    const { context, request, run } = submit(api, {
      draftUpdatedAt: '2026-10-22T09:30:00.123Z',
    });

    const response = await flashedResponse(context, request, run);

    expect(api.calls).toEqual([
      {
        method: 'POST',
        path: `/api/internal/indicators/${id}/submit`,
        body: { draftUpdatedAt: '2026-10-22T09:30:00.123Z' },
      },
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
    const api = createFakeApiClient({ [SUBMIT]: refused(409, { error }) });

    const outcome = await submit(api, { draftUpdatedAt: 'x' }).run();

    expect(outcome).toEqual({ formError: message });
  });

  it('sends an empty last edit when the form carries none, for the API to refuse', async () => {
    const api = createFakeApiClient({
      [SUBMIT]: refused(400, { error: 'invalid_draft_updated_at' }),
    });

    await submit(api, {}).run();

    expect(api.calls[0]?.body).toEqual({ draftUpdatedAt: '' });
  });
});
