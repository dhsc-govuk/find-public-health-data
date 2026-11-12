import { TEAM_IDS } from '@fphd/auth';
import { indicatorCreateIdSchema } from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient, fails, refused } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { signedInContext } from '../session.testing.ts';
import { indicatorDetail, SHOWN_VERSION } from '../testing.ts';
import {
  createIndicator,
  loadIndicatorName,
  loadNewIndicator,
  NAME_CHANGED,
  saveIndicatorName,
} from './loader.ts';

const created = indicatorDetail();
const CREATE = 'POST /api/internal/indicators';
const DETAIL = `/api/internal/indicators/${created.id}` as const;

// The id the name page minted for the new indicator.
const NEW_ID = '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b';

async function submit(
  name: string,
  api: FakeApiClient,
  {
    teams = [TEAM_IDS.teamA],
    url = 'https://internal.test/publish/indicators/new',
    id = NEW_ID,
  }: { teams?: readonly string[]; url?: string; id?: string | null } = {},
) {
  const context = await signedInContext(['publisher'], teams);
  context.set(apiContext, api);

  const body = new URLSearchParams(id === null ? { name } : { name, id });

  return createIndicator({
    context,
    params: {},
    request: new Request(url, { method: 'POST', body }),
  } as never);
}

async function loadNew(url: string, teams: readonly string[]) {
  return loadNewIndicator({
    context: await signedInContext(['publisher'], teams),
    params: {},
    request: new Request(url),
  } as never);
}

function redirectsTo(location: string) {
  return (thrown: unknown) =>
    thrown instanceof Response &&
    thrown.status === 302 &&
    thrown.headers.get('location') === location;
}

const NEW_URL = 'https://internal.test/publish/indicators/new';
const TEAM_PAGE = '/publish/indicators/new/team';

describe('loadNewIndicator', () => {
  it('asks a publisher in one team for the name, with no team to choose', async () => {
    await expect(loadNew(NEW_URL, [TEAM_IDS.teamB])).resolves.toEqual({ id: expect.any(String) });
  });

  it('asks a publisher in several teams for the name once they have chosen one', async () => {
    const url = `${NEW_URL}?team=${TEAM_IDS.teamB}`;

    await expect(loadNew(url, [TEAM_IDS.teamA, TEAM_IDS.teamB])).resolves.toEqual({
      id: expect.any(String),
    });
  });

  it('mints a new UUIDv7 for the indicator each time it shows the page', async () => {
    const first = await loadNew(NEW_URL, [TEAM_IDS.teamB]);
    const second = await loadNew(NEW_URL, [TEAM_IDS.teamB]);

    expect(indicatorCreateIdSchema.safeParse(first).success).toBe(true);
    expect(second.id).not.toBe(first.id);
  });

  it('sends a publisher in several teams to choose one first', async () => {
    await expect(loadNew(NEW_URL, [TEAM_IDS.teamA, TEAM_IDS.teamB])).rejects.toSatisfy(
      redirectsTo(TEAM_PAGE),
    );
  });

  it('sends a publisher whose address names a team not theirs to choose one', async () => {
    const url = `${NEW_URL}?team=${TEAM_IDS.teamC}`;

    await expect(loadNew(url, [TEAM_IDS.teamA, TEAM_IDS.teamB])).rejects.toSatisfy(
      redirectsTo(TEAM_PAGE),
    );
  });

  it('answers 404 to a publisher in no team, who has nowhere to put an indicator', async () => {
    await expect(loadNew(NEW_URL, [])).rejects.toSatisfy(isNotFound);
  });
});

function accepts() {
  return createFakeApiClient({ [CREATE]: created });
}

