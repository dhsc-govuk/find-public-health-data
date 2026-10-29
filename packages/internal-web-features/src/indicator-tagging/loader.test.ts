import type { TagOptions } from '@fphd/internal-api-features/contract';
import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { addIntent, removeIntent } from '../list-form.ts';
import { SHOWN_VERSION } from '../testing.ts';
import { loadTagging, submitTagging } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/tagging`;

const topic = '019fa38f-073f-764e-9ac6-1c4d03b10001';
const otherTopic = '019fa38f-073f-764e-9ac6-1c4d03b10002';
const type = '019fa38f-073f-764e-9ac6-1c4d03b10003';
const lifeStage = '019fa38f-073f-764e-9ac6-1c4d03b10004';

const options: TagOptions = {
  topics: [
    { id: topic, name: 'Alcohol' },
    { id: otherTopic, name: 'Cancer' },
  ],
  subtopics: [],
  indicatorTypes: [{ id: type, name: 'Outcome' }],
  lifeStages: [{ id: lifeStage, name: 'Gambling' }],
  frameworks: [],
};

const nothingChosen = {
  addTopic: '',
  addSubtopic: '',
  addIndicatorType: '',
  addLifeStage: '',
  addFramework: '',
};

function context(client: Partial<ApiClient>) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, client as ApiClient);
  return provider;
}

function load(indicatorId: string, get: ApiClient['get']) {
  return loadTagging({
    context: context({ get }),
    params: { id: indicatorId },
    request: new Request(`https://internal.test/publish/indicators/${indicatorId}/tagging`),
  } as never);
}

