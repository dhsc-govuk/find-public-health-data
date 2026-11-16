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
const tagsPath = '/api/internal/tags';

const dental = '019fa38f-073f-764e-9ac6-1c4d03b10001';
const cancer = '019fa38f-073f-764e-9ac6-1c4d03b10002';
const type = '019fa38f-073f-764e-9ac6-1c4d03b10003';
const lifeStage = '019fa38f-073f-764e-9ac6-1c4d03b10004';
const allCancers = '019fa38f-073f-764e-9ac6-1c4d03b10005';
const bowelCancer = '019fa38f-073f-764e-9ac6-1c4d03b10006';
const riskFactor = '019fa38f-073f-764e-9ac6-1c4d03b10007';

const options: TagOptions = {
  topics: [
    { id: cancer, name: 'Cancer' },
    { id: dental, name: 'Dental and oral health' },
  ],
  subtopics: [
    { id: allCancers, name: 'All cancers', topicId: cancer },
    { id: bowelCancer, name: 'Bowel cancer', topicId: cancer },
  ],
  indicatorTypes: [{ id: type, name: 'Outcome' }],
  frameworks: [],
  lifeStages: [{ id: lifeStage, name: 'Children (0 to 15 years old)' }],
  riskFactors: [{ id: riskFactor, name: 'Gambling' }],
};

