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

import {
  flashCookie,
  flashedResponse,
  redirectWithFlash,
  withFlashStorage,
} from '../flash.testing.ts';
import { SIGNED_IN_USER_ID, signedInContext } from '../session.testing.ts';
import { indicatorDetail } from '../testing.ts';
import {
  chooseApproval,
  chooseResponseType,
  chooseReviewDate,
  chooseUpdateApproval,
  loadApproval,
  loadResponseType,
  loadReviewDate,
  loadRevisions,
  loadUpdateApproval,
  sendRevisions,
} from './loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const OVERVIEW = `/dashboard/indicators/${ID}`;
const REVIEW = `${OVERVIEW}/review`;
const RESPOND = ['give_feedback', 'request_changes', 'approve'] as const;
const RESPONSE = `POST /api/internal/indicators/${ID}/review-response` as const;

const inReview = indicatorDetail({
  id: ID,
  name: 'Hip fractures',
  draftLocked: true,
  draftSubmissionStatus: 'in_review',
  draftReviewers: [{ id: SIGNED_IN_USER_ID, name: 'Jamie Evans' }],
  draftSubmissionNumber: 2,
  draftScheduledPublishAt: '2027-04-01T08:30:00.000Z',
  draftFirstSubmittedAt: '2026-10-20T23:30:00.000Z',
  actions: [...RESPOND],
});

