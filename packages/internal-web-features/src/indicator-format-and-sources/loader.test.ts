import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiClient,
  type FakeApiStubs,
} from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SAVED_VERSION, SHOWN_VERSION } from '../testing.ts';
import {
  ADD_DATA_VALUE_INTENT,
  addSourceIntent,
  removeDataValueIntent,
  removeSourceIntent,
  type SourcePicker,
  showSourcesIntent,
  sourceFieldName,
} from './form.ts';
import { loadFormatAndSources, submitFormatAndSources } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/format-and-sources`;
const providersPath = '/api/internal/data-providers';

const ons = {
  id: '01a0d858-9885-764e-8d53-6826aec67001',
  name: 'Office for National Statistics (ONS)',
  sources: [{ id: '01a0d858-9885-764e-8d53-6826aec67002', name: 'Annual mortality extract' }],
};
const estimated = { id: '01a0d858-9885-764e-8d53-6826aec67004', name: 'Estimated', sources: [] };
const providers = [ons, estimated];

const mortality = { providerId: ons.id, sourceId: ons.sources[0]?.id ?? null };
const estimatedAlone = { providerId: estimated.id, sourceId: null };
const notOffered = { providerId: '01a0d858-9885-764e-8d53-6826aec67999', sourceId: null };

const NO_LONGER_OFFERED =
  'Remove the data source that is no longer available, then add another if you need one';

const unansweredAnswers = {
  hasNumeratorDenominator: null,
  numeratorSources: [],
  numeratorDefinition: null,
  numeratorDisclosureControl: null,
  numeratorDisclosureControlDetail: null,
  denominatorSources: [],
  denominatorDefinition: null,
  denominatorDisclosureControl: null,
  denominatorDisclosureControlDetail: null,
  dataValues: [],
};

const nothingChosen = { providerId: '', sourceId: '' };

const blankDataValue = {
  sources: [],
  definition: '',
  disclosureControl: '',
  disclosureControlDetail: '',
  ...nothingChosen,
};

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

/** Answers the providers list, and the section with `answers`. */
function getting(answers: object) {
  return createFakeApiClient({
    [`GET ${providersPath}`]: providers,
    [`GET ${sectionPath}`]: { answers, version: SHOWN_VERSION },
  });
}

/** Answers the providers list, which a submission checks its sources against, and `stubs`. */
function submitting(stubs: FakeApiStubs = {}) {
  return createFakeApiClient({ [`GET ${providersPath}`]: providers, ...stubs });
}

/** An API that saves the section. Its answer is not read beyond its shape. */
function saving() {
  return submitting({
    [`PUT ${sectionPath}`]: { answers: unansweredAnswers, version: SAVED_VERSION },
  });
}

function saves(api: FakeApiClient) {
  return api.calls.filter(({ method }) => method === 'PUT');
}

function isNotFound(error: unknown) {
  return error instanceof Response && error.status === 404;
}

function isBadRequest(error: unknown) {
  return error instanceof Response && error.status === 400;
}

function load(indicatorId: string, api: FakeApiClient) {
  return loadFormatAndSources({
    context: context(api),
    params: { id: indicatorId },
    request: new Request(
      `https://internal.test/publish/indicators/${indicatorId}/format-and-sources`,
    ),
  } as never);
}

type Sources = { providerId: string; sourceId: string | null }[];

