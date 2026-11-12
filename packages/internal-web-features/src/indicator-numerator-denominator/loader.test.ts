import { denominatorSection, numeratorSection } from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiClient,
  type FakeApiStubs,
} from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { ADD_INTENT, removeIntent } from '../list-form.ts';
import { SHOWN_VERSION, savedSection } from '../testing.ts';
import { SHOW_SOURCES_INTENT, sourceFieldName } from './form.ts';
import { loadNumeratorDenominator, submitNumeratorDenominator } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/numerator`;
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

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

/** Answers the providers list, and the section at `path` with `answers`. */
function getting(answers: object, path = sectionPath) {
  return createFakeApiClient({
    [`GET ${providersPath}`]: providers,
    [`GET ${path}`]: { answers, version: SHOWN_VERSION },
  });
}

/** Answers the providers list, which a submission checks its sources against, and `stubs`. */
function submitting(stubs: FakeApiStubs = {}) {
  return createFakeApiClient({ [`GET ${providersPath}`]: providers, ...stubs });
}

/** An API that saves the section, answering with what it saved. */
function saving() {
  return submitting({ [`PUT ${sectionPath}`]: savedSection });
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

function load(indicatorId: string, api: FakeApiClient, section = numeratorSection) {
  return loadNumeratorDenominator(
    {
      context: context(api),
      params: { id: indicatorId },
      request: new Request(`https://internal.test/publish/indicators/${indicatorId}/numerator`),
    } as never,
    section,
  );
}

function submit(
  fields: Record<string, string>,
  sources: { providerId: string; sourceId: string | null }[],
  api: FakeApiClient,
) {
  const body = new URLSearchParams({ ...fields, version: SHOWN_VERSION });
  sources.forEach(({ providerId, sourceId }, index) => {
    body.set(sourceFieldName(index, 'providerId'), providerId);
    body.set(sourceFieldName(index, 'sourceId'), sourceId ?? '');
  });

  return submitNumeratorDenominator(
    {
      context: context(api),
      params: { id },
      request: new Request(`https://internal.test/publish/indicators/${id}/numerator`, {
        method: 'POST',
        body,
      }),
    } as never,
    numeratorSection,
  );
}

function isRedirectToTaskList(outcome: unknown) {
  return (
    outcome instanceof Response &&
    outcome.status === 302 &&
    outcome.headers.get('location') === `/publish/indicators/${id}/task-list`
  );
}

const nothingChosen = { providerId: '', sourceId: '' };

describe('loadNumeratorDenominator', () => {
  it("fills the form with the draft's answers, nothing chosen, and the providers offered", async () => {
    const api = getting({ sources: [mortality], definition: 'Deaths' });

    await expect(load(id, api)).resolves.toEqual({
      id,
      providers,
      values: { sources: [mortality], definition: 'Deaths', ...nothingChosen },
      version: SHOWN_VERSION,
    });
    expect(api.calls.map(({ path }) => path).sort()).toEqual([providersPath, sectionPath]);
  });

  it("reads the denominator's answers from its own endpoint", async () => {
    const api = getting(
      { sources: [], definition: null },
      `/api/internal/indicators/${id}/denominator`,
    );

    await expect(load(id, api, denominatorSection)).resolves.toMatchObject({
      values: { sources: [], definition: '' },
    });
  });

  it('answers 404 to a malformed id without asking the API for anything', async () => {
    const api = createFakeApiClient();

    await expect(load('108', api)).rejects.toSatisfy(isNotFound);
    expect(api.calls).toEqual([]);
  });
});

