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
import {
  chooseUpdateDecision,
  loadUpdateDecision,
  loadUpdateRevisions,
  sendUpdateRevisions,
} from './loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const OVERVIEW = `/dashboard/indicators/${ID}`;
const DECISION = `${OVERVIEW}/update-decision`;
const REVISIONS = `${DECISION}/revisions?submission=2`;
const POSTED = `POST /api/internal/indicators/${ID}/update-decision` as const;

const submittedUpdate = indicatorDetail({
  id: ID,
  indicatorStatus: 'live',
  draftLocked: true,
  draftSubmissionStatus: 'submitted',
  draftSubmissionNumber: 2,
  actions: ['send_update_to_imrg', 'request_update_revisions', 'approve_update'],
});

function reading(detail: FakeApiAnswer) {
  return createFakeApiClient({ [`GET /api/internal/indicators/${ID}`]: detail });
}

function get(path: string): Request {
  return new Request(`https://internal.test${path}`);
}

function post(path: string, entries: [string, string][]): Request {
  const body = new FormData();
  for (const [name, value] of entries) body.append(name, value);
  return new Request(`https://internal.test${path}`, { method: 'POST', body });
}

async function run(
  handler: (args: never) => Promise<unknown>,
  api: FakeApiClient,
  request: Request,
  roles: readonly string[] = ['admin'],
) {
  const context = withFlashStorage(await signedInContext(roles, []));
  context.set(apiContext, api);
  let outcome: unknown;
  const response = await flashedResponse(context, request, async () => {
    outcome = await handler({ context, params: { id: ID }, request } as never);
    return outcome;
  });
  return { outcome, response };
}

describe('the update decision pages', () => {
  const pages: [string, (args: never) => Promise<unknown>, Request][] = [
    ['decision page', loadUpdateDecision, get(DECISION)],
    ['decision form', chooseUpdateDecision, post(DECISION, [['submissionNumber', '2']])],
    ['revisions page', loadUpdateRevisions, get(REVISIONS)],
    ['revisions form', sendUpdateRevisions, post(REVISIONS, [])],
  ];

  it.each([
    ['a publisher', ['publisher']],
    ['an IMRG manager', ['imrg-manager']],
    ['an IMRG reviewer', ['imrg-reviewer']],
  ])('do not exist for %s', async (_, roles) => {
    for (const [name, handler, request] of pages) {
      const api = createFakeApiClient();
      const { response } = await run(handler, api, request.clone(), roles);

      expect(response.status, name).toBe(404);
      expect(api.calls, name).toEqual([]);
    }
  });

  it('open the decision page with the submission the admin is shown', async () => {
    const { outcome } = await run(loadUpdateDecision, reading(submittedUpdate), get(DECISION));

    expect(outcome).toEqual({ id: ID, submissionNumber: 2, values: { updateDecision: '' } });
  });

  it('reopen the decision page with the answer its back link carries', async () => {
    const { outcome } = await run(
      loadUpdateDecision,
      reading(submittedUpdate),
      get(`${DECISION}?decision=request_revisions`),
    );

    expect(outcome).toMatchObject({ values: { updateDecision: 'request_revisions' } });
  });

  it.each([
    ['decision', loadUpdateDecision, DECISION],
    ['revisions', loadUpdateRevisions, REVISIONS],
  ])(
    'send the admin from the %s page to the overview once the update waits for no decision',
    async (_, loader, path) => {
      const { response } = await run(
        loader,
        reading({ ...submittedUpdate, actions: [] }),
        get(path),
      );

      expect(await redirectWithFlash(response)).toEqual({
        status: 302,
        location: OVERVIEW,
        flash: 'update-decision-not-waiting',
      });
    },
  );

  it('send the admin to the decision page from a revisions page with no submission', async () => {
    const { response } = await run(
      loadUpdateRevisions,
      reading(submittedUpdate),
      get(`${DECISION}/revisions`),
    );

    expect(response.headers.get('Location')).toBe(DECISION);
  });

  it('ask for the decision again when none is chosen', async () => {
    const api = createFakeApiClient();
    const { outcome } = await run(
      chooseUpdateDecision,
      api,
      post(DECISION, [['submissionNumber', '2']]),
    );

    expect(outcome).toEqual({
      values: { updateDecision: '' },
      fieldErrors: { updateDecision: 'Select what should happen to this update' },
    });
    expect(api.calls).toEqual([]);
  });

  it('go on to the revisions page for revisions, recording nothing yet', async () => {
    const api = createFakeApiClient();
    const { response } = await run(
      chooseUpdateDecision,
      api,
      post(DECISION, [
        ['submissionNumber', '2'],
        ['updateDecision', 'request_revisions'],
      ]),
    );

    expect(response.headers.get('Location')).toBe(REVISIONS);
    expect(api.calls).toEqual([]);
  });

  it.each([
    ['imrg_review', OVERVIEW],
    ['publish_with_history', `${OVERVIEW}/publication-date`],
    ['publish_without_history', `${OVERVIEW}/publication-date`],
  ])('record %s and go on to %s', async (decision, location) => {
    const api = createFakeApiClient({ [POSTED]: noContent });
    const { response } = await run(
      chooseUpdateDecision,
      api,
      post(DECISION, [
        ['submissionNumber', '2'],
        ['updateDecision', decision],
      ]),
    );

    expect(api.calls[0]?.body).toEqual({ submissionNumber: 2, decision });
    expect(await redirectWithFlash(response)).toEqual({ status: 302, location, flash: undefined });
  });

  it.each([
    ['not_allowed', 'update-decision-not-waiting'],
    ['changed', 'update-decision-changed'],
  ])('send the admin to the overview when the API refuses as %s', async (error, flash) => {
    const api = createFakeApiClient({ [POSTED]: refused(409, { error }) });
    const { response } = await run(
      chooseUpdateDecision,
      api,
      post(DECISION, [
        ['submissionNumber', '2'],
        ['updateDecision', 'imrg_review'],
      ]),
    );

    expect(await redirectWithFlash(response)).toEqual({ status: 302, location: OVERVIEW, flash });
  });

  it('send the admin to the overview when no draft is left to decide on', async () => {
    const api = createFakeApiClient({
      [POSTED]: fails(new Response('Not Found', { status: 404 })),
    });
    const { response } = await run(
      chooseUpdateDecision,
      api,
      post(DECISION, [
        ['submissionNumber', '2'],
        ['updateDecision', 'imrg_review'],
      ]),
    );

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: OVERVIEW,
      flash: 'update-decision-not-waiting',
    });
  });

  it('check the revisions before sending them', async () => {
    const api = createFakeApiClient();
    const { outcome } = await run(
      sendUpdateRevisions,
      api,
      post(REVISIONS, [['flags', 'update-summary']]),
    );

    expect(outcome).toMatchObject({
      fieldErrors: { 'flags.update-summary': 'Enter the revisions advised for update summary' },
    });
    expect(api.calls).toEqual([]);
  });

  it('send revisions and land on the overview with their banner', async () => {
    const api = createFakeApiClient({ [POSTED]: noContent });
    const { response } = await run(
      sendUpdateRevisions,
      api,
      post(REVISIONS, [
        ['flags', 'update-summary'],
        ['flags.update-summary', 'Say what changed.'],
      ]),
    );

    expect(api.calls[0]?.body).toEqual({
      submissionNumber: 2,
      decision: 'request_revisions',
      clarificationRequest: null,
      flags: [{ task: 'update-summary', notes: 'Say what changed.' }],
    });
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: OVERVIEW,
      flash: 'update-revisions-requested',
    });
  });
});
