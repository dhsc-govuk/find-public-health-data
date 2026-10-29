import { type AgeRangeFormValues, ageRangeFieldName } from '@fphd/internal-api-features/contract';
import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import { loadSexAndAges, submitSexAndAges } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/sex-and-ages`;

const blank: AgeRangeFormValues = {
  lowerLimit: '',
  lowerLimitUnit: '',
  upperLimit: '',
  upperLimitUnit: '',
};
const sixteenPlus = { ...blank, lowerLimit: '16', lowerLimitUnit: 'years' };

const unanswered = {
  sexes: [],
  ageType: null,
  ageRanges: [],
  specificAge: null,
  specificAgeUnit: null,
  ageDetail: null,
};

function context(client: Partial<ApiClient>) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, client as ApiClient);
  return provider;
}

function load(indicatorId: string, get: ApiClient['get']) {
  return loadSexAndAges({
    context: context({ get }),
    params: { id: indicatorId },
    request: new Request(`https://internal.test/publish/indicators/${indicatorId}/sex-and-ages`),
  } as never);
}

function submit(fields: [string, string][], ranges: AgeRangeFormValues[], put: ApiClient['put']) {
  const body = new URLSearchParams([...fields, ['version', SHOWN_VERSION]]);
  ranges.forEach((range, index) => {
    for (const [part, value] of Object.entries(range)) {
      body.append(ageRangeFieldName(index, part as keyof AgeRangeFormValues), value);
    }
  });

  return submitSexAndAges({
    context: context({ put }),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/sex-and-ages`, {
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

describe('loadSexAndAges', () => {
  it("fills the form with the draft's answers, each age as text", async () => {
    const get = vi.fn().mockResolvedValue({
      answers: {
        ...unanswered,
        sexes: ['persons'],
        ageType: 'range',
        ageRanges: [
          { lowerLimit: 16, lowerLimitUnit: 'years', upperLimit: null, upperLimitUnit: null },
        ],
      },
      version: SHOWN_VERSION,
    });

    await expect(load(id, get)).resolves.toEqual({
      id,
      values: {
        sexes: ['persons'],
        ageType: 'range',
        ageRanges: [sixteenPlus],
        specificAge: '',
        specificAgeUnit: '',
        ageDetail: '',
      },
      version: SHOWN_VERSION,
    });
    expect(get.mock.calls[0]?.[0]).toBe(sectionPath);
  });

  it('offers one blank range while the draft holds none', async () => {
    const get = vi.fn().mockResolvedValue({ answers: unanswered, version: SHOWN_VERSION });

    await expect(load(id, get)).resolves.toMatchObject({
      values: { sexes: [], ageType: '', ageRanges: [blank] },
    });
  });
});

describe('submitSexAndAges', () => {
  it('adds a range without saving anything', async () => {
    const put = vi.fn();

    const outcome = await submit([['intent', 'add']], [sixteenPlus], put);

    expect(outcome).toMatchObject({
      values: { ageType: 'range', ageRanges: [sixteenPlus, blank] },
      fieldErrors: {},
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('removes a range without saving anything', async () => {
    const put = vi.fn();

    const outcome = await submit([['intent', 'remove-1']], [sixteenPlus, blank], put);

    expect(outcome).toMatchObject({ values: { ageRanges: [sixteenPlus] }, fieldErrors: {} });
    expect(put).not.toHaveBeenCalled();
  });

  it('saves the answers on Continue and returns to the task list', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: {} });

    const outcome = await submit(
      [
        ['sexes', 'males'],
        ['sexes', 'persons'],
        ['ageType', 'range'],
      ],
      [sixteenPlus],
      put,
    );

    expect(put.mock.calls[0]?.[0]).toBe(sectionPath);
    expect(put.mock.calls[0]?.[1]).toEqual({
      answers: {
        sexes: ['persons', 'males'],
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
    const put = vi.fn();

    const outcome = await submit([['ageType', 'range']], [sixteenPlus, blank], put);

    expect(outcome).toEqual({
      values: {
        sexes: [],
        ageType: 'range',
        ageRanges: [sixteenPlus, blank],
        specificAge: '',
        specificAgeUnit: '',
        ageDetail: '',
      },
      fieldErrors: {
        sexes: 'Select sexes included',
        [ageRangeFieldName(1, 'lowerLimit')]:
          'You must enter at least a lower or upper limit for range 2',
      },
      version: SHOWN_VERSION,
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('shows what the API refused, keeping the page as sent', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'validation_failed', fieldErrors: { ageType: 'Refused by the API' } },
    });

    await expect(
      submit(
        [
          ['sexes', 'persons'],
          ['ageType', 'other'],
          ['ageDetail', 'Year 6'],
        ],
        [],
        put,
      ),
    ).resolves.toMatchObject({ fieldErrors: { ageType: 'Refused by the API' } });
  });
});
