import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiAnswer,
  type FakeApiClient,
  fails,
  noContent,
  refused,
} from '@fphd/web-server/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { signedInContext } from '../session.testing.ts';
import { indicatorDetail } from '../testing.ts';
import { confirmPublicationDate, loadPublicationDate } from './loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const PATH = `https://internal.test/dashboard/indicators/${ID}/publication-date`;
const OVERVIEW = `/dashboard/indicators/${ID}`;
// 09:30 BST on 1 April 2027.
const SHOWN = '2027-04-01T08:30:00.000Z';
const FUTURE = 'Publishing date and time must be in the future';

/** Every internal role but the admin's. */
const OTHER_ROLES = ['publisher', 'imrg-manager', 'imrg-reviewer'];

const SCHEDULE = `POST /api/internal/indicators/${ID}/schedule` as const;

const approved = indicatorDetail({
  id: ID,
  draftLocked: true,
  draftSubmissionStatus: 'approved',
  draftSubmissionNumber: 1,
  draftFirstSubmittedAt: '2026-01-02T00:00:00.000Z',
  draftReviewers: [{ id: '00000000-0000-7000-8000-000000000002', name: 'Jamie Evans' }],
  draftResponse: { kind: 'approved', flaggedTaskCount: 0 },
  draftResponseKind: 'approved',
  draftScheduledPublishAt: SHOWN,
  actions: ['schedule'],
});

/** An API that answers the indicator's detail with `detail`. */
function reading(detail: FakeApiAnswer) {
  return createFakeApiClient({ [`GET /api/internal/indicators/${ID}`]: detail });
}

async function respond(
  handler: (args: never) => Promise<unknown>,
  api: FakeApiClient,
  request: Request,
  roles: readonly string[] = ['admin'],
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

describe('loadPublicationDate', () => {
  it.each([
    ['confirm the date of an approved draft', approved],
    [
      'change the date of a scheduled version',
      { ...approved, draftStatus: 'scheduled', actions: ['change_publication_date'] },
    ],
  ])('opens with the date and time in UK time, to %s', async (_, indicator) => {
    const { outcome } = await respond(loadPublicationDate, reading(indicator), new Request(PATH));

    expect(outcome).toEqual({
      id: ID,
      values: {
        publishingDateDay: '1',
        publishingDateMonth: '4',
        publishingDateYear: '2027',
        publishingTimeHour: '09',
        publishingTimeMinute: '30',
      },
      shownScheduledPublishAt: SHOWN,
    });
  });

  it('sends the admin to the overview, saying why, once the date cannot be changed', async () => {
    const api = reading({ ...approved, actions: [] });

    const { response } = await respond(loadPublicationDate, api, new Request(PATH));

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: OVERVIEW,
      flash: 'publication-date-refused',
    });
  });

  it.each(OTHER_ROLES)(
    'is not found for a %s, who may not schedule publication, asking the API nothing',
    async (role) => {
      const api = reading(approved);

      const { response } = await respond(loadPublicationDate, api, new Request(PATH), [role]);

      expect(response.status).toBe(404);
      expect(api.calls).toEqual([]);
    },
  );
});

describe('confirmPublicationDate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-04T12:00:00.000Z'), toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function post(day = '1', month = '4', year = '2027') {
    return new Request(PATH, {
      method: 'POST',
      body: new URLSearchParams({
        'publishingDate[day]': day,
        'publishingDate[month]': month,
        'publishingDate[year]': year,
        'publishingTime[hour]': '09',
        'publishingTime[minute]': '30',
        shownScheduledPublishAt: SHOWN,
      }),
    });
  }

  it('confirms the date as typed, naming the date shown, then says so on the overview', async () => {
    const api = createFakeApiClient({ [SCHEDULE]: noContent });

    const { response } = await respond(confirmPublicationDate, api, post('2'));

    expect(api.calls).toEqual([
      {
        method: 'POST',
        path: `/api/internal/indicators/${ID}/schedule`,
        body: {
          publishingDateDay: '2',
          publishingDateMonth: '4',
          publishingDateYear: '2027',
          publishingTimeHour: '09',
          publishingTimeMinute: '30',
          shownScheduledPublishAt: SHOWN,
        },
      },
    ]);
    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: OVERVIEW,
      flash: 'publication-date-confirmed',
    });
  });

  it('re-renders the page with the errors for a date in the past, asking the API nothing', async () => {
    const api = createFakeApiClient();

    const { outcome } = await respond(confirmPublicationDate, api, post('3', '11', '2026'));

    expect(outcome).toEqual({
      values: {
        publishingDateDay: '3',
        publishingDateMonth: '11',
        publishingDateYear: '2026',
        publishingTimeHour: '09',
        publishingTimeMinute: '30',
      },
      shownScheduledPublishAt: SHOWN,
      fieldErrors: {
        publishingDateDay: FUTURE,
        publishingDateMonth: FUTURE,
        publishingDateYear: FUTURE,
      },
    });
    expect(api.calls).toEqual([]);
  });

  it("shows the API's field errors on the page", async () => {
    const api = createFakeApiClient({
      [SCHEDULE]: refused(400, {
        error: 'validation_failed',
        fieldErrors: { publishingDateDay: FUTURE },
      }),
    });

    const { outcome } = await respond(confirmPublicationDate, api, post());

    expect(outcome).toMatchObject({ fieldErrors: { publishingDateDay: FUTURE } });
  });

  it.each([
    ['changed', 'publication-date-changed'],
    ['not_allowed', 'publication-date-refused'],
    ['invalid_request', 'publication-date-refused'],
  ])('says on the overview why the API refused the date with %s', async (error, flash) => {
    const api = createFakeApiClient({ [SCHEDULE]: refused(409, { error }) });

    const { response } = await respond(confirmPublicationDate, api, post());

    expect(await redirectWithFlash(response)).toEqual({ status: 302, location: OVERVIEW, flash });
  });

  it('says on the overview that the date can no longer be changed once nothing is unpublished', async () => {
    const api = createFakeApiClient({
      [SCHEDULE]: fails(new Response('Not Found', { status: 404 })),
    });

    const { response } = await respond(confirmPublicationDate, api, post());

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: OVERVIEW,
      flash: 'publication-date-refused',
    });
  });

  it.each(OTHER_ROLES)('is not found for a %s, who may not schedule publication', async (role) => {
    const api = createFakeApiClient();

    const { response } = await respond(confirmPublicationDate, api, post(), [role]);

    expect(response.status).toBe(404);
    expect(api.calls).toEqual([]);
  });
});
