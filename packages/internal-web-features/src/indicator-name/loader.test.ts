import { TEAM_IDS } from '@fphd/auth';
import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { signedInContext } from '../session.testing.ts';
import { SHOWN_VERSION } from '../testing.ts';
import {
  createIndicator,
  loadIndicatorName,
  loadNewIndicator,
  NAME_CHANGED,
  saveIndicatorName,
} from './loader.ts';

const created = {
  id: '00000000-0000-7000-8000-000000000001',
  shortId: 90366,
  name: 'Life expectancy at birth',
  teamId: TEAM_IDS.teamA,
  publishedSlug: null,
  updatedAt: '2026-01-02T00:00:00.000Z',
  indicatorStatus: 'new',
  draftStatus: 'draft',
};

async function submit(
  name: string,
  post: ApiClient['post'],
  {
    teams = [TEAM_IDS.teamA],
    url = 'https://internal.test/publish/indicators/new',
  }: { teams?: readonly string[]; url?: string } = {},
) {
  const context = await signedInContext(['publisher'], teams);
  context.set(apiContext, { post } as unknown as ApiClient);

  const body = new URLSearchParams({ name });

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
    await expect(loadNew(NEW_URL, [TEAM_IDS.teamB])).resolves.toBeNull();
  });

  it('asks a publisher in several teams for the name once they have chosen one', async () => {
    const url = `${NEW_URL}?team=${TEAM_IDS.teamB}`;

    await expect(loadNew(url, [TEAM_IDS.teamA, TEAM_IDS.teamB])).resolves.toBeNull();
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

function accepts(data: unknown = created) {
  return vi.fn().mockResolvedValue({ ok: true, data });
}

describe('createIndicator', () => {
  it('creates the indicator and goes on to its task list', async () => {
    const post = accepts();

    const outcome = await submit('Life expectancy at birth', post);

    expect(post.mock.calls[0]?.[0]).toBe('/api/internal/indicators');
    expect(post.mock.calls[0]?.[1]).toEqual({
      name: 'Life expectancy at birth',
      teamId: TEAM_IDS.teamA,
    });
    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).status).toBe(302);
    expect((outcome as Response).headers.get('location')).toBe(
      `/publish/indicators/${created.id}/task-list`,
    );
  });

  it('sends the name without its surrounding spaces', async () => {
    const post = accepts();

    await submit('  Life expectancy at birth  ', post);

    expect(post.mock.calls[0]?.[1]).toEqual({
      name: 'Life expectancy at birth',
      teamId: TEAM_IDS.teamA,
    });
  });

  it('creates the indicator in the team chosen, for a publisher in several', async () => {
    const post = accepts();

    await submit('Life expectancy at birth', post, {
      teams: [TEAM_IDS.teamA, TEAM_IDS.teamB],
      url: `${NEW_URL}?team=${TEAM_IDS.teamB}`,
    });

    expect(post.mock.calls[0]?.[1]).toEqual({
      name: 'Life expectancy at birth',
      teamId: TEAM_IDS.teamB,
    });
  });

  it('sends a publisher in several teams who has not chosen one to choose, creating nothing', async () => {
    const post = vi.fn();

    await expect(
      submit('Life expectancy at birth', post, { teams: [TEAM_IDS.teamA, TEAM_IDS.teamB] }),
    ).rejects.toSatisfy(redirectsTo(TEAM_PAGE));
    expect(post).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('asks for a name of %o without calling the API', async (name) => {
    const post = vi.fn();

    const outcome = await submit(name, post);

    expect(outcome).toEqual({
      values: { name },
      fieldErrors: { name: 'Enter the name of the indicator' },
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('shows what the API refused, keeping what was typed', async () => {
    const post = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: {
        error: 'validation_failed',
        fieldErrors: { name: 'Enter the name of the indicator' },
      },
    });

    const outcome = await submit('Rejected name', post);

    expect(outcome).toEqual({
      values: { name: 'Rejected name' },
      fieldErrors: { name: 'Enter the name of the indicator' },
    });
  });

  it('shows a name another indicator already holds on the form', async () => {
    const post = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      error: {
        error: 'slug_taken',
        fieldErrors: { name: 'An indicator with this name already exists' },
      },
    });

    const outcome = await submit('Life expectancy at birth', post);

    expect(outcome).toEqual({
      values: { name: 'Life expectancy at birth' },
      fieldErrors: { name: 'An indicator with this name already exists' },
    });
  });

  it('reports a refusal that names no field as the form not saved', async () => {
    const post = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'validation_failed', fieldErrors: {} },
    });

    const outcome = await submit('Rejected name', post);

    expect(outcome).toEqual({
      values: { name: 'Rejected name' },
      fieldErrors: {},
      formError: FORM_NOT_SAVED,
    });
  });
});