const nothingChosen = {
  addTopic: '',
  addSubtopic: '',
  addIndicatorType: '',
  addFramework: '',
  addLifeStage: '',
  addRiskFactor: '',
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

/** The API offering the tags, and answering any other calls the test stubs. */
function apiWith(stubs: Parameters<typeof createFakeApiClient>[0] = {}) {
  return createFakeApiClient({ [`GET ${tagsPath}`]: options, ...stubs });
}

function submit(fields: [string, string][], api = apiWith()) {
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

/** Whether the action saved nothing: it read the tags offered and sent no answers. */
function savedNothing(api: FakeApiClient) {
  return api.calls.every(({ method }) => method === 'GET');
}

const answered: [string, string][] = [
  ['topicIds', dental],
  ['indicatorTypeIds', type],
  ['hasFramework', 'no'],
  ['hasLifeStage', 'no'],
  ['hasRiskFactor', 'no'],
];

describe('loadTagging', () => {
  it("fills the form with the draft's tags and offers every tag", async () => {
    const api = apiWith({
      [`GET ${sectionPath}`]: {
        answers: {
          topicIds: [cancer],
          subtopicIds: [allCancers],
          indicatorTypeIds: [],
          hasFramework: null,
          frameworkIds: [],
          phofIndicatorNumber: null,
          hasLifeStage: 'yes',
          lifeStageIds: [lifeStage],
          hasRiskFactor: 'no',
          riskFactorIds: [],
        },
        version: SHOWN_VERSION,
      },
    });

    const outcome = await load(id, api);

    expect(api.calls.map(({ path }) => path).sort()).toEqual([sectionPath, tagsPath]);
    expect(outcome).toEqual({
      id,
      options,
      values: {
        topicIds: [cancer],
        subtopicIds: [allCancers],
        indicatorTypeIds: [],
        hasFramework: '',
        frameworkIds: [],
        phofIndicatorNumber: '',
        hasLifeStage: 'yes',
        lifeStageIds: [lifeStage],
        hasRiskFactor: 'no',
        riskFactorIds: [],
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
  it('adds a chosen topic without subtopics to the list without saving anything', async () => {
    const api = apiWith();

    const outcome = await submit(
      [
        ['topicIds', cancer],
        ['subtopicIds', allCancers],
        ['addTopic', dental],
        ['intent', addIntent('topicIds')],
      ],
      api,
    );

    expect(outcome).toMatchObject({
      values: { topicIds: [cancer, dental], subtopicIds: [allCancers], addTopic: '' },
      fieldErrors: {},
    });
    expect(savedNothing(api)).toBe(true);
  });

  it('keeps a chosen topic with subtopics chosen, so the page asks for one', async () => {
    const outcome = await submit([
      ['addTopic', cancer],
      ['intent', addIntent('topicIds')],
    ]);

    expect(outcome).toMatchObject({
      values: { topicIds: [], addTopic: cancer, addSubtopic: '' },
      fieldErrors: {},
    });
  });

  it('adds a topic and its subtopic together', async () => {
    const outcome = await submit([
      ['topicIds', cancer],
      ['subtopicIds', allCancers],
      ['addTopic', cancer],
      ['addSubtopic', bowelCancer],
      ['intent', addIntent('subtopicIds')],
    ]);

    expect(outcome).toMatchObject({
      values: {
        topicIds: [cancer],
        subtopicIds: [allCancers, bowelCancer],
        addTopic: '',
        addSubtopic: '',
      },
      fieldErrors: {},
    });
  });

  it('asks for a subtopic when Add topic and subtopic is pressed with none chosen', async () => {
    const outcome = await submit([
      ['addTopic', cancer],
      ['intent', addIntent('subtopicIds')],
    ]);

    expect(outcome).toMatchObject({
      values: { addTopic: cancer },
      fieldErrors: { addSubtopic: 'Select a subtopic for Cancer' },
    });
  });

  it('answers "Yes" when a risk factor is added', async () => {
    const outcome = await submit([
      ['addRiskFactor', riskFactor],
      ['intent', addIntent('riskFactorIds')],
    ]);

    expect(outcome).toMatchObject({
      values: { hasRiskFactor: 'yes', riskFactorIds: [riskFactor] },
    });
  });

  it('adds a tag once, however often it is chosen', async () => {
    const outcome = await submit([
      ['topicIds', dental],
      ['addTopic', dental],
      ['intent', addIntent('topicIds')],
    ]);

    expect(outcome).toMatchObject({ values: { topicIds: [dental] } });
  });

  it('asks for a tag when Add is pressed with none chosen', async () => {
    await expect(submit([['intent', addIntent('indicatorTypeIds')]])).resolves.toMatchObject({
      fieldErrors: { addIndicatorType: 'Select a measure type' },
    });
    await expect(submit([['intent', addIntent('topicIds')]])).resolves.toMatchObject({
      fieldErrors: { addTopic: 'Select a topic' },
    });
  });

  it('removes a tag without saving anything', async () => {
    const api = apiWith();

    const outcome = await submit(
      [
        ['topicIds', dental],
        ['topicIds', cancer],
        ['subtopicIds', allCancers],
        ['intent', removeIntent(0, 'topicIds')],
      ],
      api,
    );

    expect(outcome).toMatchObject({
      values: { topicIds: [cancer], subtopicIds: [allCancers] },
      fieldErrors: {},
    });
    expect(savedNothing(api)).toBe(true);
  });

  it('removes a topic with its last subtopic, and keeps it beside another of its own', async () => {
    const both: [string, string][] = [
      ['topicIds', cancer],
      ['subtopicIds', allCancers],
      ['subtopicIds', bowelCancer],
    ];

    await expect(
      submit([...both, ['intent', removeIntent(0, 'subtopicIds')]]),
    ).resolves.toMatchObject({ values: { topicIds: [cancer], subtopicIds: [bowelCancer] } });
    await expect(
      submit([
        ['topicIds', cancer],
        ['subtopicIds', allCancers],
        ['intent', removeIntent(0, 'subtopicIds')],
      ]),
    ).resolves.toMatchObject({ values: { topicIds: [], subtopicIds: [] } });
  });

  it('saves the answers on Continue, taking in a tag chosen but not added', async () => {
    const api = apiWith({ [`PUT ${sectionPath}`]: savedSection });

    const outcome = await submit(
      [...answered, ['addTopic', cancer], ['addSubtopic', allCancers]],
      api,
    );

    expect(api.calls.find(({ method }) => method === 'PUT')?.body).toEqual({
      answers: {
        topicIds: [dental, cancer],
        subtopicIds: [allCancers],
        indicatorTypeIds: [type],
        hasFramework: 'no',
        frameworkIds: [],
        phofIndicatorNumber: '',
        hasLifeStage: 'no',
        lifeStageIds: [],
        hasRiskFactor: 'no',
        riskFactorIds: [],
      },
      version: SHOWN_VERSION,
    });
    expect(outcome).toSatisfy(isRedirectToTaskList);
  });

  it('refuses on Continue a topic chosen without the subtopic it needs', async () => {
    const api = apiWith();

    const outcome = await submit([...answered, ['addTopic', cancer]], api);

    expect(outcome).toMatchObject({
      values: { addTopic: cancer },
      fieldErrors: { addSubtopic: 'Select a subtopic for Cancer' },
    });
    expect(savedNothing(api)).toBe(true);
  });

  it('refuses that topic along with every other refusal, without asking for a topic', async () => {
    const outcome = await submit([
      ['addTopic', cancer],
      ['hasFramework', 'no'],
      ['hasLifeStage', 'no'],
      ['addRiskFactor', riskFactor],
    ]);

    expect(outcome).toMatchObject({
      values: { addTopic: cancer, riskFactorIds: [riskFactor], addRiskFactor: '' },
      fieldErrors: {
        addSubtopic: 'Select a subtopic for Cancer',
        indicatorTypeIds: 'Select a measure type',
        hasRiskFactor: 'Select whether this indicator includes a risk factor',
      },
    });
    expect(outcome).not.toHaveProperty('fieldErrors.topicIds');
  });

  it('leaves out a risk factor chosen beside "No"', async () => {
    const api = apiWith({ [`PUT ${sectionPath}`]: savedSection });

    await submit([...answered, ['addRiskFactor', riskFactor]], api);

    expect(api.calls.find(({ method }) => method === 'PUT')?.body).toMatchObject({
      answers: { hasRiskFactor: 'no', riskFactorIds: [] },
    });
  });

  it('saves nothing while the answers are refused', async () => {
    const api = apiWith();

    const outcome = await submit([['hasLifeStage', 'yes']], api);

    expect(outcome).toEqual({
      values: {
        topicIds: [],
        subtopicIds: [],
        indicatorTypeIds: [],
        hasFramework: '',
        frameworkIds: [],
        phofIndicatorNumber: '',
        hasLifeStage: 'yes',
        lifeStageIds: [],
        hasRiskFactor: '',
        riskFactorIds: [],
        ...nothingChosen,
      },
      fieldErrors: {
        topicIds: 'Select at least one topic',
        indicatorTypeIds: 'Select a measure type',
        hasFramework: 'Select whether this indicator is part of a framework or programme',
        lifeStageIds: 'Select at least one life stage',
        hasRiskFactor: 'Select whether this indicator includes a risk factor',
      },
      version: SHOWN_VERSION,
    });
    expect(savedNothing(api)).toBe(true);
  });

  it('shows a tag the API no longer offers as refused', async () => {
    const api = apiWith({
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
