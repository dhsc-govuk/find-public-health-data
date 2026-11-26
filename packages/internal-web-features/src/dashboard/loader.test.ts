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
const AWAITING_DECISION = '/api/internal/updates-awaiting-decision';

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

const OWN = '/api/internal/indicators?page=1&teams=own';
const OTHER = '/api/internal/indicators?page=1&teams=other';

const otherIndicator: IndicatorAdminListItem = {
  ...indicator,
  id: '00000000-0000-7000-8000-000000000002',
  teamId: TEAM_IDS.teamB,
  teamName: 'Team B',
};

/** An API that answers a publisher's two lists: a page of their teams', then of other teams'. */
function apiPage(page: number, total: number, indicators = [indicator], otherPage = 1) {
  return createFakeApiClient({
    [`GET /api/internal/indicators?page=${page}&teams=own`]: listPage(page, total, indicators),
    [`GET /api/internal/indicators?page=${otherPage}&teams=other`]: listPage(otherPage, 31, [
      otherIndicator,
    ]),
  });
}

function pathsAsked(api: FakeApiClient) {
  return api.calls.map(({ path }) => path).sort();
}

describe('loadDashboard', () => {
  it('asks for the first page when the address names none', async () => {
    const api = apiPage(1, 23);

    const outcome = await load('https://internal.test/dashboard', api);

    expect(pathsAsked(api)).toEqual([OTHER, OWN]);
    expect(outcome).toEqual({
      underReview: null,
      toReview: null,
      scheduled: null,
      awaitingDecision: null,
      list: { canCreate: true, indicators: [indicator], page: 1, totalPages: 3 },
      otherList: { canCreate: false, indicators: [otherIndicator], page: 1, totalPages: 4 },
      notification: undefined,
    });
  });

  it('asks for the page in the address', async () => {
    const api = apiPage(3, 23);

    const outcome = await load('https://internal.test/dashboard?page=3', api);

    expect(pathsAsked(api)).toEqual([OTHER, '/api/internal/indicators?page=3&teams=own']);
    expect(outcome.list).toMatchObject({ page: 3, totalPages: 3 });
    expect(outcome.otherList).toMatchObject({ page: 1 });
  });

  it("asks for the page of other teams' indicators the address names, apart", async () => {
    const api = apiPage(1, 23, [indicator], 4);

    const outcome = await load('https://internal.test/dashboard?otherPage=4', api);

    expect(pathsAsked(api)).toEqual([OWN, '/api/internal/indicators?page=4&teams=other']);
    expect(outcome.list).toMatchObject({ page: 1 });
    expect(outcome.otherList).toMatchObject({ page: 4, totalPages: 4 });
  });

  it('pages alike whichever tab the address keeps open', async () => {
    const api = apiPage(3, 23);

    await load('https://internal.test/dashboard?page=3&tab=all-other', api);

    expect(pathsAsked(api)).toEqual([OTHER, '/api/internal/indicators?page=3&teams=own']);
  });

  it('renders the first page when there are no indicators at all', async () => {
    const outcome = await load('https://internal.test/dashboard', apiPage(1, 0, []));

    expect(outcome.list).toMatchObject({ indicators: [], page: 1, totalPages: 1 });
  });

  it('shows an admin the scheduled indicators beside the list', async () => {
    const api = createFakeApiClient({
      [`GET ${SCHEDULED}`]: { indicators: [indicator] },
      [`GET ${AWAITING_DECISION}`]: { indicators: [] },
      'GET /api/internal/indicators?page=1': listPage(1, 0, []),
    });

    const outcome = await load('https://internal.test/dashboard', api, ['admin'], []);

    expect(outcome.scheduled).toEqual([indicator]);
    expect(outcome.list).toMatchObject({ indicators: [], page: 1 });
  });

  it('shows an admin the updates waiting for their decision', async () => {
    const api = createFakeApiClient({
      [`GET ${SCHEDULED}`]: { indicators: [] },
      [`GET ${AWAITING_DECISION}`]: { indicators: [indicator] },
      'GET /api/internal/indicators?page=1': listPage(1, 0, []),
    });

    const outcome = await load('https://internal.test/dashboard', api, ['admin'], []);

    expect(outcome.awaitingDecision).toEqual([indicator]);
  });

  it('offers an admin no create action', async () => {
    const api = createFakeApiClient({
      [`GET ${SCHEDULED}`]: { indicators: [] },
      [`GET ${AWAITING_DECISION}`]: { indicators: [] },
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

  it("responds 404 to a page of other teams' indicators past the last one", async () => {
    await expect(
      load('https://internal.test/dashboard?otherPage=5', apiPage(1, 23, [indicator], 5)),
    ).rejects.toSatisfy((error: unknown) => error instanceof Response && error.status === 404);
  });

  it.each(['page', 'otherPage'])(
    'responds 404 to a %s of 0, two or 1.5 without asking the API',
    async (key) => {
      for (const page of ['0', 'two', '1.5']) {
        const api = createFakeApiClient();

        await expect(load(`https://internal.test/dashboard?${key}=${page}`, api)).rejects.toSatisfy(
          (error: unknown) => error instanceof Response && error.status === 404,
        );
        expect(api.calls).toEqual([]);
      }
    },
  );

  it("responds 404 to a page of other teams' indicators for an admin, who has no such list", async () => {
    const api = createFakeApiClient();

    await expect(
      load('https://internal.test/dashboard?otherPage=2', api, ['admin'], []),
    ).rejects.toSatisfy((error: unknown) => error instanceof Response && error.status === 404);
    expect(api.calls).toEqual([]);
  });

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
      awaitingDecision: null,
      list: null,
      otherList: null,
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

  it("shows an IMRG manager who publishes both, with pages of their own and other teams' indicators", async () => {
    const underReview = { unassigned: [], assigned: [indicator] };
    const api = createFakeApiClient({
      [`GET ${UNDER_REVIEW}`]: underReview,
      'GET /api/internal/indicators?page=2&teams=own': listPage(2, 23),
      [`GET ${OTHER}`]: listPage(1, 1, [otherIndicator]),
    });

    const outcome = await load('https://internal.test/dashboard?page=2', api, [
      'publisher',
      'imrg-manager',
    ]);

    expect(pathsAsked(api)).toEqual([
      UNDER_REVIEW,
      OTHER,
      '/api/internal/indicators?page=2&teams=own',
    ]);
    expect(outcome).toEqual({
      underReview,
      toReview: null,
      scheduled: null,
      awaitingDecision: null,
      list: { canCreate: true, indicators: [indicator], page: 2, totalPages: 3 },
      otherList: { canCreate: false, indicators: [otherIndicator], page: 1, totalPages: 1 },
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
      awaitingDecision: null,
      list: null,
      otherList: null,
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
      awaitingDecision: null,
      list: null,
      otherList: null,
      notification: undefined,
    });
  });

  it.each([
    ['a publisher', ['publisher'], [OTHER, OWN]],
    [
      'an admin',
      ['admin'],
      [
        '/api/internal/indicators-scheduled',
        '/api/internal/indicators?page=1',
        '/api/internal/updates-awaiting-decision',
      ],
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
        '/api/internal/updates-awaiting-decision',
      ],
    ],
    [
      'an IMRG manager and reviewer who publishes',
      ['publisher', 'imrg-manager', 'imrg-reviewer'],
      ['/api/internal/indicators-to-review', '/api/internal/indicators-under-review', OTHER, OWN],
    ],
    [
      'an admin who publishes',
      ['admin', 'publisher'],
      [
        '/api/internal/indicators-scheduled',
        '/api/internal/indicators?page=1',
        '/api/internal/updates-awaiting-decision',
      ],
    ],
  ])('fetches for %s the lists their roles allow', async (_who, roles, paths) => {
    const api = createFakeApiClient({
      [`GET ${UNDER_REVIEW}`]: { unassigned: [], assigned: [] },
      [`GET ${TO_REVIEW}`]: { indicators: [] },
      [`GET ${SCHEDULED}`]: { indicators: [] },
      [`GET ${AWAITING_DECISION}`]: { indicators: [] },
      'GET /api/internal/indicators?page=1': listPage(1, 0, []),
      [`GET ${OWN}`]: listPage(1, 0, []),
      [`GET ${OTHER}`]: listPage(1, 0, []),
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

  it("shows an IMRG reviewer who publishes both, with pages of their own and other teams' indicators", async () => {
    const api = createFakeApiClient({
      [`GET ${TO_REVIEW}`]: { indicators: [indicator] },
      'GET /api/internal/indicators?page=2&teams=own': listPage(2, 23),
      [`GET ${OTHER}`]: listPage(1, 1, [otherIndicator]),
    });

    const outcome = await load(
      'https://internal.test/dashboard?page=2',
      api,
      ['publisher', 'imrg-reviewer'],
      [TEAM_IDS.teamC],
    );

    expect(pathsAsked(api)).toEqual([
      TO_REVIEW,
      OTHER,
      '/api/internal/indicators?page=2&teams=own',
    ]);
    expect(outcome).toEqual({
      underReview: null,
      toReview: [indicator],
      scheduled: null,
      awaitingDecision: null,
      list: { canCreate: true, indicators: [indicator], page: 2, totalPages: 3 },
      otherList: { canCreate: false, indicators: [otherIndicator], page: 1, totalPages: 1 },
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

    expect(outcome.notification).toEqual({
      type: 'important',
      text: 'You are no longer a reviewer of this indicator.',
    });
  });
});

describe('loadDashboard with a search', () => {
  it('asks every list for the matches of the search, trimmed of spaces', async () => {
    const api = createFakeApiClient({
      [`GET ${UNDER_REVIEW}?search=life+expectancy`]: { unassigned: [], assigned: [] },
      [`GET ${TO_REVIEW}?search=life+expectancy`]: { indicators: [] },
      [`GET ${SCHEDULED}?search=life+expectancy`]: { indicators: [] },
      [`GET ${AWAITING_DECISION}?search=life+expectancy`]: { indicators: [] },
      'GET /api/internal/indicators?page=1&search=life+expectancy': listPage(1, 0, []),
    });

    const outcome = await load(
      'https://internal.test/dashboard?search=%20life%20expectancy%20',
      api,
      ['admin', 'imrg-manager', 'imrg-reviewer'],
      [],
    );

    expect(pathsAsked(api)).toHaveLength(5);
    expect(outcome.search).toBe('life expectancy');
  });

  it('keeps the search with the pages and the teams filters', async () => {
    const api = createFakeApiClient({
      [`GET ${UNDER_REVIEW}?search=asthma`]: { unassigned: [], assigned: [] },
      'GET /api/internal/indicators?page=2&teams=own&search=asthma': listPage(2, 11),
      'GET /api/internal/indicators?page=3&teams=other&search=asthma': listPage(3, 21),
    });

    await load('https://internal.test/dashboard?search=asthma&page=2&otherPage=3', api, [
      'publisher',
      'imrg-manager',
    ]);

    expect(pathsAsked(api)).toEqual([
      `${UNDER_REVIEW}?search=asthma`,
      '/api/internal/indicators?page=2&teams=own&search=asthma',
      '/api/internal/indicators?page=3&teams=other&search=asthma',
    ]);
  });

  it('treats a blank search as none', async () => {
    const api = apiPage(1, 1);

    const outcome = await load('https://internal.test/dashboard?search=%20%20', api);

    expect(pathsAsked(api)).toEqual([OTHER, OWN]);
    expect(outcome.search).toBeUndefined();
  });

  it.each([
    ['longer than 200 characters', `search=${'a'.repeat(201)}`],
    ['given twice', 'search=a&search=b'],
  ])('responds 404 to a search %s without asking the API', async (_, query) => {
    const api = createFakeApiClient();

    await expect(load(`https://internal.test/dashboard?${query}`, api)).rejects.toSatisfy(
      (error: unknown) => error instanceof Response && error.status === 404,
    );
    expect(api.calls).toEqual([]);
  });
});
