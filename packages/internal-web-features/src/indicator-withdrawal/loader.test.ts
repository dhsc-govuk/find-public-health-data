import { TEAM_IDS } from '@fphd/auth';
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
import { signedInContext } from '../session.testing.ts';
import { indicatorDetail } from '../testing.ts';
import { loadIndicatorWithdrawal, withdrawSubmission } from './loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const PATH = `https://internal.test/publish/indicators/${ID}/withdraw-submission`;

const WITHDRAW = `POST /api/internal/indicators/${ID}/withdraw` as const;

const submitted = indicatorDetail({
  id: ID,
  draftLocked: true,
  draftSubmissionStatus: 'submitted',
  draftSubmissionNumber: 2,
  draftFirstSubmittedAt: '2026-01-02T00:00:00.000Z',
  actions: ['withdraw'],
});

/** An API that answers the indicator's detail with `detail`. */
function reading(detail: FakeApiAnswer) {
  return createFakeApiClient({ [`GET /api/internal/indicators/${ID}`]: detail });
}

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

describe('loadIndicatorWithdrawal', () => {
  it('asks about the submission the publisher may withdraw', async () => {
    const { outcome } = await respond(
      loadIndicatorWithdrawal,
      reading(submitted),
      new Request(PATH),
    );

    expect(outcome).toEqual({ id: ID, submissionNumber: 2 });
  });

  it('sends the publisher to the overview, saying why, once it cannot be withdrawn', async () => {
    const api = reading({
      ...submitted,
      draftLocked: false,
      draftSubmissionStatus: 'withdrawn',
      actions: ['submit'],
    });

    const { response } = await respond(loadIndicatorWithdrawal, api, new Request(PATH));

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `/dashboard/indicators/${ID}`,
      flash: 'withdraw-refused',
    });
  });

  it('is not found for a draft never submitted', async () => {
    const api = reading({
      ...submitted,
      draftLocked: false,
      draftSubmissionStatus: null,
      draftSubmissionNumber: null,
      draftFirstSubmittedAt: null,
      actions: ['submit'],
    });

    const { response } = await respond(loadIndicatorWithdrawal, api, new Request(PATH));

    expect(response.status).toBe(404);
  });

  it("is not found for another team's indicator, which the publisher may not edit", async () => {
    const { response } = await respond(
      loadIndicatorWithdrawal,
      reading(submitted),
      new Request(PATH),
      [TEAM_IDS.teamB],
    );

    expect(response.status).toBe(404);
  });
});

describe('withdrawSubmission', () => {
  function post(body: Record<string, string>) {
    return new Request(PATH, { method: 'POST', body: new URLSearchParams(body) });
  }

  it('withdraws the submission the page showed, then says so on the overview', async () => {
    const api = createFakeApiClient({ [WITHDRAW]: noContent });

    const { response } = await respond(withdrawSubmission, api, post({ submissionNumber: '2' }));

    expect(api.calls).toEqual([
      {
        method: 'POST',
        path: `/api/internal/indicators/${ID}/withdraw`,
        body: { submissionNumber: 2 },
      },
    ]);
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: `/dashboard/indicators/${ID}`,
      flash: 'submission-withdrawn',
    });
  });

  it.each([
    [409, 'not_allowed'],
    [409, 'changed'],
    [400, 'invalid_submission_number'],
  ])(
    'says on the overview that it cannot be withdrawn when the API answers %s %s',
    async (status, error) => {
      const api = createFakeApiClient({ [WITHDRAW]: refused(status, { error }) });

      const { response } = await respond(withdrawSubmission, api, post({ submissionNumber: '1' }));

      expect(await redirectWithFlash(response)).toEqual({
        status: 302,
        location: `/dashboard/indicators/${ID}`,
        flash: 'withdraw-refused',
      });
    },
  );
});
