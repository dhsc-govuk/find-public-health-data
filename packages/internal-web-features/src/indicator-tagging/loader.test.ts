import type { TagOptions } from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient, refused } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { addIntent, removeIntent } from '../list-form.ts';
import { SHOWN_VERSION, savedSection } from '../testing.ts';
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

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

function load(indicatorId: string, api: FakeApiClient) {
  return loadTagging({
    context: context(api),
    params: { id: indicatorId },
    request: new Request(`https://internal.test/publish/indicators/${indicatorId}/tagging`),
  } as never);
}

function submit(fields: [string, string][], api = createFakeApiClient()) {
  return submitTagging({
    context: context(api),
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
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: {
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
      },
      'GET /api/internal/tags': options,
    });

    const outcome = await load(id, api);

    expect(api.calls.map(({ path }) => path).sort()).toEqual([sectionPath, '/api/internal/tags']);
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
    const api = createFakeApiClient();

    await expect(load('108', api)).rejects.toSatisfy(
      (error) => error instanceof Response && error.status === 404,
    );
    expect(api.calls).toEqual([]);
  });
});

describe('submitTagging', () => {
  it('adds the chosen tag to its list without saving anything', async () => {
    const api = createFakeApiClient();

    const outcome = await submit(
      [
        ['topicIds', topic],
        ['primaryTopicId', topic],
        ['addTopic', otherTopic],
        ['intent', addIntent('topicIds')],
      ],
      api,
    );

    expect(outcome).toMatchObject({
      values: { topicIds: [topic, otherTopic], addTopic: '' },
      fieldErrors: {},
    });
    expect(api.calls).toEqual([]);
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
    const api = createFakeApiClient();

    const outcome = await submit(
      [
        ['topicIds', topic],
        ['primaryTopicId', topic],
        ['topicIds', otherTopic],
        ['intent', removeIntent(0, 'topicIds')],
      ],
      api,
    );

    expect(outcome).toMatchObject({ values: { topicIds: [otherTopic] }, fieldErrors: {} });
    expect(api.calls).toEqual([]);
  });

  it('saves the answers on Continue, taking in a tag chosen but not added', async () => {
    const api = createFakeApiClient({ [`PUT ${sectionPath}`]: savedSection });

    const outcome = await submit([...answered, ['addTopic', otherTopic]], api);

    expect(api.calls[0]?.body).toEqual({
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
    const api = createFakeApiClient({ [`PUT ${sectionPath}`]: savedSection });

    await submit([...answered, ['addLifeStage', lifeStage]], api);

    expect(api.calls[0]?.body).toMatchObject({
      answers: { hasLifeStage: 'no', lifeStageIds: [] },
    });
  });

  it('saves nothing while the answers are refused', async () => {
    const api = createFakeApiClient();

    const outcome = await submit([['hasLifeStage', 'yes']], api);

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
    expect(api.calls).toEqual([]);
  });

  it('shows a tag the API no longer offers as refused', async () => {
    const api = createFakeApiClient({
      [`PUT ${sectionPath}`]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { topicIds: 'Select a topic from the list' },
      }),
    });

    await expect(submit(answered, api)).resolves.toMatchObject({
      fieldErrors: { topicIds: 'Select a topic from the list' },
    });
  });
});
