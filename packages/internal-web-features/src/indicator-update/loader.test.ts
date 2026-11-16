import { TEAM_IDS } from '@fphd/auth';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, noContent, refused } from '@fphd/web-server/testing';
import { describe, expect, it } from 'vitest';

import { signedInContext } from '../session.testing.ts';
import { startIndicatorUpdate } from './loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const START = `POST /api/internal/indicators/${ID}/draft` as const;

async function start(api: ReturnType<typeof createFakeApiClient>) {
  const context = await signedInContext(['publisher'], [TEAM_IDS.teamA]);
  context.set(apiContext, api);
  const request = new Request(`https://internal.test/publish/indicators/${ID}/start-update`, {
    method: 'POST',
  });

  return startIndicatorUpdate({ context, params: { id: ID }, request } as never);
}

describe('startIndicatorUpdate', () => {
  it('opens a draft from the published version, then goes to its task list', async () => {
    const api = createFakeApiClient({ [START]: noContent });

    const response = await start(api);

    expect(api.calls).toEqual([
      { method: 'POST', path: `/api/internal/indicators/${ID}/draft`, body: {} },
    ]);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/publish/indicators/${ID}/task-list`);
  });

  it('goes to the task list of a draft already open, as after a double click', async () => {
    const api = createFakeApiClient({ [START]: refused(409, { error: 'draft_exists' }) });

    const response = await start(api);

    expect(response.headers.get('Location')).toBe(`/publish/indicators/${ID}/task-list`);
  });

  it('returns to the overview of an indicator with nothing published to update', async () => {
    const api = createFakeApiClient({ [START]: refused(409, { error: 'not_published' }) });

    const response = await start(api);

    expect(response.headers.get('Location')).toBe(`/dashboard/indicators/${ID}`);
  });

  it('answers 404 for an id that is not one, without asking the API', async () => {
    const api = createFakeApiClient({});
    const context = await signedInContext(['publisher'], [TEAM_IDS.teamA]);
    context.set(apiContext, api);

    await expect(
      startIndicatorUpdate({ context, params: { id: 'not-an-id' } } as never),
    ).rejects.toMatchObject({ status: 404 });
    expect(api.calls).toEqual([]);
  });
});
