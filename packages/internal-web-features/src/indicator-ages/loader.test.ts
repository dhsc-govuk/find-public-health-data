import { type AgeRangeFormValues, ageRangeFieldName } from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient, refused } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SAVED_VERSION, SHOWN_VERSION } from '../testing.ts';
import { loadAges, submitAges } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/ages`;

const blank: AgeRangeFormValues = {
  lowerLimit: '',
  lowerLimitUnit: '',
  upperLimit: '',
  upperLimitUnit: '',
};
const sixteenPlus = { ...blank, lowerLimit: '16', lowerLimitUnit: 'years' };

const unanswered = {
  ageType: null,
  ageRanges: [],
  specificAge: null,
  specificAgeUnit: null,
  ageDetail: null,
};

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

function load(indicatorId: string, api: FakeApiClient) {
  return loadAges({
    context: context(api),
    params: { id: indicatorId },
    request: new Request(`https://internal.test/publish/indicators/${indicatorId}/ages`),
  } as never);
}

function submit(fields: [string, string][], ranges: AgeRangeFormValues[], api: FakeApiClient) {
  const body = new URLSearchParams([...fields, ['version', SHOWN_VERSION]]);
  ranges.forEach((range, index) => {
    for (const [part, value] of Object.entries(range)) {
      body.append(ageRangeFieldName(index, part as keyof AgeRangeFormValues), value);
    }
  });

  return submitAges({
    context: context(api),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/ages`, {
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

describe('loadAges', () => {
  it("fills the form with the draft's answers, each age as text", async () => {
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: {
        answers: {
          ...unanswered,
          ageType: 'range',
          ageRanges: [
            { lowerLimit: 16, lowerLimitUnit: 'years', upperLimit: null, upperLimitUnit: null },
          ],
        },
        version: SHOWN_VERSION,
      },
    });

    await expect(load(id, api)).resolves.toEqual({
      id,
      values: {
        ageType: 'range',
        ageRanges: [sixteenPlus],
        specificAge: '',
        specificAgeUnit: '',
        ageDetail: '',
      },
      version: SHOWN_VERSION,
    });
  });

  it('offers one blank range while the draft holds none', async () => {
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: { answers: unanswered, version: SHOWN_VERSION },
    });

    await expect(load(id, api)).resolves.toMatchObject({
      values: { ageType: '', ageRanges: [blank] },
    });
  });
});

describe('submitAges', () => {
  it('adds a range without saving anything', async () => {
    const api = createFakeApiClient();

    const outcome = await submit([['intent', 'add']], [sixteenPlus], api);

    expect(outcome).toMatchObject({
      values: { ageType: 'range', ageRanges: [sixteenPlus, blank] },
      fieldErrors: {},
    });
    expect(api.calls).toEqual([]);
  });

  it('removes a range without saving anything', async () => {
    const api = createFakeApiClient();

    const outcome = await submit([['intent', 'remove-1']], [sixteenPlus, blank], api);

    expect(outcome).toMatchObject({ values: { ageRanges: [sixteenPlus] }, fieldErrors: {} });
    expect(api.calls).toEqual([]);
  });

  it('saves the answers on Continue and returns to the task list', async () => {
    const api = createFakeApiClient({
      [`PUT ${sectionPath}`]: {
        answers: {
          ...unanswered,
          ageType: 'range',
          ageRanges: [
            { lowerLimit: 16, lowerLimitUnit: 'years', upperLimit: null, upperLimitUnit: null },
          ],
        },
        version: SAVED_VERSION,
      },
    });

    const outcome = await submit([['ageType', 'range']], [sixteenPlus], api);

    expect(api.calls[0]?.body).toEqual({
      answers: {
        ageType: 'range',
        ageRanges: [sixteenPlus],
        specificAge: '',
        specificAgeUnit: '',
        ageDetail: '',
      },
      version: SHOWN_VERSION,
    });
    expect(outcome).toSatisfy(isRedirectToTaskList);
  });

  it('saves nothing while the answers are refused, keying a range refusal by its row', async () => {
    const api = createFakeApiClient();

    const outcome = await submit([['ageType', 'range']], [sixteenPlus, blank], api);

    expect(outcome).toEqual({
      values: {
        ageType: 'range',
        ageRanges: [sixteenPlus, blank],
        specificAge: '',
        specificAgeUnit: '',
        ageDetail: '',
      },
      fieldErrors: {
        [ageRangeFieldName(1, 'lowerLimit')]:
          'You must enter at least a lower or upper limit for range 2',
      },
      version: SHOWN_VERSION,
    });
    expect(api.calls).toEqual([]);
  });

  it('shows what the API refused, keeping the page as sent', async () => {
    const api = createFakeApiClient({
      [`PUT ${sectionPath}`]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { ageType: 'Refused by the API' },
      }),
    });

    await expect(
      submit(
        [
          ['ageType', 'other'],
          ['ageDetail', 'Year 6'],
        ],
        [],
        api,
      ),
    ).resolves.toMatchObject({ fieldErrors: { ageType: 'Refused by the API' } });
  });
});
