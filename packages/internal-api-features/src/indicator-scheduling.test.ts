import { request } from '@fphd/express/testing';
import type { Logger } from '@fphd/logger';
import { createCapturingLogger } from '@fphd/logger/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { IndicatorAdminDetailRow } from './indicator-list-repository.ts';
import { indicatorSchedulingRouter } from './indicator-scheduling.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  type FakeInternalRepositoryOverrides,
  handlerLogLines,
  testActor,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TEAM_ID = '00000000-0000-7000-8000-00000000000b';
const PATH = `/api/internal/indicators/${ID}/schedule`;
// Midday on 2 November 2026 in the UK, which is on GMT then.
const NOW = new Date('2026-11-02T12:00:00.000Z');
const SHOWN = '2027-01-04T09:30:00.000Z';

const approvedRow: IndicatorAdminDetailRow = {
  id: ID,
  name: 'Life expectancy at birth',
  teamId: OTHER_TEAM_ID,
  updatedAt: new Date('2026-10-22T09:30:00.123Z'),
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: true,
  draftSubmissionStatus: 'approved',
  draftResponseKind: 'approved',
  draftReviewers: [{ id: '00000000-0000-7000-8000-0000000000a1', name: 'A reviewer' }],
  shortId: 90366,
  publishedSlug: null,
  draftSubmissionNumber: 1,
  draftScheduledPublishAt: new Date(SHOWN),
  draftFirstSubmittedAt: new Date('2026-10-20T09:30:00.000Z'),
  draftResponse: { kind: 'approved', flaggedTaskCount: 0 },
};

const body = {
  publishingDateDay: '4',
  publishingDateMonth: '2',
  publishingDateYear: '2027',
  publishingTimeHour: '15',
  publishingTimeMinute: '05',
  shownScheduledPublishAt: SHOWN,
};

function createTestApp(
  overrides: FakeInternalRepositoryOverrides['indicators'] = {},
  logger?: Logger,
): Express {
  const repositories = createFakeInternalRepositories({
    indicators: { findById: async () => approvedRow, ...overrides },
  });

  return createRouterTestApp(
    indicatorSchedulingRouter(repositories.indicators, testSessionVerifier, () => NOW),
    logger,
  );
}

function adminCookie() {
  return testSessionCookie(['internal', 'admin'], []);
}

describe('POST /api/internal/indicators/:id/schedule', () => {
  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).post(PATH).send(body);

    expect(response.status).toBe(401);
  });

  it.each([
    ['a publisher of its team', ['internal', 'publisher'], [OTHER_TEAM_ID]],
    ['the IMRG manager', ['internal', 'imrg-manager'], []],
    ['its reviewer', ['internal', 'imrg-reviewer'], []],
  ])('refuses %s', async (_, roles, teams) => {
    const schedule = vi.fn();

    const response = await request(createTestApp({ schedule }))
      .post(PATH)
      .set('Cookie', await testSessionCookie(roles, teams))
      .send(body);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a UUID', async () => {
    const response = await request(createTestApp())
      .post('/api/internal/indicators/108/schedule')
      .set('Cookie', await adminCookie())
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('answers 404 for an indicator that does not exist', async () => {
    const response = await request(createTestApp({ findById: async () => undefined }))
      .post(PATH)
      .set('Cookie', await adminCookie())
      .send(body);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('confirms the date as the signed-in admin, answering 204, and logs it', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');
    const schedule = vi.fn().mockResolvedValue({ ok: true });

    const response = await request(createTestApp({ schedule }, logger))
      .post(PATH)
      .set('Cookie', await adminCookie())
      .send(body);

    expect(response.status).toBe(204);
    expect(schedule).toHaveBeenCalledWith(
      ID,
      {
        scheduledPublishAt: new Date('2027-02-04T15:05:00.000Z'),
        shownScheduledPublishAt: new Date(SHOWN),
      },
      testActor(response),
    );
    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({ msg: 'Publication date confirmed', indicatorId: ID }),
    ]);
  });

  it.each([
    ['no body', undefined],
    ['no shown date', { ...body, shownScheduledPublishAt: undefined }],
    ['a shown date that is not one', { ...body, shownScheduledPublishAt: 'soon' }],
    ['a part that is not text', { ...body, publishingDateDay: 4 }],
  ])('refuses %s as invalid without asking the repository', async (_, sent) => {
    const schedule = vi.fn();

    const response = await request(createTestApp({ schedule }))
      .post(PATH)
      .set('Cookie', await adminCookie())
      .send(sent);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('names the date parts of a date in the past', async () => {
    const schedule = vi.fn();

    const response = await request(createTestApp({ schedule }))
      .post(PATH)
      .set('Cookie', await adminCookie())
      .send({
        ...body,
        publishingDateDay: '1',
        publishingDateMonth: '11',
        publishingDateYear: '2026',
      });

    const message = 'Publishing date and time must be in the future';
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: {
        publishingDateDay: message,
        publishingDateMonth: message,
        publishingDateYear: message,
      },
    });
    expect(schedule).not.toHaveBeenCalled();
  });

  it.each([
    ['no_draft', 404],
    ['not_allowed', 409],
    ['changed', 409],
  ] as const)('answers the refusal %s with %i', async (reason, status) => {
    const schedule = vi.fn().mockResolvedValue({ ok: false, reason });

    const response = await request(createTestApp({ schedule }))
      .post(PATH)
      .set('Cookie', await adminCookie())
      .send(body);

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: reason });
  });
});
