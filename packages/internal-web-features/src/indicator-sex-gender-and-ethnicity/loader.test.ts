import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient, refused } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SAVED_VERSION, SHOWN_VERSION } from '../testing.ts';
import { loadSexGenderAndEthnicity, submitSexGenderAndEthnicity } from './loader.ts';

const id = '00000000-0000-7000-8000-000000000001';
const sectionPath = `/api/internal/indicators/${id}/sex-gender-and-ethnicity`;

const unanswered = {
  demographics: [],
  sexes: [],
  genders: [],
  ethnicGroups: [],
};

function context(api: FakeApiClient) {
  const provider = new RouterContextProvider();
  provider.set(apiContext, api);
  return provider;
}

function load(indicatorId: string, api: FakeApiClient) {
  return loadSexGenderAndEthnicity({
    context: context(api),
    params: { id: indicatorId },
    request: new Request(
      `https://internal.test/publish/indicators/${indicatorId}/sex-gender-and-ethnicity`,
    ),
  } as never);
}

function submit(fields: [string, string][], api: FakeApiClient) {
  const body = new URLSearchParams([...fields, ['version', SHOWN_VERSION]]);

  return submitSexGenderAndEthnicity({
    context: context(api),
    params: { id },
    request: new Request(
      `https://internal.test/publish/indicators/${id}/sex-gender-and-ethnicity`,
      {
        method: 'POST',
        body,
      },
    ),
  } as never);
}

function isRedirectToTaskList(outcome: unknown) {
  return (
    outcome instanceof Response &&
    outcome.status === 302 &&
    outcome.headers.get('location') === `/publish/indicators/${id}/task-list`
  );
}

describe('loadSexGenderAndEthnicity', () => {
  it("fills the form with the draft's answers", async () => {
    const api = createFakeApiClient({
      [`GET ${sectionPath}`]: {
        answers: {
          ...unanswered,
          demographics: ['sex', 'gender'],
          sexes: ['persons'],
          genders: ['non-binary'],
        },
        version: SHOWN_VERSION,
      },
    });

    await expect(load(id, api)).resolves.toEqual({
      id,
      values: {
        demographics: ['sex', 'gender'],
        sexes: ['persons'],
        genders: ['non-binary'],
        ethnicGroups: [],
      },
      version: SHOWN_VERSION,
    });
  });
});

describe('submitSexGenderAndEthnicity', () => {
  it('saves the answers on Continue and returns to the task list', async () => {
    const api = createFakeApiClient({
      [`PUT ${sectionPath}`]: {
        answers: { ...unanswered, sexes: ['persons', 'males'] },
        version: SAVED_VERSION,
      },
    });

    const outcome = await submit(
      [
        ['demographics', 'sex'],
        ['sexes', 'males'],
        ['sexes', 'persons'],
        ['genders', 'other'],
      ],
      api,
    );

    expect(api.calls[0]?.body).toEqual({
      answers: {
        demographics: ['sex'],
        sexes: ['persons', 'males'],
        genders: ['other'],
        ethnicGroups: [],
      },
      version: SHOWN_VERSION,
    });
    expect(outcome).toSatisfy(isRedirectToTaskList);
  });

  it('saves nothing while the answers are refused', async () => {
    const api = createFakeApiClient();

    const outcome = await submit([['demographics', 'sex']], api);

    expect(outcome).toEqual({
      values: {
        demographics: ['sex'],
        sexes: [],
        genders: [],
        ethnicGroups: [],
      },
      fieldErrors: { sexes: 'Select the sexes included' },
      version: SHOWN_VERSION,
    });
    expect(api.calls).toEqual([]);
  });

  it('shows what the API refused, keeping the page as sent', async () => {
    const api = createFakeApiClient({
      [`PUT ${sectionPath}`]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { sexes: 'Refused by the API' },
      }),
    });

    await expect(
      submit(
        [
          ['demographics', 'sex'],
          ['sexes', 'persons'],
        ],
        api,
      ),
    ).resolves.toMatchObject({ fieldErrors: { sexes: 'Refused by the API' } });
  });
});