describe('createIndicator', () => {
  it('creates the indicator and goes on to its task list', async () => {
    const api = accepts();

    const outcome = await submit('Life expectancy at birth', api);

    expect(api.calls).toEqual([
      {
        method: 'POST',
        path: '/api/internal/indicators',
        body: { name: 'Life expectancy at birth', teamId: TEAM_IDS.teamA, id: NEW_ID },
      },
    ]);
    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).status).toBe(302);
    expect((outcome as Response).headers.get('location')).toBe(
      `/publish/indicators/${created.id}/task-list`,
    );
  });

  it('sends the name without its surrounding spaces', async () => {
    const api = accepts();

    await submit('  Life expectancy at birth  ', api);

    expect(api.calls[0]?.body).toEqual({
      name: 'Life expectancy at birth',
      teamId: TEAM_IDS.teamA,
      id: NEW_ID,
    });
  });

  it('creates the indicator in the team chosen, for a publisher in several', async () => {
    const api = accepts();

    await submit('Life expectancy at birth', api, {
      teams: [TEAM_IDS.teamA, TEAM_IDS.teamB],
      url: `${NEW_URL}?team=${TEAM_IDS.teamB}`,
    });

    expect(api.calls[0]?.body).toEqual({
      name: 'Life expectancy at birth',
      teamId: TEAM_IDS.teamB,
      id: NEW_ID,
    });
  });

  it.each([
    ['no id', null],
    ['an id that is not a UUIDv7', '7c9e6679-7425-40de-944b-e07fc1f90ae7'],
  ])('mints an id for a form that sent %s', async (_case, id) => {
    const api = accepts();

    await submit('Life expectancy at birth', api, { id });

    const sent = indicatorCreateIdSchema.parse(api.calls[0]?.body);
    expect(sent.id).not.toBe(id);
  });

  it('shows that nothing was saved when the API finds the id taken', async () => {
    const api = createFakeApiClient({ [CREATE]: refused(409, { error: 'id_taken' }) });

    const outcome = await submit('Life expectancy at birth', api);

    expect(outcome).toEqual({
      values: { name: 'Life expectancy at birth' },
      fieldErrors: {},
      formError: FORM_NOT_SAVED,
    });
  });

  it('sends a publisher in several teams who has not chosen one to choose, creating nothing', async () => {
    const api = createFakeApiClient();

    await expect(
      submit('Life expectancy at birth', api, { teams: [TEAM_IDS.teamA, TEAM_IDS.teamB] }),
    ).rejects.toSatisfy(redirectsTo(TEAM_PAGE));
    expect(api.calls).toEqual([]);
  });

  it.each(['', '   '])('asks for a name of %o without calling the API', async (name) => {
    const api = createFakeApiClient();

    const outcome = await submit(name, api);

    expect(outcome).toEqual({
      values: { name },
      fieldErrors: { name: 'Enter the name of the indicator' },
    });
    expect(api.calls).toEqual([]);
  });

  it('shows what the API refused, keeping what was typed', async () => {
    const api = createFakeApiClient({
      [CREATE]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { name: 'Enter the name of the indicator' },
      }),
    });

    const outcome = await submit('Rejected name', api);

    expect(outcome).toEqual({
      values: { name: 'Rejected name' },
      fieldErrors: { name: 'Enter the name of the indicator' },
    });
  });

  it('shows a name another indicator already holds on the form', async () => {
    const api = createFakeApiClient({
      [CREATE]: refused(409, {
        error: 'slug_taken',
        fieldErrors: { name: 'An indicator with this name already exists' },
      }),
    });

    const outcome = await submit('Life expectancy at birth', api);

    expect(outcome).toEqual({
      values: { name: 'Life expectancy at birth' },
      fieldErrors: { name: 'An indicator with this name already exists' },
    });
  });

  it('reports a refusal that names no field as the form not saved', async () => {
    const api = createFakeApiClient({
      [CREATE]: refused(400, { error: 'validation_failed', fieldErrors: {} }),
    });

    const outcome = await submit('Rejected name', api);

    expect(outcome).toEqual({
      values: { name: 'Rejected name' },
      fieldErrors: {},
      formError: FORM_NOT_SAVED,
    });
  });
});

async function load(id: string, api: FakeApiClient, teams: readonly string[] = [TEAM_IDS.teamA]) {
  const context = await signedInContext(['publisher'], teams);
  context.set(apiContext, api);

  return loadIndicatorName({
    context,
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/name`),
  } as never);
}

function rename(id: string, name: string, api: FakeApiClient) {
  const context = new RouterContextProvider();
  context.set(apiContext, api);

  return saveIndicatorName({
    context,
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/name`, {
      method: 'POST',
      body: new URLSearchParams({ name, version: SHOWN_VERSION }),
    }),
  } as never);
}

function isNotFound(error: unknown) {
  return error instanceof Response && error.status === 404;
}

describe('loadIndicatorName', () => {
  it('fetches the draft the address names', async () => {
    const api = createFakeApiClient({ [`GET ${DETAIL}`]: created });

    const outcome = await load(created.id, api);

    expect(outcome).toEqual({ indicator: created });
  });

  it("answers 404 for another team's draft, which the publisher may not edit", async () => {
    const api = createFakeApiClient({ [`GET ${DETAIL}`]: created });

    await expect(load(created.id, api, [TEAM_IDS.teamB])).rejects.toSatisfy(isNotFound);
  });

  it('answers 404 for a published indicator, which has no name to edit', async () => {
    const api = createFakeApiClient({
      [`GET ${DETAIL}`]: indicatorDetail({
        indicatorStatus: 'live',
        publishedSlug: 'life-expectancy-at-birth',
        draftStatus: null,
      }),
    });

    await expect(load(created.id, api)).rejects.toSatisfy(isNotFound);
  });
});

