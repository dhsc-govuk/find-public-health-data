import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SHOWN_VERSION } from '../testing.ts';
import { loadValueTypeAndUnits } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/value-type-and-units`;
const valueTypeId = '01a0d8a5-3ca2-7315-bfca-96d2031a65e7';
const unitId = '01a0d8a5-3ca2-7315-bfca-96d615820bd4';

const options = {
  valueTypes: [{ id: valueTypeId, name: 'Proportion' }],
  units: [{ id: unitId, name: '%' }],
};

const unanswered = {
  valueTypeId: '',
  standardPopulation: '',
  standardPopulationOther: '',
  referencePopulation: '',
  unitId: '',
  unitDetail: '',
};

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

function load(indicatorId: string, api: FakeApiClient) {
  return loadValueTypeAndUnits({
    context: context(api),
    params: { id: indicatorId },
    request: new Request(
      `https://internal.test/publish/indicators/${indicatorId}/value-type-and-units`,
    ),
  } as never);
}

function isNotFound(error: unknown) {
  return error instanceof Response && error.status === 404;
}

describe('loadValueTypeAndUnits', () => {
  it("fills the form with the draft's answers and offers every value type and unit", async () => {
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: {
        answers: {
          valueTypeId,
          standardPopulation: null,
          standardPopulationOther: null,
          referencePopulation: null,
          unitId,
          unitDetail: null,
        },
        version: SHOWN_VERSION,
      },
      'GET /api/internal/value-types-and-units': options,
    });

    const outcome = await load(id, api);

    expect(api.calls.map(({ path }) => path).sort()).toEqual([
      sectionPath,
      '/api/internal/value-types-and-units',
    ]);
    expect(outcome).toEqual({
      id,
      values: { ...unanswered, valueTypeId, unitId },
      version: SHOWN_VERSION,
      ...options,
    });
  });

  it('answers 404 to a malformed id without asking the API for anything', async () => {
    const api = createFakeApiClient();

    await expect(load('108', api)).rejects.toSatisfy(isNotFound);
    expect(api.calls).toEqual([]);
  });
});
