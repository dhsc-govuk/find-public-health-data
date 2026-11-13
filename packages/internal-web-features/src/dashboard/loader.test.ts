import { TEAM_IDS } from '@fphd/auth';
import type { IndicatorAdminListItem } from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient } from '@fphd/web-server/testing';
import { describe, expect, it } from 'vitest';

import { flashCookie, loadWithFlash, withFlashStorage } from '../flash.testing.ts';
import { signedInContext } from '../session.testing.ts';
import { loadDashboard } from './loader.ts';

const indicator: IndicatorAdminListItem = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Life expectancy at birth',
  teamId: TEAM_IDS.teamA,
  teamName: 'Team A',
  createdBy: 'Alex Morgan',
  updatedAt: '2026-01-02T00:00:00.000Z',
  lastEditedBy: 'Sam Taylor',
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: false,
  draftSubmissionStatus: null,
  draftResponseKind: null,
  draftUpdateDecision: null,
  draftReviewers: [],
};

const UNDER_REVIEW = '/api/internal/indicators-under-review';
const TO_REVIEW = '/api/internal/indicators-to-review';
const SCHEDULED = '/api/internal/indicators-scheduled';

async function load(
  url: string,
  api: FakeApiClient,
  roles: readonly string[] = ['publisher'],
  teams: readonly string[] = [TEAM_IDS.teamA],
  cookie?: string,
) {
  const context = withFlashStorage(await signedInContext(roles, teams));
  context.set(apiContext, api);
  const request = new Request(url, cookie === undefined ? {} : { headers: { Cookie: cookie } });

  // A loader that throws, as for a missing page, rejects here rather than inside the middleware.
  let failure: unknown;
  const outcome = await loadWithFlash(context, request, () =>
    loadDashboard({ context, params: {}, request } as never).catch((error: unknown) => {
      failure = error;
      return undefined;
    }),
  );
  if (outcome === undefined) throw failure;
  return outcome;
}

function listPage(page: number, total: number, indicators = [indicator]) {
  return { indicators, page, pageSize: 10, total };
}

/** An API that answers one page of the whole list. */
function apiPage(page: number, total: number, indicators = [indicator]) {
  return createFakeApiClient({
    [`GET /api/internal/indicators?page=${page}`]: listPage(page, total, indicators),
  });
}

function pathsAsked(api: FakeApiClient) {
  return api.calls.map(({ path }) => path).sort();
}