describe('saveIndicatorName', () => {
  it('renames the draft and returns to the task list', async () => {
    const api = createFakeApiClient({
      [`PATCH ${DETAIL}`]: indicatorDetail({ name: 'Renamed indicator' }),
    });

    const outcome = await rename(created.id, '  Renamed indicator  ', api);

    expect(api.calls).toEqual([
      {
        method: 'PATCH',
        path: DETAIL,
        body: { name: 'Renamed indicator', version: SHOWN_VERSION },
      },
    ]);
    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).headers.get('location')).toBe(
      `/publish/indicators/${created.id}/task-list`,
    );
  });

  it.each(['', '   '])('asks for a name of %o without calling the API', async (name) => {
    const api = createFakeApiClient();

    const outcome = await rename(created.id, name, api);

    expect(outcome).toEqual({
      values: { name },
      fieldErrors: { name: 'Enter the name of the indicator' },
      version: SHOWN_VERSION,
    });
    expect(api.calls).toEqual([]);
  });

  it('shows what the API refused, keeping what was typed', async () => {
    const api = createFakeApiClient({
      [`PATCH ${DETAIL}`]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { name: 'Enter the name of the indicator' },
      }),
    });

    const outcome = await rename(created.id, 'Rejected name', api);

    expect(outcome).toEqual({
      values: { name: 'Rejected name' },
      fieldErrors: { name: 'Enter the name of the indicator' },
      version: SHOWN_VERSION,
    });
  });

  it('shows a name another indicator already holds on the form', async () => {
    const api = createFakeApiClient({
      [`PATCH ${DETAIL}`]: refused(409, {
        error: 'slug_taken',
        fieldErrors: { name: 'An indicator with this name already exists' },
      }),
    });

    const outcome = await rename(created.id, 'Life expectancy at birth', api);

    expect(outcome).toEqual({
      values: { name: 'Life expectancy at birth' },
      fieldErrors: { name: 'An indicator with this name already exists' },
      version: SHOWN_VERSION,
    });
  });

  it('reports a refusal that names no field as the form not saved', async () => {
    const api = createFakeApiClient({
      [`PATCH ${DETAIL}`]: refused(400, { error: 'invalid_id' }),
    });

    const outcome = await rename(created.id, 'Rejected name', api);

    expect(outcome).toEqual({
      values: { name: 'Rejected name' },
      fieldErrors: {},
      formError: FORM_NOT_SAVED,
      version: SHOWN_VERSION,
    });
  });

  it('keeps what was typed when the name changed since, to save against its version now', async () => {
    const version = 'b'.repeat(64);
    const api = createFakeApiClient({
      [`PATCH ${DETAIL}`]: refused(409, { error: 'changed', version }),
    });

    await expect(rename(created.id, 'A better name', api)).resolves.toEqual({
      values: { name: 'A better name' },
      fieldErrors: {},
      formError: NAME_CHANGED,
      version,
    });
  });

  // The API answers 404 when the draft went while the form was open; the client throws it.
  it('lets the not-found page through when the indicator no longer has a draft', async () => {
    const api = createFakeApiClient({
      [`PATCH ${DETAIL}`]: fails(new Response('Not Found', { status: 404 })),
    });

    await expect(rename(created.id, 'Too late', api)).rejects.toSatisfy(isNotFound);
  });
});

describe('the name page of a draft locked for review', () => {
  const path = `https://internal.test/publish/indicators/${created.id}/name`;
  const toOverview = {
    status: 302,
    location: `/dashboard/indicators/${created.id}`,
    flash: 'draft-locked',
  };

  it('sends the publisher who opens it to the overview, saying why', async () => {
    const context = withFlashStorage(await signedInContext(['publisher'], [TEAM_IDS.teamA]));
    context.set(
      apiContext,
      createFakeApiClient({ [`GET ${DETAIL}`]: indicatorDetail({ draftLocked: true }) }),
    );
    const request = new Request(path);

    const response = await flashedResponse(context, request, () =>
      loadIndicatorName({ context, params: { id: created.id }, request } as never),
    );

    expect(await redirectWithFlash(response)).toEqual(toOverview);
  });

  it('sends the publisher whose rename it refuses to the overview, saying why', async () => {
    const context = withFlashStorage(new RouterContextProvider());
    context.set(
      apiContext,
      createFakeApiClient({ [`PATCH ${DETAIL}`]: refused(409, { error: 'locked' }) }),
    );
    const request = new Request(path, {
      method: 'POST',
      body: new URLSearchParams({ name: 'A better name' }),
    });

    const response = await flashedResponse(context, request, () =>
      saveIndicatorName({ context, params: { id: created.id }, request } as never),
    );

    expect(await redirectWithFlash(response)).toEqual(toOverview);
  });
});
