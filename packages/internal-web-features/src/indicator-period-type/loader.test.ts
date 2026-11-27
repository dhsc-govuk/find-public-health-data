import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient, refused } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SAVED_VERSION, SHOWN_VERSION } from '../testing.ts';
import { loadPeriodType, submitPeriodType } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/period-type`;

const unansweredText = {
  multipleYearsCount: null,
  multipleYearsYearType: null,
  multipleYearsEndDay: null,
  multipleYearsEndMonth: null,
  yearType: null,
  yearEndDay: null,
  yearEndMonth: null,
  dateRangeStartDay: null,
  dateRangeStartMonth: null,
  dateRangeEndDay: null,
  dateRangeEndMonth: null,
  periodsRolling: null,
  rollingFrequency: null,
  valuesCumulative: null,
  publishedFrom: null,
};

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

function load(api: FakeApiClient) {
  return loadPeriodType({
    context: context(api),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/period-type`),
  } as never);
}

function submit(fields: [string, string][], api: FakeApiClient) {
  return submitPeriodType({
    context: context(api),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/period-type`, {
      method: 'POST',
      body: new URLSearchParams([...fields, ['version', SHOWN_VERSION]]),
    }),
  } as never);
}

const quarterly: [string, string][] = [
  ['timePeriods', 'quarters'],
  ['periodsRolling', 'no'],
  ['valuesCumulative', 'yes'],
];

describe('loadPeriodType', () => {
  it("fills the form with the draft's answers, unanswered ones blank", async () => {
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: {
        answers: { ...unansweredText, timePeriods: ['single-years'], yearType: 'financial' },
        version: SHOWN_VERSION,
      },
    });

    const { values } = await load(api);

    expect(values).toMatchObject({
      timePeriods: ['single-years'],
      yearType: 'financial',
      yearEndDay: '',
      periodsRolling: '',
    });
  });
});

describe('submitPeriodType', () => {
  it('saves the answers on Continue and returns to the task list', async () => {
    const api = createFakeApiClient({
      [`PUT ${sectionPath}`]: {
        answers: { ...unansweredText, timePeriods: ['quarters'] },
        version: SAVED_VERSION,
      },
    });

    const outcome = await submit(quarterly, api);

    expect(api.calls[0]?.body).toMatchObject({
      answers: { timePeriods: ['quarters'], periodsRolling: 'no', valuesCumulative: 'yes' },
      version: SHOWN_VERSION,
    });
    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).headers.get('location')).toBe(
      `/publish/indicators/${id}/task-list`,
    );
  });

  it('saves nothing while the answers are refused', async () => {
    const api = createFakeApiClient();

    const outcome = await submit([['timePeriods', 'single-years'], ...quarterly.slice(1)], api);

    expect(outcome).toMatchObject({
      values: { timePeriods: ['single-years'] },
      fieldErrors: { yearType: 'Select the year type' },
    });
    expect(api.calls).toEqual([]);
  });

  it('shows what the API refused, keeping the page as sent', async () => {
    const api = createFakeApiClient({
      [`PUT ${sectionPath}`]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { timePeriods: 'Refused by the API' },
      }),
    });

    await expect(submit(quarterly, api)).resolves.toMatchObject({
      fieldErrors: { timePeriods: 'Refused by the API' },
    });
  });
});