function submit(fields: [string, string][], put: ApiClient['put'] = vi.fn()) {
  return submitTagging({
    context: context({ put }),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/tagging`, {
      method: 'POST',
      body: new URLSearchParams([...fields, ['version', SHOWN_VERSION]]),
    }),
  } as never);
}

function isRedirectToTaskList(outcome: unknown) {
  return (
    outcome instanceof Response &&
    outcome.status === 302 &&
    outcome.headers.get('location') === `/publish/indicators/${id}/task-list`
  );
}

const answered: [string, string][] = [
  ['topicIds', topic],
  ['primaryTopicId', topic],
  ['indicatorTypeIds', type],
  ['hasLifeStage', 'no'],
  ['hasFramework', 'no'],
];

describe('loadTagging', () => {
  it("fills the form with the draft's tags and offers every tag", async () => {
    const get = vi.fn((path: string) =>
      Promise.resolve(
        path === sectionPath
          ? {
              answers: {
                topicIds: [topic],
                primaryTopicId: topic,
                subtopicIds: [],
                primarySubtopicId: '',
                indicatorTypeIds: [],
                hasLifeStage: 'yes',
                lifeStageIds: [lifeStage],
                hasFramework: null,
                frameworkIds: [],
              },
              version: SHOWN_VERSION,
            }
          : options,
      ),
    );

    const outcome = await load(id, get as unknown as ApiClient['get']);

    expect(get.mock.calls.map(([path]) => path).sort()).toEqual([
      sectionPath,
      '/api/internal/tags',
    ]);
    expect(outcome).toEqual({
      id,
      options,
      values: {
        topicIds: [topic],
        primaryTopicId: topic,
        subtopicIds: [],
        primarySubtopicId: '',
        indicatorTypeIds: [],
        hasLifeStage: 'yes',
        lifeStageIds: [lifeStage],
        hasFramework: '',
        frameworkIds: [],
        ...nothingChosen,
      },
      version: SHOWN_VERSION,
    });
  });

  it('answers 404 to a malformed id without asking the API for anything', async () => {
    const get = vi.fn();

    await expect(load('108', get)).rejects.toSatisfy(
      (error) => error instanceof Response && error.status === 404,
    );
    expect(get).not.toHaveBeenCalled();
  });
});

describe('submitTagging', () => {
  it('adds the chosen tag to its list without saving anything', async () => {
    const put = vi.fn();

    const outcome = await submit(
      [
        ['topicIds', topic],
        ['primaryTopicId', topic],
        ['addTopic', otherTopic],
        ['intent', addIntent('topicIds')],
      ],
      put,
    );

    expect(outcome).toMatchObject({
      values: { topicIds: [topic, otherTopic], addTopic: '' },
      fieldErrors: {},
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('answers "Yes" when a life stage is added', async () => {
    const outcome = await submit([
      ['addLifeStage', lifeStage],
      ['intent', addIntent('lifeStageIds')],
    ]);

    expect(outcome).toMatchObject({
      values: { hasLifeStage: 'yes', lifeStageIds: [lifeStage] },
    });
  });

  it('adds a tag once, however often it is chosen', async () => {
    const outcome = await submit([
      ['topicIds', topic],
      ['primaryTopicId', topic],
      ['addTopic', topic],
      ['intent', addIntent('topicIds')],
    ]);

    expect(outcome).toMatchObject({ values: { topicIds: [topic] } });
  });

  it('asks for a tag when Add is pressed with none chosen', async () => {
    const outcome = await submit([['intent', addIntent('indicatorTypeIds')]]);

    expect(outcome).toMatchObject({
      fieldErrors: { addIndicatorType: 'Select a measure type' },
    });
  });

  it('removes a tag without saving anything', async () => {
    const put = vi.fn();

    const outcome = await submit(
      [
        ['topicIds', topic],
        ['primaryTopicId', topic],
        ['topicIds', otherTopic],
        ['intent', removeIntent(0, 'topicIds')],
      ],
      put,
    );

    expect(outcome).toMatchObject({ values: { topicIds: [otherTopic] }, fieldErrors: {} });
    expect(put).not.toHaveBeenCalled();
  });

  it('saves the answers on Continue, taking in a tag chosen but not added', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: {} });

    const outcome = await submit([...answered, ['addTopic', otherTopic]], put);

    expect(put.mock.calls[0]?.[0]).toBe(sectionPath);
    expect(put.mock.calls[0]?.[1]).toEqual({
      answers: {
        topicIds: [topic, otherTopic],
        primaryTopicId: topic,
        subtopicIds: [],
        primarySubtopicId: '',
        indicatorTypeIds: [type],
        hasLifeStage: 'no',
        lifeStageIds: [],
        hasFramework: 'no',
        frameworkIds: [],
      },
      version: SHOWN_VERSION,
    });
    expect(outcome).toSatisfy(isRedirectToTaskList);
  });

  it('leaves out a life stage chosen beside "No"', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: {} });

    await submit([...answered, ['addLifeStage', lifeStage]], put);

    expect(put.mock.calls[0]?.[1]).toMatchObject({
      answers: { hasLifeStage: 'no', lifeStageIds: [] },
    });
  });

  it('saves nothing while the answers are refused', async () => {
    const put = vi.fn();

    const outcome = await submit([['hasLifeStage', 'yes']], put);

    expect(outcome).toEqual({
      values: {
        topicIds: [],
        primaryTopicId: '',
        subtopicIds: [],
        primarySubtopicId: '',
        indicatorTypeIds: [],
        hasLifeStage: 'yes',
        lifeStageIds: [],
        hasFramework: '',
        frameworkIds: [],
        ...nothingChosen,
      },
      fieldErrors: {
        topicIds: 'Select at least one topic',
        primaryTopicId: 'Select a primary topic',
        indicatorTypeIds: 'Select a measure type',
        lifeStageIds: 'Select at least one life stage',
        hasFramework: 'Select whether this indicator is part of a framework or programme',
      },
      version: SHOWN_VERSION,
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('shows a tag the API no longer offers as refused', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: {
        error: 'validation_failed',
        fieldErrors: { topicIds: 'Select a topic from the list' },
      },
    });

    await expect(submit(answered, put)).resolves.toMatchObject({
      fieldErrors: { topicIds: 'Select a topic from the list' },
    });
  });
});