describe('loadDashboard', () => {
  it('asks for the first page when the address names none', async () => {
    const api = apiPage(1, 23);

    const outcome = await load('https://internal.test/dashboard', api);

    expect(pathsAsked(api)).toEqual(['/api/internal/indicators?page=1']);
    expect(outcome).toEqual({
      underReview: null,
      toReview: null,
      scheduled: null,
      list: { canCreate: true, indicators: [indicator], page: 1, totalPages: 3 },
      notification: undefined,
    });
  });

  it('asks for the page in the address', async () => {
    const api = apiPage(3, 23);

    const outcome = await load('https://internal.test/dashboard?page=3', api);

    expect(pathsAsked(api)).toEqual(['/api/internal/indicators?page=3']);
    expect(outcome.list).toMatchObject({ page: 3, totalPages: 3 });
  });

  it('pages alike whichever tab the address keeps open', async () => {
    const api = apiPage(3, 23);

    await load('https://internal.test/dashboard?page=3&tab=create-and-edit', api);

    expect(pathsAsked(api)).toEqual(['/api/internal/indicators?page=3']);
  });

  it('renders the first page when there are no indicators at all', async () => {
    const outcome = await load('https://internal.test/dashboard', apiPage(1, 0, []));

    expect(outcome.list).toMatchObject({ indicators: [], page: 1, totalPages: 1 });
  });

  it('shows an admin the scheduled indicators beside the list', async () => {
    const api = createFakeApiClient({
      [`GET ${SCHEDULED}`]: { indicators: [indicator] },
      'GET /api/internal/indicators?page=1': listPage(1, 0, []),
    });

    const outcome = await load('https://internal.test/dashboard', api, ['admin'], []);

    expect(outcome.scheduled).toEqual([indicator]);
    expect(outcome.list).toMatchObject({ indicators: [], page: 1 });
  });

  it('offers an admin no create action', async () => {
    const api = createFakeApiClient({
      [`GET ${SCHEDULED}`]: { indicators: [] },
      'GET /api/internal/indicators?page=1': listPage(1, 1),
    });

    const outcome = await load('https://internal.test/dashboard', api, ['admin'], []);

    expect(outcome.list?.canCreate).toBe(false);
  });

  it('responds 404 to a page past the last one', async () => {
    await expect(
      load('https://internal.test/dashboard?page=4', apiPage(4, 23, [])),
    ).rejects.toSatisfy((error: unknown) => error instanceof Response && error.status === 404);
  });

  it.each(['0', 'two', '1.5'])(
    'responds 404 to a page of %s without asking the API',
    async (page) => {
      const api = createFakeApiClient();

      await expect(load(`https://internal.test/dashboard?page=${page}`, api)).rejects.toSatisfy(
        (error: unknown) => error instanceof Response && error.status === 404,
      );
      expect(api.calls).toEqual([]);
    },
  );

  it('responds 404 when the address names a page twice, as the API would refuse it', async () => {
    const api = createFakeApiClient();

    await expect(load('https://internal.test/dashboard?page=1&page=2', api)).rejects.toSatisfy(
      (error: unknown) => error instanceof Response && error.status === 404,
    );
    expect(api.calls).toEqual([]);
  });

  it('shows an IMRG manager the indicators under review and no list', async () => {
    const underReview = { unassigned: [indicator], assigned: [] };
    const api = createFakeApiClient({ [`GET ${UNDER_REVIEW}`]: underReview });

    const outcome = await load('https://internal.test/dashboard', api, ['imrg-manager'], []);

    expect(pathsAsked(api)).toEqual([UNDER_REVIEW]);
    expect(outcome).toEqual({
      underReview,
      toReview: null,
      scheduled: null,
      list: null,
      notification: undefined,
    });
  });

  it('responds 404 to a second page for an IMRG manager, whose tables are not paged', async () => {
    const api = createFakeApiClient();

    await expect(
      load('https://internal.test/dashboard?page=2', api, ['imrg-manager'], []),
    ).rejects.toSatisfy((error: unknown) => error instanceof Response && error.status === 404);
    expect(api.calls).toEqual([]);
  });

  it("shows an IMRG manager who publishes both, with a page of their own teams' indicators", async () => {
    const underReview = { unassigned: [], assigned: [indicator] };
    const api = createFakeApiClient({
      [`GET ${UNDER_REVIEW}`]: underReview,
      'GET /api/internal/indicators?page=2&teams=own': listPage(2, 23),
    });

    const outcome = await load('https://internal.test/dashboard?page=2', api, [
      'publisher',
      'imrg-manager',
    ]);

    expect(pathsAsked(api)).toEqual([UNDER_REVIEW, '/api/internal/indicators?page=2&teams=own']);
    expect(outcome).toEqual({
      underReview,
      toReview: null,
      scheduled: null,
      list: { canCreate: true, indicators: [indicator], page: 2, totalPages: 3 },
      notification: undefined,
    });
  });

  it('shows an IMRG reviewer the indicators assigned to them and no list', async () => {
    const api = createFakeApiClient({ [`GET ${TO_REVIEW}`]: { indicators: [indicator] } });

    const outcome = await load('https://internal.test/dashboard', api, ['imrg-reviewer'], []);

    expect(pathsAsked(api)).toEqual([TO_REVIEW]);
    expect(outcome).toEqual({
      underReview: null,
      toReview: [indicator],
      scheduled: null,
      list: null,
      notification: undefined,
    });
  });

  it('shows a user who is IMRG manager and reviewer both review lists and no list', async () => {
    const underReview = { unassigned: [], assigned: [indicator] };
    const api = createFakeApiClient({
      [`GET ${UNDER_REVIEW}`]: underReview,
      [`GET ${TO_REVIEW}`]: { indicators: [indicator] },
    });

    const outcome = await load(
      'https://internal.test/dashboard',
      api,
      ['imrg-manager', 'imrg-reviewer'],
      [],
    );

    expect(pathsAsked(api)).toEqual([TO_REVIEW, UNDER_REVIEW]);
    expect(outcome).toEqual({
      underReview,
      toReview: [indicator],
      scheduled: null,
      list: null,
      notification: undefined,
    });
  });

  it.each([
    ['a publisher', ['publisher'], ['/api/internal/indicators?page=1']],
    [
      'an admin',
      ['admin'],
      ['/api/internal/indicators-scheduled', '/api/internal/indicators?page=1'],
    ],
    ['an IMRG manager', ['imrg-manager'], ['/api/internal/indicators-under-review']],
    ['an IMRG reviewer', ['imrg-reviewer'], ['/api/internal/indicators-to-review']],
    [
      'an admin who reviews',
      ['admin', 'imrg-reviewer'],
      [
        '/api/internal/indicators-scheduled',
        '/api/internal/indicators-to-review',
        '/api/internal/indicators?page=1',
      ],
    ],
    [
      'an IMRG manager and reviewer who publishes',
      ['publisher', 'imrg-manager', 'imrg-reviewer'],
      [
        '/api/internal/indicators-to-review',
        '/api/internal/indicators-under-review',
        '/api/internal/indicators?page=1&teams=own',
      ],
    ],
  ])('fetches for %s the lists their roles allow', async (_who, roles, paths) => {
    const api = createFakeApiClient({
      [`GET ${UNDER_REVIEW}`]: { unassigned: [], assigned: [] },
      [`GET ${TO_REVIEW}`]: { indicators: [] },
      [`GET ${SCHEDULED}`]: { indicators: [] },
      'GET /api/internal/indicators?page=1': listPage(1, 0, []),
      'GET /api/internal/indicators?page=1&teams=own': listPage(1, 0, []),
    });

    await load('https://internal.test/dashboard', api, roles);

    expect(pathsAsked(api)).toEqual(paths);
  });

  it('responds 404 to a second page for an IMRG reviewer, whose list is not paged', async () => {
    const api = createFakeApiClient();

    await expect(
      load('https://internal.test/dashboard?page=2', api, ['imrg-reviewer'], []),
    ).rejects.toSatisfy((error: unknown) => error instanceof Response && error.status === 404);
    expect(api.calls).toEqual([]);
  });

  it("shows an IMRG reviewer who publishes both, with a page of their own teams' indicators", async () => {
    const api = createFakeApiClient({
      [`GET ${TO_REVIEW}`]: { indicators: [indicator] },
      'GET /api/internal/indicators?page=2&teams=own': listPage(2, 23),
    });

    const outcome = await load(
      'https://internal.test/dashboard?page=2',
      api,
      ['publisher', 'imrg-reviewer'],
      [TEAM_IDS.teamC],
    );

    expect(pathsAsked(api)).toEqual([TO_REVIEW, '/api/internal/indicators?page=2&teams=own']);
    expect(outcome).toEqual({
      underReview: null,
      toReview: [indicator],
      scheduled: null,
      list: { canCreate: true, indicators: [indicator], page: 2, totalPages: 3 },
      notification: undefined,
    });
  });

  it('shows the message the page before left', async () => {
    const outcome = await load(
      'https://internal.test/dashboard',
      apiPage(1, 1),
      ['publisher'],
      [TEAM_IDS.teamA],
      await flashCookie('no-longer-reviewer'),
    );

    expect(outcome.notification).toBe('You are no longer a reviewer of this indicator.');
  });
});
