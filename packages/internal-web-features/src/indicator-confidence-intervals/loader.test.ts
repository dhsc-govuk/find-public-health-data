import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SHOWN_VERSION } from '../testing.ts';
import { loadConfidenceIntervals } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/confidence-intervals`;
const methodId = '019fa38f-073f-764e-9ac6-1c4d03b1cb92';

const methods = [
  { id: methodId, name: "Byar's method", description: 'A description.', kind: 'standard' },
];

const unanswered = {
  ciMethodId: '',
  hasCiMethodModifications: '',
  ciMethodModificationsDetail: '',
  ciMethodDetail: '',
};

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

function load(indicatorId: string, api: FakeApiClient) {
  return loadConfidenceIntervals({
    context: context(api),
    params: { id: indicatorId },
    request: new Request(
      `https://internal.test/publish/indicators/${indicatorId}/confidence-intervals`,
    ),
  } as never);
}

function isNotFound(error: unknown) {
  return error instanceof Response && error.status === 404;
}

describe('loadConfidenceIntervals', () => {
  it("fills the form with the draft's answers and offers every method", async () => {
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: {
        answers: {
          ciMethodId: methodId,
          hasCiMethodModifications: 'no',
          ciMethodModificationsDetail: null,
          ciMethodDetail: null,
        },
        version: SHOWN_VERSION,
      },
      'GET /api/internal/ci-methods': methods,
    });

    const outcome = await load(id, api);

    expect(api.calls.map(({ path }) => path).sort()).toEqual([
      '/api/internal/ci-methods',
      sectionPath,
    ]);
    expect(outcome).toEqual({
      id,
      values: { ...unanswered, ciMethodId: methodId, hasCiMethodModifications: 'no' },
      version: SHOWN_VERSION,
      methods,
    });
  });

  it('answers 404 to a malformed id without asking the API for anything', async () => {
    const api = createFakeApiClient();

    await expect(load('108', api)).rejects.toSatisfy(isNotFound);
    expect(api.calls).toEqual([]);
  });
});