/** An API that answers the indicator's detail with `detail`. */
function reading(detail: FakeApiAnswer) {
  return createFakeApiClient({ [`GET /api/internal/indicators/${ID}`]: detail });
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
  roles: readonly string[] = ['imrg-reviewer'],
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
      'update approval page',
      loadUpdateApproval,
      new Request(`https://internal.test${REVIEW}/update-approval`),
    ],
    [
      'update approval form',
      chooseUpdateApproval,
      post(`${REVIEW}/update-approval`, [['submissionNumber', '2']]),
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
      const api = createFakeApiClient();
      const { response } = await run(handler, api, request.clone(), roles);

      expect(response.status, name).toBe(404);
      expect(api.calls, name).toEqual([]);
    }
  });

  it('open with the submission the reviewer is shown', async () => {
    const { outcome } = await run(
      loadResponseType,
      reading(inReview),
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
        reading({ ...inReview, actions: [] }),
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
        reading(inReview),
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
      createFakeApiClient(),
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
      createFakeApiClient(),
      post(`${REVIEW}/response-type`, [['submissionNumber', '2']]),
    );

    expect(outcome).toEqual({
      values: { responseType: '' },
      fieldErrors: { responseType: 'Select the response you are submitting' },
    });
  });

  it('settle the date against the first submission before going on', async () => {
    const api = reading(inReview);
    const before = await run(
      chooseReviewDate,
      api,
      post(`${REVIEW}/date?submission=2`, [
        ['imrgReviewedOn[day]', '20'],
        ['imrgReviewedOn[month]', '10'],
        ['imrgReviewedOn[year]', '2026'],
      ]),
    );
    const after = await run(
      chooseReviewDate,
      api,
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
    context.set(apiContext, reading(inReview));
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
    context.set(apiContext, reading(inReview));
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
    const api = createFakeApiClient({ [RESPONSE]: noContent });
    const { response } = await run(
      chooseApproval,
      api,
      post(`${REVIEW}/approval?submission=2&reviewedOn=2026-10-29`, [['approved', 'yes']]),
    );

    expect(api.calls).toEqual([
      {
        method: 'POST',
        path: `/api/internal/indicators/${ID}/review-response`,
        body: {
          submissionNumber: 2,
          kind: 'approved',
          imrgReviewedOn: '2026-10-29',
          clarificationRequest: null,
          flags: [],
        },
      },
    ]);
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: OVERVIEW,
      flash: 'review-approved',
    });
  });

  it('take a No on to the revisions page with its reason', async () => {
    const { response, outcome } = await run(
      chooseApproval,
      createFakeApiClient(),
      post(`${REVIEW}/approval?submission=2&reviewedOn=2026-10-29`, [['approved', 'no']]),
    );
    const reasoned = await run(
      chooseApproval,
      createFakeApiClient(),
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

  describe('for an update', () => {
    const updateInReview = { ...inReview, indicatorStatus: 'live' as const };

    it('open on "Can this update be published?", recapping the update', async () => {
      const { outcome } = await run(
        loadUpdateApproval,
        reading(updateInReview),
        new Request(`https://internal.test${REVIEW}/update-approval`),
      );

      expect(outcome).toEqual({
        id: ID,
        submissionNumber: 2,
        name: 'Hip fractures',
        scheduledPublishAt: '2027-04-01T08:30:00.000Z',
        values: { approved: '', reasons: [] },
      });
    });

    it('reopen with No and the kinds of feedback the revisions page goes back with', async () => {
      const { outcome } = await run(
        loadUpdateApproval,
        reading(updateInReview),
        new Request(
          `https://internal.test${REVIEW}/update-approval?submission=2&kind=pre_imrg_feedback&reason=clarification`,
        ),
      );

      expect(outcome).toMatchObject({ values: { approved: 'no', reasons: ['clarification'] } });
    });

    it.each([
      ['an update', loadResponseType, updateInReview, 'response-type', 'update-approval'],
      ['a new indicator', loadUpdateApproval, inReview, 'update-approval', 'response-type'],
    ] as const)(
      'send %s from the %s page to its own first page',
      async (_, loader, detail, from, to) => {
        const { response } = await run(
          loader,
          reading(detail),
          new Request(`https://internal.test${REVIEW}/${from}`),
        );

        expect(response.headers.get('Location')).toBe(`${REVIEW}/${to}`);
      },
    );

    it.each<[string, [string, string][], Record<string, string>]>([
      ['nothing chosen', [], { approved: 'Select whether you approve this update for publishing' }],
      [
        'No without a kind of feedback',
        [['approved', 'no']],
        {
          reasons: 'Select at least one kind of feedback',
        },
      ],
    ])('ask again for %s', async (_, answers, fieldErrors) => {
      const api = createFakeApiClient();
      const { outcome } = await run(
        chooseUpdateApproval,
        api,
        post(`${REVIEW}/update-approval`, [['submissionNumber', '2'], ...answers]),
      );

      expect(outcome).toMatchObject({ fieldErrors });
      expect(api.calls).toEqual([]);
    });

    it('send Yes as an approval with no IMRG date and land on the overview with its banner', async () => {
      const api = createFakeApiClient({ [RESPONSE]: noContent });
      const { response } = await run(
        chooseUpdateApproval,
        api,
        post(`${REVIEW}/update-approval`, [
          ['submissionNumber', '2'],
          ['approved', 'yes'],
        ]),
      );

      expect(api.calls).toEqual([
        {
          method: 'POST',
          path: `/api/internal/indicators/${ID}/review-response`,
          body: {
            submissionNumber: 2,
            kind: 'approved',
            imrgReviewedOn: null,
            clarificationRequest: null,
            flags: [],
          },
        },
      ]);
      expect(await redirectWithFlash(response)).toEqual({
        status: 302,
        location: OVERVIEW,
        flash: 'review-approved',
      });
    });

    it.each([
      ['date', loadReviewDate, '/date?submission=2'],
      ['approval', loadApproval, '/approval?submission=2&reviewedOn=2026-10-29'],
    ])(
      "send an update's reviewer from the IMRG %s page to the update's first page",
      async (_, loader, path) => {
        const { response } = await run(
          loader,
          reading(updateInReview),
          new Request(`https://internal.test${REVIEW}${path}`),
        );

        expect(response.headers.get('Location')).toBe(`${REVIEW}/update-approval`);
      },
    );

    it.each([
      [
        'with the clarification box ticked when clarification was asked for',
        '&reason=clarification',
        true,
      ],
      ['with nothing ticked for revisions alone', '&reason=revisions', false],
    ])('open the revisions page %s', async (_, reasons, clarification) => {
      const { outcome } = await run(
        loadRevisions,
        reading(updateInReview),
        new Request(
          `https://internal.test${REVIEW}/revisions?submission=2&kind=pre_imrg_feedback${reasons}`,
        ),
      );

      expect(outcome).toMatchObject({
        isUpdate: true,
        values: { clarification, clarificationRequest: '', flags: [] },
      });
    });

    it('take No on to the revisions page as feedback, with the kinds chosen', async () => {
      const { response } = await run(
        chooseUpdateApproval,
        createFakeApiClient(),
        post(`${REVIEW}/update-approval`, [
          ['submissionNumber', '2'],
          ['approved', 'no'],
          ['reasons', 'revisions'],
          ['reasons', 'clarification'],
        ]),
      );

      expect(response.headers.get('Location')).toBe(
        `${REVIEW}/revisions?submission=2&kind=pre_imrg_feedback&reason=revisions&reason=clarification`,
      );
    });
  });

  it('check the revisions before sending them', async () => {
    const api = createFakeApiClient();
    const { outcome } = await run(
      sendRevisions,
      api,
      post(`${REVIEW}/revisions?submission=2&kind=pre_imrg_feedback`, [['flags', 'polarity']]),
    );

    expect(outcome).toMatchObject({
      fieldErrors: { 'flags.polarity': 'Enter the revisions advised for polarity' },
    });
    expect(api.calls).toEqual([]);
  });

  const revisions = post(
    `${REVIEW}/revisions?submission=2&kind=minor_revisions&reviewedOn=2026-10-29`,
    [
      ['flags', 'polarity'],
      ['flags.polarity', 'Higher is better'],
    ],
  );

  it('send revisions and land on the overview with their banner', async () => {
    const api = createFakeApiClient({ [RESPONSE]: noContent });
    const { response } = await run(sendRevisions, api, revisions.clone());

    expect(api.calls[0]?.body).toEqual({
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
    const api = createFakeApiClient({ [RESPONSE]: refused(409, { error }) });
    const { response } = await run(sendRevisions, api, revisions.clone());

    expect(await redirectWithFlash(response)).toEqual({ status: 302, location, flash });
  });

  it('send a reviewer the API no longer lets see the indicator to the dashboard', async () => {
    const api = createFakeApiClient({
      [RESPONSE]: fails(new Response('Not Found', { status: 404 })),
    });
    const { response } = await run(sendRevisions, api, revisions.clone());

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: '/dashboard',
      flash: 'no-longer-reviewer',
    });
  });

  it('send the reviewer back to the date page when the API refuses the date', async () => {
    const api = createFakeApiClient({
      [RESPONSE]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { imrgReviewedOn: 'Too early' },
      }),
    });
    const { response } = await run(sendRevisions, api, revisions.clone());

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `${REVIEW}/date?submission=2&reviewedOn=2026-10-29`,
      flash: 'review-date-refused',
    });
  });
});
