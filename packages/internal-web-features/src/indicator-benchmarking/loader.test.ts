import {
  type PolicyGoalFormValues,
  type PolicyGoalPart,
  policyGoalFieldName,
} from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient, refused } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SAVED_VERSION, SHOWN_VERSION } from '../testing.ts';
import { loadBenchmarking, submitBenchmarking } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/benchmarking`;

const blank: PolicyGoalFormValues = {
  lowerComparison: '',
  lowerValue: '',
  upperComparison: '',
  upperValue: '',
  polarity: '',
  detail: '',
};

const target: PolicyGoalFormValues = {
  lowerComparison: 'less-than',
  lowerValue: '90',
  upperComparison: 'more-than-or-equal',
  upperValue: '95',
  polarity: 'higher-is-better',
  detail: 'The national target.',
};

const storedTarget = {
  lowerComparison: 'less-than',
  lowerValue: 90,
  upperComparison: 'more-than-or-equal',
  upperValue: 95,
  polarity: 'higher-is-better',
  policyDetail: 'The national target.',
};

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

function load(api: FakeApiClient) {
  return loadBenchmarking({
    context: context(api),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/benchmarking`),
  } as never);
}

/** Sends the form as a browser would: a radio with no choice is not sent at all. */
function submit(fields: [string, string][], goals: PolicyGoalFormValues[], api: FakeApiClient) {
  const body = new URLSearchParams([...fields, ['version', SHOWN_VERSION]]);
  goals.forEach((goal, index) => {
    for (const [part, value] of Object.entries(goal)) {
      if (part === 'polarity' && value === '') continue;
      body.append(policyGoalFieldName(index, part as PolicyGoalPart), value);
    }
  });

  return submitBenchmarking({
    context: context(api),
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/benchmarking`, {
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

describe('loadBenchmarking', () => {
  it("fills the form with the draft's answers, each value as text", async () => {
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: {
        answers: { hasGoalBenchmark: 'yes', goals: [storedTarget] },
        version: SHOWN_VERSION,
      },
    });

    await expect(load(api)).resolves.toEqual({
      id,
      values: { hasGoalBenchmark: 'yes', goals: [target] },
      version: SHOWN_VERSION,
    });
  });

  it('offers one blank goal while the draft holds none', async () => {
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: {
        answers: { hasGoalBenchmark: null, goals: [] },
        version: SHOWN_VERSION,
      },
    });

    await expect(load(api)).resolves.toMatchObject({
      values: { hasGoalBenchmark: '', goals: [blank] },
    });
  });
});

describe('submitBenchmarking', () => {
  it('adds a goal without saving anything, answering Yes', async () => {
    const api = createFakeApiClient();

    const outcome = await submit([['intent', 'add']], [target], api);

    expect(outcome).toMatchObject({
      values: { hasGoalBenchmark: 'yes', goals: [target, blank] },
      fieldErrors: {},
    });
    expect(api.calls).toEqual([]);
  });

  it('removes a goal without saving anything', async () => {
    const api = createFakeApiClient();

    const outcome = await submit(
      [
        ['hasGoalBenchmark', 'yes'],
        ['intent', 'remove-0'],
      ],
      [blank, target],
      api,
    );

    expect(outcome).toMatchObject({ values: { goals: [target] }, fieldErrors: {} });
    expect(api.calls).toEqual([]);
  });

  it('saves the answers on Continue and returns to the task list', async () => {
    const api = createFakeApiClient({
      [`PUT ${sectionPath}`]: {
        answers: { hasGoalBenchmark: 'yes', goals: [storedTarget] },
        version: SAVED_VERSION,
      },
    });

    const outcome = await submit([['hasGoalBenchmark', 'yes']], [target], api);

    expect(api.calls[0]?.body).toEqual({
      answers: { hasGoalBenchmark: 'yes', goals: [target] },
      version: SHOWN_VERSION,
    });
    expect(outcome).toSatisfy(isRedirectToTaskList);
  });

  it('saves nothing while the answers are refused, keying a goal refusal by its row', async () => {
    const api = createFakeApiClient();

    const outcome = await submit([['hasGoalBenchmark', 'yes']], [target, blank], api);

    expect(outcome).toEqual({
      values: { hasGoalBenchmark: 'yes', goals: [target, blank] },
      fieldErrors: {
        [policyGoalFieldName(1, 'lowerComparison')]:
          'Select the comparison for the lower goal value for policy goal 2',
        [policyGoalFieldName(1, 'lowerValue')]: 'Enter the lower goal value for policy goal 2',
        [policyGoalFieldName(1, 'polarity')]: 'Select the polarity of the goal for policy goal 2',
      },
      version: SHOWN_VERSION,
    });
    expect(api.calls).toEqual([]);
  });

  it('shows what the API refused, keeping the page as sent', async () => {
    const api = createFakeApiClient({
      [`PUT ${sectionPath}`]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { hasGoalBenchmark: 'Refused by the API' },
      }),
    });

    await expect(submit([['hasGoalBenchmark', 'no']], [blank], api)).resolves.toMatchObject({
      fieldErrors: { hasGoalBenchmark: 'Refused by the API' },
    });
  });
});
