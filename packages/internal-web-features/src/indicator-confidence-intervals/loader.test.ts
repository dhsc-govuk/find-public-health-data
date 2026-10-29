import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
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

function context(client: Partial<ApiClient>) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, client as ApiClient);
  return provider;
}

function load(indicatorId: string, get: ApiClient['get']) {
  return loadConfidenceIntervals({
    context: context({ get }),
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
    const get = vi.fn((path: string) =>
      Promise.resolve(
        path === sectionPath
          ? {
              answers: {
                ciMethodId: methodId,
                hasCiMethodModifications: 'no',
                ciMethodModificationsDetail: null,
                ciMethodDetail: null,
              },
              version: SHOWN_VERSION,
            }
          : methods,
      ),
    );

    const outcome = await load(id, get as unknown as ApiClient['get']);

    expect(get.mock.calls.map(([path]) => path).sort()).toEqual([
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
    const get = vi.fn();

    await expect(load('108', get)).rejects.toSatisfy(isNotFound);
    expect(get).not.toHaveBeenCalled();
  });
});