function submit(
  fields: Record<string, string>,
  lists: Partial<Record<SourcePicker, Sources>>,
  api: FakeApiClient,
) {
  const body = new URLSearchParams({ ...fields, version: SHOWN_VERSION });
  for (const [key, sources] of Object.entries(lists)) {
    const picker: SourcePicker = /^\d+$/.test(key) ? Number(key) : (key as SourcePicker);
    sources?.forEach(({ providerId, sourceId }, index) => {
      body.set(sourceFieldName(picker, index, 'providerId'), providerId);
      body.set(sourceFieldName(picker, index, 'sourceId'), sourceId ?? '');
    });
  }

  return submitFormatAndSources({
    context: context(api),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/format-and-sources`, {
      method: 'POST',
      body,
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

/** A data value row's fields as the form sends them. */
function dataValueFields(index: number, row: Partial<Record<string, string>>) {
  return Object.fromEntries(
    Object.entries(row).map(([part, value]) => [`dataValues[${index}].${part}`, value ?? '']),
  );
}

const numeratorAnswered = {
  hasNumeratorDenominator: 'yes',
  numeratorDefinition: ' Deaths ',
  numeratorDisclosureControl: 'yes',
  numeratorDisclosureControlDetail: 'Counts under 5 suppressed',
  denominatorDefinition: 'Population',
  denominatorDisclosureControl: 'not-applicable',
  denominatorDisclosureControlDetail: '',
};

describe('loadFormatAndSources', () => {
  it("fills the form with the draft's answers, a blank data value, and the providers offered", async () => {
    const api = getting({
      ...unansweredAnswers,
      hasNumeratorDenominator: 'yes',
      numeratorSources: [mortality],
      numeratorDefinition: 'Deaths',
    });

    await expect(load(id, api)).resolves.toEqual({
      id,
      providers,
      values: expect.objectContaining({
        hasNumeratorDenominator: 'yes',
        numeratorSources: [mortality],
        numeratorDefinition: 'Deaths',
        numeratorProviderId: '',
        numeratorSourceId: '',
        dataValues: [blankDataValue],
      }),
      version: SHOWN_VERSION,
      fieldErrors: {},
    });
    expect(api.calls.map(({ path }) => path).sort()).toEqual([sectionPath, providersPath].sort());
  });

  it('asks for a saved source the providers list no longer offers to be removed', async () => {
    const api = getting({
      ...unansweredAnswers,
      hasNumeratorDenominator: 'no',
      dataValues: [
        {
          sources: [mortality],
          definition: 'Admissions',
          disclosureControl: null,
          disclosureControlDetail: null,
        },
        {
          sources: [notOffered],
          definition: 'Population',
          disclosureControl: null,
          disclosureControlDetail: null,
        },
      ],
    });

    await expect(load(id, api)).resolves.toMatchObject({
      fieldErrors: { 'dataValues[1].sources': NO_LONGER_OFFERED },
    });
  });

  it('answers 404 to a malformed id without asking the API for anything', async () => {
    const api = createFakeApiClient();

    await expect(load('108', api)).rejects.toSatisfy(isNotFound);
    expect(api.calls).toEqual([]);
  });
});

describe('submitFormatAndSources', () => {
  it("shows the chosen provider's sources without saving anything", async () => {
    const api = submitting();

    const outcome = await submit(
      { intent: showSourcesIntent('denominator'), denominatorProviderId: ons.id },
      {},
      api,
    );

    expect(outcome).toMatchObject({
      values: { denominatorProviderId: ons.id, denominatorSourceId: '' },
      fieldErrors: {},
    });
    expect(saves(api)).toEqual([]);
  });

  it("asks for a data value's provider when its Show sources is selected with none chosen", async () => {
    const outcome = await submit(
      { intent: showSourcesIntent(0), ...dataValueFields(0, { definition: '' }) },
      {},
      submitting(),
    );

    expect(outcome).toMatchObject({
      fieldErrors: { 'dataValues[0].providerId': 'Select a data provider' },
    });
  });

  it("adds the chosen provider and source to that figure's list alone, clearing its selects", async () => {
    const api = submitting();

    const outcome = await submit(
      {
        intent: addSourceIntent('numerator'),
        numeratorProviderId: estimated.id,
        numeratorSourceId: 'none',
      },
      { numerator: [mortality], denominator: [mortality] },
      api,
    );

    expect(outcome).toMatchObject({
      values: {
        numeratorSources: [mortality, estimatedAlone],
        numeratorProviderId: '',
        numeratorSourceId: '',
        denominatorSources: [mortality],
      },
      fieldErrors: {},
    });
    expect(saves(api)).toEqual([]);
  });

  it("refuses to add a data value's provider with no source chosen, naming its select", async () => {
    const outcome = await submit(
      {
        intent: addSourceIntent(0),
        ...dataValueFields(0, { definition: '', providerId: ons.id, sourceId: '' }),
      },
      {},
      submitting(),
    );

    expect(outcome).toMatchObject({
      values: { dataValues: [{ providerId: ons.id, sourceId: '' }] },
      fieldErrors: { 'dataValues[0].sourceId': 'Select a source, or No specific source' },
    });
  });

  it("removes a source from that figure's list without saving anything", async () => {
    const api = submitting();

    const outcome = await submit(
      { intent: removeSourceIntent('denominator', 0) },
      { numerator: [mortality], denominator: [mortality, estimatedAlone] },
      api,
    );

    expect(outcome).toMatchObject({
      values: { numeratorSources: [mortality], denominatorSources: [estimatedAlone] },
      fieldErrors: {},
    });
    expect(saves(api)).toEqual([]);
  });

  it('adds a blank data value, answering No, without saving anything', async () => {
    const api = submitting();

    const outcome = await submit(
      { intent: ADD_DATA_VALUE_INTENT, ...dataValueFields(0, { definition: 'Admissions' }) },
      { 0: [mortality] },
      api,
    );

    expect(outcome).toMatchObject({
      values: {
        hasNumeratorDenominator: 'no',
        dataValues: [{ sources: [mortality], definition: 'Admissions' }, blankDataValue],
      },
      fieldErrors: {},
    });
    expect(saves(api)).toEqual([]);
  });

  it('removes a data value with its sources, keeping the others', async () => {
    const outcome = await submit(
      {
        intent: removeDataValueIntent(0),
        hasNumeratorDenominator: 'no',
        ...dataValueFields(0, { definition: 'Admissions' }),
        ...dataValueFields(1, { definition: 'Population' }),
      },
      { 0: [mortality], 1: [estimatedAlone] },
      submitting(),
    );

    expect(outcome).toMatchObject({
      values: { dataValues: [{ sources: [estimatedAlone], definition: 'Population' }] },
    });
  });

  it('keeps a blank data value once the last is removed', async () => {
    const outcome = await submit(
      { intent: removeDataValueIntent(0), ...dataValueFields(0, { definition: 'Admissions' }) },
      {},
      submitting(),
    );

    expect(outcome).toMatchObject({ values: { dataValues: [blankDataValue] } });
  });

  it('keeps a source no longer offered while it re-renders the page, asking for it removed', async () => {
    const outcome = await submit(
      { intent: removeSourceIntent('numerator', 0) },
      { numerator: [mortality, notOffered] },
      submitting(),
    );

    expect(outcome).toMatchObject({
      values: { numeratorSources: [notOffered] },
      fieldErrors: { numeratorSources: NO_LONGER_OFFERED },
    });
  });

  it('saves the numerator and denominator on Continue, clearing the data values, and returns to the task list', async () => {
    const api = saving();

    const outcome = await submit(
      { ...numeratorAnswered, ...dataValueFields(0, { definition: 'Typed before choosing Yes' }) },
      { numerator: [mortality, estimatedAlone], denominator: [estimatedAlone], 0: [mortality] },
      api,
    );

    expect(saves(api)[0]?.body).toEqual({
      answers: {
        hasNumeratorDenominator: 'yes',
        numeratorSources: [mortality, estimatedAlone],
        numeratorDefinition: 'Deaths',
        numeratorDisclosureControl: 'yes',
        numeratorDisclosureControlDetail: 'Counts under 5 suppressed',
        denominatorSources: [estimatedAlone],
        denominatorDefinition: 'Population',
        denominatorDisclosureControl: 'not-applicable',
        denominatorDisclosureControlDetail: '',
        dataValues: [],
      },
      version: SHOWN_VERSION,
    });
    expect(outcome).toSatisfy(isRedirectToTaskList);
  });

  it('saves the data values on Continue, clearing the numerator and denominator', async () => {
    const api = saving();

    await submit(
      {
        ...numeratorAnswered,
        hasNumeratorDenominator: 'no',
        ...dataValueFields(0, { definition: 'Admissions', disclosureControl: 'not-applicable' }),
        ...dataValueFields(1, {
          definition: 'Population',
          disclosureControl: 'yes',
          disclosureControlDetail: 'Rounded',
        }),
      },
      { numerator: [mortality], 0: [mortality], 1: [estimatedAlone] },
      api,
    );

    expect(saves(api)[0]?.body).toMatchObject({
      answers: {
        hasNumeratorDenominator: 'no',
        numeratorSources: [],
        numeratorDefinition: '',
        numeratorDisclosureControl: '',
        dataValues: [
          {
            sources: [mortality],
            definition: 'Admissions',
            disclosureControl: 'not-applicable',
            disclosureControlDetail: '',
          },
          {
            sources: [estimatedAlone],
            definition: 'Population',
            disclosureControl: 'yes',
            disclosureControlDetail: 'Rounded',
          },
        ],
      },
    });
  });

  it("saves a data value's provider and source chosen but not added along with the others", async () => {
    const api = saving();

    await submit(
      {
        hasNumeratorDenominator: 'no',
        ...dataValueFields(0, {
          definition: 'Admissions',
          disclosureControl: 'not-applicable',
          providerId: estimated.id,
          sourceId: 'none',
        }),
      },
      { 0: [mortality] },
      api,
    );

    expect(saves(api)[0]?.body).toMatchObject({
      answers: { dataValues: [{ sources: [mortality, estimatedAlone] }] },
    });
  });

  it('saves nothing while the answers are refused, naming each data value', async () => {
    const api = submitting();

    const outcome = await submit(
      { hasNumeratorDenominator: 'no', ...dataValueFields(0, { definition: '' }) },
      {},
      api,
    );

    expect(outcome).toMatchObject({
      fieldErrors: {
        'dataValues[0].sources': 'Add at least one data source for data value 1',
        'dataValues[0].definition': 'Enter the definition for data value 1',
        'dataValues[0].disclosureControl':
          'Select whether disclosure control has been applied to data value 1',
      },
    });
    expect(saves(api)).toEqual([]);
  });

  it('shows the rest of the refusals with a chosen source that cannot be added', async () => {
    const api = submitting();

    const outcome = await submit(
      {
        ...numeratorAnswered,
        numeratorDefinition: ' ',
        numeratorProviderId: ons.id,
        numeratorSourceId: '',
      },
      { numerator: [mortality], denominator: [mortality] },
      api,
    );

    expect(outcome).toMatchObject({
      fieldErrors: {
        numeratorSourceId: 'Select a source, or No specific source',
        numeratorDefinition: 'Enter the numerator definition',
      },
    });
    expect(saves(api)).toEqual([]);
  });

  it('refuses to save a source no longer offered, asking for it removed beside the other refusals', async () => {
    const api = submitting();

    const outcome = await submit(
      { ...numeratorAnswered, denominatorDefinition: '' },
      { numerator: [notOffered], denominator: [mortality] },
      api,
    );

    expect(outcome).toMatchObject({
      fieldErrors: {
        numeratorSources: NO_LONGER_OFFERED,
        denominatorDefinition: 'Enter the denominator definition',
      },
    });
    expect(saves(api)).toEqual([]);
  });

  it('refuses a malformed source, which the page never sends', async () => {
    await expect(
      submit(
        { intent: addSourceIntent('numerator') },
        { numerator: [{ providerId: 'not-an-id', sourceId: null }] },
        submitting(),
      ),
    ).rejects.toSatisfy(isBadRequest);
  });
});
