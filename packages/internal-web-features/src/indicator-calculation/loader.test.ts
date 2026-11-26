import type { CalculationValueType as ValueType } from '@fphd/internal-api-features/contract';
import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SHOWN_VERSION, savedSection } from '../testing.ts';
import { loadCalculation, saveCalculation } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const SECTION = `/api/internal/indicators/${id}/calculation` as const;

const unanswered = {
  standardMethodUsed: null,
  methodology: null,
  calculatedBy: null,
  calculatedByDetail: null,
};

const proportion: ValueType = { id: VALUE_TYPE_IDS.proportion, name: 'Proportion' };
const score: ValueType = { id: VALUE_TYPE_IDS.score, name: 'Score' };

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

function load(api: FakeApiClient) {
  return loadCalculation({
    context: context(api),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/calculation`),
  } as never);
}

function save(api: FakeApiClient, body: Record<string, string>) {
  return saveCalculation({
    context: context(api),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/calculation`, {
      method: 'POST',
      body: new URLSearchParams({ ...body, version: SHOWN_VERSION }),
    }),
  } as never);
}

/** An API whose draft has the value type, and which saves whatever it is sent. */
function draftOf(valueType: ValueType | null) {
  return createFakeApiClient({
    [`GET ${SECTION}`]: { answers: unanswered, version: SHOWN_VERSION, valueType },
    [`PUT ${SECTION}`]: savedSection,
  });
}

describe('loadCalculation', () => {
  it("fills the form with the draft's answers beside its value type and standard method", async () => {
    const outcome = await load(draftOf(proportion));

    expect(outcome).toEqual({
      id,
      values: { standardMethodUsed: '', methodology: '', calculatedBy: '', calculatedByDetail: '' },
      version: SHOWN_VERSION,
      valueType: {
        name: 'Proportion',
        standardMethod:
          'The numerator is divided by the denominator. It can then be multiplied by 100 to be presented as a percentage.',
      },
    });
  });

  it('gives a value type with no standard method none', async () => {
    const outcome = await load(draftOf(score));

    expect(outcome.valueType).toEqual({ name: 'Score', standardMethod: null });
  });

  it('gives no value type while the draft has none', async () => {
    const outcome = await load(draftOf(null));

    expect(outcome.valueType).toBeNull();
  });
});

describe('saveCalculation', () => {
  const ohid = { calculatedBy: 'ohid', calculatedByDetail: '' };

  it("refuses the answers by the draft's value type before sending them", async () => {
    const api = draftOf(score);

    const outcome = await save(api, ohid);

    expect(api.calls.map(({ method }) => method)).toEqual(['GET']);
    expect(outcome).toMatchObject({ fieldErrors: { methodology: 'Enter the methodology' } });
  });

  it('asks whether the standard method was used beside every other refusal', async () => {
    const outcome = await save(draftOf(proportion), {});

    expect(outcome).toMatchObject({
      fieldErrors: {
        standardMethodUsed:
          'Select whether the described standard method was used for this indicator',
        calculatedBy: 'Select who calculated the indicator',
      },
    });
  });

  it('saves who calculated the indicator before a value type is chosen', async () => {
    const api = draftOf(null);

    const outcome = await save(api, ohid);

    expect(api.calls.at(-1)).toEqual({
      method: 'PUT',
      path: SECTION,
      body: {
        answers: { standardMethodUsed: '', methodology: '', ...ohid },
        version: SHOWN_VERSION,
      },
    });
    expect((outcome as Response).headers.get('location')).toBe(
      `/publish/indicators/${id}/task-list`,
    );
  });
});