describe('submitNumeratorDenominator', () => {
  it("shows the chosen provider's sources without saving anything", async () => {
    const api = submitting();

    const outcome = await submit(
      { intent: SHOW_SOURCES_INTENT, providerId: ons.id, sourceId: '', definition: 'Deaths' },
      [],
      api,
    );

    expect(outcome).toEqual({
      values: { sources: [], definition: 'Deaths', providerId: ons.id, sourceId: '' },
      fieldErrors: {},
      version: SHOWN_VERSION,
    });
    expect(saves(api)).toEqual([]);
  });

  it('asks for a provider when Show sources is selected with none chosen', async () => {
    const outcome = await submit(
      { intent: SHOW_SOURCES_INTENT, ...nothingChosen },
      [],
      submitting(),
    );

    expect(outcome).toMatchObject({ fieldErrors: { providerId: 'Select a data provider' } });
  });

  it('adds the chosen provider and source without saving anything, clearing the selects', async () => {
    const api = submitting();

    const outcome = await submit(
      { intent: ADD_INTENT, providerId: estimated.id, sourceId: 'none', definition: '' },
      [mortality],
      api,
    );

    expect(outcome).toEqual({
      values: { sources: [mortality, estimatedAlone], definition: '', ...nothingChosen },
      fieldErrors: {},
      version: SHOWN_VERSION,
    });
    expect(saves(api)).toEqual([]);
  });

  it('refuses to add a provider with no source chosen, keeping the page as sent', async () => {
    const fields = { intent: ADD_INTENT, providerId: ons.id, sourceId: '', definition: '' };

    const outcome = await submit(fields, [], submitting());

    expect(outcome).toEqual({
      values: { sources: [], definition: '', providerId: ons.id, sourceId: '' },
      fieldErrors: { sourceId: 'Select a source, or No specific source' },
      version: SHOWN_VERSION,
    });
  });

  it('removes a source without saving anything', async () => {
    const api = submitting();

    const outcome = await submit({ intent: removeIntent(0) }, [mortality, estimatedAlone], api);

    expect(outcome).toMatchObject({ values: { sources: [estimatedAlone] }, fieldErrors: {} });
    expect(saves(api)).toEqual([]);
  });

  it('saves the sources and definition on Continue and returns to the task list', async () => {
    const api = saving();

    const outcome = await submit(
      { definition: ' Deaths ', ...nothingChosen },
      [mortality, estimatedAlone],
      api,
    );

    expect(saves(api)[0]?.body).toEqual({
      answers: {
        sources: [mortality, estimatedAlone],
        definition: 'Deaths',
      },
      version: SHOWN_VERSION,
    });
    expect(outcome).toSatisfy(isRedirectToTaskList);
  });

  it('saves a provider and source chosen but not added along with the others', async () => {
    const api = saving();

    await submit(
      { definition: 'Deaths', providerId: estimated.id, sourceId: 'none' },
      [mortality],
      api,
    );

    expect(saves(api)[0]?.body).toEqual({
      answers: {
        sources: [mortality, estimatedAlone],
        definition: 'Deaths',
      },
      version: SHOWN_VERSION,
    });
  });

  it('saves nothing while the answers are refused', async () => {
    const api = submitting();

    const outcome = await submit({ definition: '', ...nothingChosen }, [], api);

    expect(outcome).toEqual({
      values: { sources: [], definition: '', ...nothingChosen },
      fieldErrors: {
        sources: 'Add at least one data provider for the numerator',
        definition: 'Enter the definition of the numerator',
      },
      version: SHOWN_VERSION,
    });
    expect(saves(api)).toEqual([]);
  });

  it('shows the rest of the refusals with a chosen source that cannot be added', async () => {
    const api = submitting();
    const fields = { definition: ' ', providerId: ons.id, sourceId: '' };

    const outcome = await submit(fields, [mortality], api);

    expect(outcome).toEqual({
      values: { sources: [mortality], ...fields },
      fieldErrors: {
        sourceId: 'Select a source, or No specific source',
        definition: 'Enter the definition of the numerator',
      },
      version: SHOWN_VERSION,
    });
    expect(saves(api)).toEqual([]);
  });

  it('leaves out asking for a provider when the chosen one cannot be added', async () => {
    const fields = { definition: 'Deaths', providerId: ons.id, sourceId: '' };

    const outcome = await submit(fields, [], submitting());

    expect(outcome).toEqual({
      values: { sources: [], ...fields },
      fieldErrors: { sourceId: 'Select a source, or No specific source' },
      version: SHOWN_VERSION,
    });
  });

  it.each([
    ['a malformed source', [{ providerId: 'not-an-id', sourceId: null }]],
    ['a source the providers do not offer', [{ providerId: estimated.id, sourceId: ons.id }]],
  ])('refuses %s, which the page never sends', async (_, sources) => {
    await expect(submit({ intent: ADD_INTENT }, sources, submitting())).rejects.toSatisfy(
      isBadRequest,
    );
  });
});
