import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiAnswer,
  type FakeApiClient,
  noContent,
  refused,
} from '@fphd/web-server/testing';
import { describe, expect, it } from 'vitest';

import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { ADD_INTENT, removeIntent } from '../list-form.ts';
import { signedInContext } from '../session.testing.ts';
import { indicatorDetail } from '../testing.ts';
import { assignReviewers, loadReviewerAssignment } from './loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const PATH = `https://internal.test/dashboard/indicators/${ID}/assign-reviewers`;
const OVERVIEW = `/dashboard/indicators/${ID}`;

const morgan = { id: '019fa38f-073f-764e-9ac6-1c4d03b20001', name: 'Morgan Hughes' };
const jamie = { id: '019fa38f-073f-764e-9ac6-1c4d03b20002', name: 'Jamie Evans' };

/** Every internal role but the IMRG manager's. */
const OTHER_ROLES = ['publisher', 'imrg-reviewer', 'admin'];

const options = [
  { ...jamie, assignedIndicatorCount: 0 },
  { ...morgan, assignedIndicatorCount: 3 },
];

const ASSIGN = `POST /api/internal/indicators/${ID}/assign-reviewers` as const;

const inReview = indicatorDetail({
  id: ID,
  draftLocked: true,
  draftSubmissionStatus: 'in_review',
  draftReviewers: [morgan],
  draftSubmissionNumber: 2,
  draftFirstSubmittedAt: '2026-01-02T00:00:00.000Z',
  actions: ['assign_reviewers'],
});

/** An API that answers the indicator's detail with `indicator`, and the reviewers on offer. */
function apiGet(indicator: FakeApiAnswer) {
  return createFakeApiClient({
    [`GET /api/internal/indicators/${ID}`]: indicator,
    [`GET /api/internal/indicators/${ID}/reviewer-options`]: { reviewers: options },
  });
}

async function respond(
  handler: (args: never) => Promise<unknown>,
  api: FakeApiClient,
  request: Request,
  roles: readonly string[] = ['imrg-manager'],
) {
  const context = withFlashStorage(await signedInContext(roles));
  context.set(apiContext, api);
  let outcome: unknown;
  const response = await flashedResponse(context, request, async () => {
    outcome = await handler({ context, params: { id: ID }, request } as never);
    return outcome;
  });
  return { outcome, response };
}

describe('loadReviewerAssignment', () => {
  it('opens with the reviewers assigned now, and those on offer', async () => {
    const api = apiGet(inReview);

    const { outcome } = await respond(loadReviewerAssignment, api, new Request(PATH));

    expect(api.calls.map(({ path }) => path).sort()).toEqual([
      `/api/internal/indicators/${ID}`,
      `/api/internal/indicators/${ID}/reviewer-options`,
    ]);
    expect(outcome).toEqual({
      id: ID,
      options,
      currentReviewers: [morgan],
      values: {
        submissionNumber: 2,
        previousReviewerIds: [morgan.id],
        reviewerIds: [morgan.id],
        addReviewer: '',
      },
    });
  });

  it('sends the manager to the overview, saying why, once reviewers cannot be assigned', async () => {
    const api = apiGet({ ...inReview, actions: [] });

    const { response } = await respond(loadReviewerAssignment, api, new Request(PATH));

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: OVERVIEW,
      flash: 'assign-refused',
    });
  });

  it('is not found for a draft never submitted', async () => {
    const api = apiGet({
      ...inReview,
      draftLocked: false,
      draftSubmissionStatus: null,
      draftReviewers: [],
      draftSubmissionNumber: null,
      actions: [],
    });

    const { response } = await respond(loadReviewerAssignment, api, new Request(PATH));

    expect(response.status).toBe(404);
  });

  it.each(OTHER_ROLES)(
    'is not found for a %s, who may not assign reviewers, asking the API nothing',
    async (role) => {
      const api = apiGet(inReview);

      const { response } = await respond(loadReviewerAssignment, api, new Request(PATH), [role]);

      expect(response.status).toBe(404);
      expect(api.calls).toEqual([]);
    },
  );
});

