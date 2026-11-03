import { TEAM_IDS } from '@fphd/auth';
import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { describe, expect, it, vi } from 'vitest';

import {
  flashCookie,
  flashedResponse,
  redirectWithFlash,
  withFlashStorage,
} from '../flash.testing.ts';
import { signedInContext } from '../session.testing.ts';
import {
  chooseApproval,
  chooseResponseType,
  chooseReviewDate,
  loadApproval,
  loadResponseType,
  loadReviewDate,
  loadRevisions,
  sendRevisions,
} from './loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const OVERVIEW = `/dashboard/indicators/${ID}`;
const REVIEW = `${OVERVIEW}/review`;
const RESPOND = ['give_feedback', 'request_changes', 'approve'];

const inReview = {
  id: ID,
  shortId: 90366,
  name: 'Hip fractures',
  teamId: TEAM_IDS.teamA,
  publishedSlug: null,
  updatedAt: '2026-01-02T00:00:00.000Z',
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: true,
  draftSubmissionStatus: 'in_review',
  draftResponseKind: null,
  draftReviewers: [{ id: 'test-user', name: 'Jamie Evans' }],
  draftSubmissionNumber: 2,
  draftScheduledPublishAt: '2027-04-01T08:30:00.000Z',
  draftFirstSubmittedAt: '2026-10-20T23:30:00.000Z',
  actions: RESPOND,
};

function post(path: string, entries: [string, string][]): Request {
  const body = new FormData();
  for (const [name, value] of entries) body.append(name, value);
  return new Request(`https://internal.test${path}`, { method: 'POST', body });
}

async function run(
  handler: (args: never) => Promise<unknown>,
  client: Partial<ApiClient>,
  request: Request,
  roles: readonly string[] = ['imrg-reviewer'],
) {
  const context = withFlashStorage(await signedInContext(roles, []));
  context.set(apiContext, client as ApiClient);
  let outcome: unknown;
  const response = await flashedResponse(context, request, async () => {
    outcome = await handler({ context, params: { id: ID }, request } as never);
    return outcome;
  });
  return { outcome, response };
}

