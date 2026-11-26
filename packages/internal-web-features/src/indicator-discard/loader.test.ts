import { TEAM_IDS } from '@fphd/auth';
import { ApiTimeoutError } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiAnswer,
  type FakeApiClient,
  fails,
  noContent,
  refused,
} from '@fphd/web-server/testing';
import { describe, expect, it } from 'vitest';

import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { signedInContext } from '../session.testing.ts';
import { indicatorDetail } from '../testing.ts';
import { discardDraft, loadIndicatorDiscard } from './loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const PATH = `https://internal.test/publish/indicators/${ID}/discard-draft`;
const DRAFT_UPDATED_AT = '2026-10-22T09:30:00.123Z';

const READ = `GET /api/internal/indicators/${ID}` as const;
const DISCARD = `POST /api/internal/indicators/${ID}/discard` as const;

const draft = indicatorDetail({
  id: ID,
  draftUpdatedAt: DRAFT_UPDATED_AT,
  canDiscardDraft: true,
});
const live = indicatorDetail({
  id: ID,
  indicatorStatus: 'live',
  publishedSlug: 'life-expectancy-at-birth',
  draftStatus: null,
  draftUpdatedAt: null,
});
const gone = fails(new Response('Not Found', { status: 404 }));

async function respond(
  handler: (args: never) => Promise<unknown>,
  api: FakeApiClient,
  request: Request,
  teams: readonly string[] = [TEAM_IDS.teamA],
) {
  const context = withFlashStorage(await signedInContext(['publisher'], teams));
  context.set(apiContext, api);
  let outcome: unknown;
  const response = await flashedResponse(context, request, async () => {
    outcome = await handler({ context, params: { id: ID }, request } as never);
    return outcome;
  });
  return { outcome, response };
}

describe('loadIndicatorDiscard', () => {
  function load(detail: FakeApiAnswer, teams?: readonly string[]) {
    return respond(
      loadIndicatorDiscard,
      createFakeApiClient({ [READ]: detail }),
      new Request(PATH),
      teams,
    );
  }

  it('asks about the draft the publisher may discard, as it was last edited', async () => {
    const { outcome } = await load(draft);

    expect(outcome).toEqual({ id: ID, draftUpdatedAt: DRAFT_UPDATED_AT, indicatorStatus: 'new' });
  });

  it.each([
    ['a draft a review has started on', { ...draft, canDiscardDraft: false }],
    ['a live indicator with no draft', live],
  ])('sends the publisher of %s to the overview, saying why', async (_case, detail) => {
    const { response } = await load(detail);

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `/dashboard/indicators/${ID}`,
      flash: 'discard-refused',
    });
  });

  it("is not found for another team's indicator, which the publisher may not edit", async () => {
    const { response } = await load(draft, [TEAM_IDS.teamB]);

    expect(response.status).toBe(404);
  });
});

describe('discardDraft', () => {
  function post(answer: FakeApiAnswer, detail: FakeApiAnswer) {
    const api = createFakeApiClient({ [DISCARD]: answer, [READ]: detail });
    const body = new URLSearchParams({ draftUpdatedAt: DRAFT_UPDATED_AT });
    return { api, posted: respond(discardDraft, api, new Request(PATH, { method: 'POST', body })) };
  }

  it('discards the draft the page showed, then says so on the dashboard once the indicator is gone', async () => {
    const { api, posted } = post(noContent, gone);
    const { response } = await posted;

    expect(api.calls[0]).toEqual({
      method: 'POST',
      path: `/api/internal/indicators/${ID}/discard`,
      body: { draftUpdatedAt: DRAFT_UPDATED_AT },
    });
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: '/dashboard',
      flash: 'draft-discarded',
    });
  });

  it('says so on the overview of a live indicator', async () => {
    const { response } = await post(noContent, live).posted;

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `/dashboard/indicators/${ID}`,
      flash: 'draft-discarded',
    });
  });

  it.each([
    [409, 'already_discarded', 'already-discarded'],
    [409, 'not_allowed', 'discard-refused'],
    [409, 'changed', 'discard-changed'],
    [409, 'upload_running', 'discard-upload-running'],
    [400, 'invalid_draft_updated_at', 'discard-refused'],
  ])('says on the overview why when the API answers %s %s', async (status, error, flash) => {
    const { response } = await post(refused(status, { error }), draft).posted;

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `/dashboard/indicators/${ID}`,
      flash,
    });
  });

  it('says on the dashboard that the draft has already been discarded once the indicator is gone', async () => {
    const { response } = await post(gone, gone).posted;

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: '/dashboard',
      flash: 'already-discarded',
    });
  });

  it('says so on the dashboard when a discard it waited for deleted the indicator', async () => {
    const { response } = await post(refused(409, { error: 'already_discarded' }), gone).posted;

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: '/dashboard',
      flash: 'already-discarded',
    });
  });

  it('is not found for an indicator the publisher may see but not edit', async () => {
    const { response } = await post(gone, draft).posted;

    expect(response.status).toBe(404);
  });

  it('says on the dashboard that a discard slower than an upload may be has not finished', async () => {
    const slow = fails(new ApiTimeoutError(`/api/internal/indicators/${ID}/discard`));

    const { response } = await post(slow, draft).posted;

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: '/dashboard',
      flash: 'discard-unfinished',
    });
  });
});