async function load(
  id: string,
  get: ApiClient['get'],
  teams: readonly string[] = [TEAM_IDS.teamA],
) {
  const context = await signedInContext(['publisher'], teams);
  context.set(apiContext, { get } as unknown as ApiClient);

  return loadIndicatorName({
    context,
    params: { id },
    request: new Request(`https://internal.test/publish/indicators/${id}/name`),
  } as never);
}

function rename(id: string, name: string, patch: ApiClient['patch']) {
  const context = new RouterContextProvider();
  context.set(apiContext, { patch } as unknown as ApiClient);

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
    const get = vi.fn().mockResolvedValue(created);

    const outcome = await load(created.id, get);

    expect(get.mock.calls[0]?.[0]).toBe(`/api/internal/indicators/${created.id}`);
    expect(outcome).toEqual({ indicator: created });
  });

  it("answers 404 for another team's draft, which the publisher may not edit", async () => {
    const get = vi.fn().mockResolvedValue(created);

    await expect(load(created.id, get, [TEAM_IDS.teamB])).rejects.toSatisfy(isNotFound);
  });

  it('answers 404 for a published indicator, which has no name to edit', async () => {
    const get = vi.fn().mockResolvedValue({ ...created, draftStatus: null });

    await expect(load(created.id, get)).rejects.toSatisfy(isNotFound);
  });
});

describe('saveIndicatorName', () => {
  it('renames the draft and returns to the task list', async () => {
    const patch = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { ...created, name: 'Renamed indicator' } });

    const outcome = await rename(created.id, '  Renamed indicator  ', patch);

    expect(patch.mock.calls[0]?.[0]).toBe(`/api/internal/indicators/${created.id}`);
    expect(patch.mock.calls[0]?.[1]).toEqual({
      name: 'Renamed indicator',
      version: SHOWN_VERSION,
    });
    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).headers.get('location')).toBe(
      `/publish/indicators/${created.id}/task-list`,
    );
  });

  it.each(['', '   '])('asks for a name of %o without calling the API', async (name) => {
    const patch = vi.fn();

    const outcome = await rename(created.id, name, patch);

    expect(outcome).toEqual({
      values: { name },
      fieldErrors: { name: 'Enter the name of the indicator' },
      version: SHOWN_VERSION,
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it('shows what the API refused, keeping what was typed', async () => {
    const patch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: {
        error: 'validation_failed',
        fieldErrors: { name: 'Enter the name of the indicator' },
      },
    });

    const outcome = await rename(created.id, 'Rejected name', patch);

    expect(outcome).toEqual({
      values: { name: 'Rejected name' },
      fieldErrors: { name: 'Enter the name of the indicator' },
      version: SHOWN_VERSION,
    });
  });

  it('shows a name another indicator already holds on the form', async () => {
    const patch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      error: {
        error: 'slug_taken',
        fieldErrors: { name: 'An indicator with this name already exists' },
      },
    });

    const outcome = await rename(created.id, 'Life expectancy at birth', patch);

    expect(outcome).toEqual({
      values: { name: 'Life expectancy at birth' },
      fieldErrors: { name: 'An indicator with this name already exists' },
      version: SHOWN_VERSION,
    });
  });

  it('reports a refusal that names no field as the form not saved', async () => {
    const patch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, error: { error: 'invalid_id' } });

    const outcome = await rename(created.id, 'Rejected name', patch);

    expect(outcome).toEqual({
      values: { name: 'Rejected name' },
      fieldErrors: {},
      formError: FORM_NOT_SAVED,
      version: SHOWN_VERSION,
    });
  });

  it('keeps what was typed when the name changed since, to save against its version now', async () => {
    const version = 'b'.repeat(64);
    const patch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 409, error: { error: 'changed', version } });

    await expect(rename(created.id, 'A better name', patch)).resolves.toEqual({
      values: { name: 'A better name' },
      fieldErrors: {},
      formError: NAME_CHANGED,
      version,
    });
  });

  // The API answers 404 when the draft went while the form was open; the client throws it.
  it('lets the not-found page through when the indicator no longer has a draft', async () => {
    const patch = vi.fn().mockRejectedValue(new Response('Not Found', { status: 404 }));

    await expect(rename(created.id, 'Too late', patch)).rejects.toSatisfy(isNotFound);
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
    context.set(apiContext, {
      get: vi.fn().mockResolvedValue({ ...created, draftLocked: true }),
    } as unknown as ApiClient);
    const request = new Request(path);

    const response = await flashedResponse(context, request, () =>
      loadIndicatorName({ context, params: { id: created.id }, request } as never),
    );

    expect(await redirectWithFlash(response)).toEqual(toOverview);
  });

  it('sends the publisher whose rename it refuses to the overview, saying why', async () => {
    const context = withFlashStorage(new RouterContextProvider());
    context.set(apiContext, {
      patch: vi.fn().mockResolvedValue({ ok: false, status: 409, error: { error: 'locked' } }),
    } as unknown as ApiClient);
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