describe('the response pages', () => {
  const pages: [string, (args: never) => Promise<unknown>, Request][] = [
    [
      'response type page',
      loadResponseType,
      new Request(`https://internal.test${REVIEW}/response-type`),
    ],
    [
      'response type form',
      chooseResponseType,
      post(`${REVIEW}/response-type`, [['submissionNumber', '2']]),
    ],
    ['date page', loadReviewDate, new Request(`https://internal.test${REVIEW}/date?submission=2`)],
    ['date form', chooseReviewDate, post(`${REVIEW}/date?submission=2`, [])],
    [
      'approval page',
      loadApproval,
      new Request(`https://internal.test${REVIEW}/approval?submission=2&reviewedOn=2026-10-29`),
    ],
    [
      'approval form',
      chooseApproval,
      post(`${REVIEW}/approval?submission=2&reviewedOn=2026-10-29`, []),
    ],
    [
      'revisions page',
      loadRevisions,
      new Request(`https://internal.test${REVIEW}/revisions?submission=2&kind=pre_imrg_feedback`),
    ],
    [
      'revisions form',
      sendRevisions,
      post(`${REVIEW}/revisions?submission=2&kind=pre_imrg_feedback`, []),
    ],
  ];

  it.each([
    ['a publisher', ['publisher']],
    ['an IMRG manager without the reviewer role', ['imrg-manager']],
  ])('do not exist for %s', async (_, roles) => {
    for (const [name, handler, request] of pages) {
      const client = { get: vi.fn(), postToMember: vi.fn() };
      const { response } = await run(handler, client, request.clone(), roles);

      expect(response.status, name).toBe(404);
      expect(client.get, name).not.toHaveBeenCalled();
      expect(client.postToMember, name).not.toHaveBeenCalled();
    }
  });

  it('open with the submission the reviewer is shown', async () => {
    const { outcome } = await run(
      loadResponseType,
      { get: vi.fn().mockResolvedValue(inReview) },
      new Request(`https://internal.test${REVIEW}/response-type`),
    );

    expect(outcome).toEqual({ id: ID, submissionNumber: 2, values: { responseType: '' } });
  });

  it.each([
    ['response type', loadResponseType, '/response-type'],
    ['date', loadReviewDate, '/date?submission=2'],
    ['approval', loadApproval, '/approval?submission=2&reviewedOn=2026-10-29'],
    ['revisions', loadRevisions, '/revisions?submission=2&kind=pre_imrg_feedback'],
  ])(
    'send the reviewer from the %s page to the overview once the round waits for no response',
    async (_, loader, path) => {
      const { response } = await run(
        loader,
        { get: vi.fn().mockResolvedValue({ ...inReview, actions: [] }) },
        new Request(`https://internal.test${REVIEW}${path}`),
      );

      expect(await redirectWithFlash(response)).toEqual({
        status: 302,
        location: OVERVIEW,
        flash: 'review-not-waiting',
      });
    },
  );

  it.each([
    ['date', loadReviewDate, '/date'],
    ['approval', loadApproval, '/approval?submission=2'],
    ['revisions', loadRevisions, '/revisions?submission=2&kind=minor_revisions'],
  ])(
    'send the reviewer back to the first page from the %s page without its answers',
    async (_, loader, path) => {
      const { response } = await run(
        loader,
        { get: vi.fn().mockResolvedValue(inReview) },
        new Request(`https://internal.test${REVIEW}${path}`),
      );

      expect(response.headers.get('Location')).toBe(`${REVIEW}/response-type`);
    },
  );

  it.each([
    ['pre_imrg_feedback', `${REVIEW}/revisions?submission=2&kind=pre_imrg_feedback`],
    ['imrg_decision', `${REVIEW}/date?submission=2`],
  ])('go on from a %s response type', async (responseType, location) => {
    const { response } = await run(
      chooseResponseType,
      {},
      post(`${REVIEW}/response-type`, [
        ['submissionNumber', '2'],
        ['responseType', responseType],
      ]),
    );

    expect(response.headers.get('Location')).toBe(location);
  });

  it('ask for the response type again when none is chosen', async () => {
    const { outcome } = await run(
      chooseResponseType,
      {},
      post(`${REVIEW}/response-type`, [['submissionNumber', '2']]),
    );

    expect(outcome).toEqual({
      values: { responseType: '' },
      fieldErrors: { responseType: 'Select the response you are submitting' },
    });
  });

  it('settle the date against the first submission before going on', async () => {
    const get = vi.fn().mockResolvedValue(inReview);
    const before = await run(
      chooseReviewDate,
      { get },
      post(`${REVIEW}/date?submission=2`, [
        ['imrgReviewedOn[day]', '20'],
        ['imrgReviewedOn[month]', '10'],
        ['imrgReviewedOn[year]', '2026'],
      ]),
    );
    const after = await run(
      chooseReviewDate,
      { get },
      post(`${REVIEW}/date?submission=2`, [
        ['imrgReviewedOn[day]', '29'],
        ['imrgReviewedOn[month]', '10'],
        ['imrgReviewedOn[year]', '2026'],
      ]),
    );

    expect(before.outcome).toMatchObject({
      fieldErrors: {
        imrgReviewedOnDay: 'Date reviewed by IMRG must be on or after 21 October 2026',
      },
    });
    expect(after.response.headers.get('Location')).toBe(
      `${REVIEW}/approval?submission=2&reviewedOn=2026-10-29`,
    );
  });

  it('show on the date page the rule a refused date breaks', async () => {
    const context = withFlashStorage(await signedInContext(['imrg-reviewer'], []));
    context.set(apiContext, { get: vi.fn().mockResolvedValue(inReview) } as unknown as ApiClient);
    const request = new Request(
      `https://internal.test${REVIEW}/date?submission=2&reviewedOn=2999-01-01`,
      { headers: { Cookie: await flashCookie('review-date-refused') } },
    );
    let outcome: unknown;
    await flashedResponse(context, request, async () => {
      outcome = await loadReviewDate({ context, params: { id: ID }, request } as never);
    });

    expect(outcome).toMatchObject({
      fieldErrors: { imrgReviewedOnDay: 'Date reviewed by IMRG must be today or in the past' },
    });
  });

  it('show on the date page why the API refused the date', async () => {
    const context = withFlashStorage(await signedInContext(['imrg-reviewer'], []));
    context.set(apiContext, { get: vi.fn().mockResolvedValue(inReview) } as unknown as ApiClient);
    const request = new Request(
      `https://internal.test${REVIEW}/date?submission=2&reviewedOn=2026-10-20`,
      {
        headers: { Cookie: await flashCookie('review-date-refused') },
      },
    );
    let outcome: unknown;
    await flashedResponse(context, request, async () => {
      outcome = await loadReviewDate({ context, params: { id: ID }, request } as never);
    });

    expect(outcome).toMatchObject({
      values: { imrgReviewedOnDay: '20', imrgReviewedOnMonth: '10', imrgReviewedOnYear: '2026' },
      fieldErrors: {
        imrgReviewedOnYear: 'Date reviewed by IMRG must be on or after 21 October 2026',
      },
    });
  });

  it('send an approval from the approval page and land on the overview with its banner', async () => {
    const postToMember = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const { response } = await run(
      chooseApproval,
      { postToMember },
      post(`${REVIEW}/approval?submission=2&reviewedOn=2026-10-29`, [['approved', 'yes']]),
    );

    expect(postToMember).toHaveBeenCalledWith(
      `/api/internal/indicators/${ID}/review-response`,
      {
        submissionNumber: 2,
        kind: 'approved',
        imrgReviewedOn: '2026-10-29',
        clarificationRequest: null,
        flags: [],
      },
      expect.anything(),
    );
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: OVERVIEW,
      flash: 'review-approved',
    });
  });

  it('take a No on to the revisions page with its reason', async () => {
    const { response, outcome } = await run(
      chooseApproval,
      {},
      post(`${REVIEW}/approval?submission=2&reviewedOn=2026-10-29`, [['approved', 'no']]),
    );
    const reasoned = await run(
      chooseApproval,
      {},
      post(`${REVIEW}/approval?submission=2&reviewedOn=2026-10-29`, [
        ['approved', 'no'],
        ['revisionsKind', 'major_revisions'],
      ]),
    );

    expect(response.headers.get('Location')).toBeNull();
    expect(outcome).toMatchObject({ fieldErrors: { revisionsKind: 'Select a reason' } });
    expect(reasoned.response.headers.get('Location')).toBe(
      `${REVIEW}/revisions?submission=2&kind=major_revisions&reviewedOn=2026-10-29`,
    );
  });

  it('check the revisions before sending them', async () => {
    const postToMember = vi.fn();
    const { outcome } = await run(
      sendRevisions,
      { postToMember },
      post(`${REVIEW}/revisions?submission=2&kind=pre_imrg_feedback`, [['flags', 'polarity']]),
    );

    expect(outcome).toMatchObject({
      fieldErrors: { 'flags.polarity': 'Enter the revisions advised for polarity' },
    });
    expect(postToMember).not.toHaveBeenCalled();
  });

  const revisions = post(
    `${REVIEW}/revisions?submission=2&kind=minor_revisions&reviewedOn=2026-10-29`,
    [
      ['flags', 'polarity'],
      ['flags.polarity', 'Higher is better'],
    ],
  );

  it('send revisions and land on the overview with their banner', async () => {
    const postToMember = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const { response } = await run(sendRevisions, { postToMember }, revisions.clone());

    expect(postToMember.mock.calls[0]?.[1]).toEqual({
      submissionNumber: 2,
      kind: 'minor_revisions',
      imrgReviewedOn: '2026-10-29',
      clarificationRequest: null,
      flags: [{ task: 'polarity', notes: 'Higher is better' }],
    });
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: OVERVIEW,
      flash: 'review-minor-revisions',
    });
  });

  it.each([
    ['not_allowed', OVERVIEW, 'review-not-waiting'],
    ['changed', OVERVIEW, 'review-changed'],
    ['no_publication_date', OVERVIEW, 'review-no-publication-date'],
    ['not_a_reviewer', '/dashboard', 'no-longer-reviewer'],
  ])('send the reviewer on when the API refuses as %s', async (error, location, flash) => {
    const postToMember = vi.fn().mockResolvedValue({ ok: false, status: 409, error: { error } });
    const { response } = await run(sendRevisions, { postToMember }, revisions.clone());

    expect(await redirectWithFlash(response)).toEqual({ status: 302, location, flash });
  });

  it('send a reviewer the API no longer lets see the indicator to the dashboard', async () => {
    const postToMember = vi.fn().mockRejectedValue(new Response('Not Found', { status: 404 }));
    const { response } = await run(sendRevisions, { postToMember }, revisions.clone());

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: '/dashboard',
      flash: 'no-longer-reviewer',
    });
  });

  it('send the reviewer back to the date page when the API refuses the date', async () => {
    const postToMember = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'validation_failed', fieldErrors: { imrgReviewedOn: 'Too early' } },
    });
    const { response } = await run(sendRevisions, { postToMember }, revisions.clone());

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `${REVIEW}/date?submission=2&reviewedOn=2026-10-29`,
      flash: 'review-date-refused',
    });
  });
});