describe('assignReviewers', () => {
  function post(fields: [string, string][]) {
    return new Request(PATH, { method: 'POST', body: new URLSearchParams(fields) });
  }

  const sent: [string, string][] = [
    ['submissionNumber', '2'],
    ['previousReviewerIds', morgan.id],
    ['reviewerIds', morgan.id],
  ];

  it('adds the chosen reviewer to the page without saving', async () => {
    const { outcome } = await respond(
      assignReviewers,
      createFakeApiClient(),
      post([...sent, ['addReviewer', jamie.id], ['intent', ADD_INTENT]]),
    );

    expect(outcome).toEqual({
      values: {
        submissionNumber: 2,
        previousReviewerIds: [morgan.id],
        reviewerIds: [morgan.id, jamie.id],
        addReviewer: '',
      },
      fieldErrors: {},
    });
  });

  it('removes a reviewer from the page without saving', async () => {
    const { outcome } = await respond(
      assignReviewers,
      createFakeApiClient(),
      post([...sent, ['addReviewer', ''], ['intent', removeIntent(0)]]),
    );

    expect(outcome).toMatchObject({ values: { reviewerIds: [] }, fieldErrors: {} });
  });

  it('asks for a reviewer when Continue is pressed with none', async () => {
    const { outcome } = await respond(
      assignReviewers,
      createFakeApiClient(),
      post([
        ['submissionNumber', '2'],
        ['addReviewer', ''],
      ]),
    );

    expect(outcome).toMatchObject({ fieldErrors: { addReviewer: 'Select a reviewer' } });
  });

  it('assigns the listed reviewers, naming what the page showed, then says so on the overview', async () => {
    const api = createFakeApiClient({ [ASSIGN]: noContent });

    const { response } = await respond(
      assignReviewers,
      api,
      post([...sent, ['addReviewer', jamie.id]]),
    );

    expect(api.calls).toEqual([
      {
        method: 'POST',
        path: `/api/internal/indicators/${ID}/assign-reviewers`,
        body: {
          submissionNumber: 2,
          previousReviewerIds: [morgan.id],
          reviewerIds: [morgan.id, jamie.id],
        },
      },
    ]);
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: OVERVIEW,
      flash: 'reviewers-assigned',
    });
  });

  it.each([
    ['not_allowed', 'assign-refused'],
    ['changed', 'reviewers-changed'],
    ['not_a_reviewer', 'reviewer-refused'],
  ])('says on the overview why a stale page was refused with %s', async (error, flash) => {
    const api = createFakeApiClient({ [ASSIGN]: refused(409, { error }) });

    const { response } = await respond(assignReviewers, api, post(sent));

    expect(await redirectWithFlash(response)).toEqual({ status: 302, location: OVERVIEW, flash });
  });

  it('asks for a reviewer when the API answers no_reviewers', async () => {
    const api = createFakeApiClient({ [ASSIGN]: refused(400, { error: 'no_reviewers' }) });

    const { outcome } = await respond(assignReviewers, api, post(sent));

    expect(outcome).toMatchObject({ fieldErrors: { addReviewer: 'Select a reviewer' } });
  });

  it('says the reviewers were not saved for a refusal that names no field', async () => {
    const api = createFakeApiClient({ [ASSIGN]: refused(400, { error: 'duplicate_reviewers' }) });

    const { outcome } = await respond(assignReviewers, api, post(sent));

    expect(outcome).toMatchObject({
      fieldErrors: {},
      formError: 'Your answers could not be saved. Try again.',
    });
  });

  it.each(OTHER_ROLES)('is not found for a %s, who may not assign reviewers', async (role) => {
    const api = createFakeApiClient();

    const { response } = await respond(assignReviewers, api, post(sent), [role]);

    expect(response.status).toBe(404);
    expect(api.calls).toEqual([]);
  });
});
