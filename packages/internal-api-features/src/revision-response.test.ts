import { TEAM_IDS } from '@fphd/auth';
import { request } from '@fphd/express/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { revisionResponseSchema } from './contract.ts';
import { editVersion } from './edit-version.ts';
import type { InternalIndicatorRepository } from './repositories.ts';
import { revisionResponseRouter } from './revision-response.ts';
import { type RevisionRoundRow, revisionReplyVersion } from './revision-response-repository.ts';
import {
  createRouterTestApp,
  TEST_TEAM_ID,
  testActor,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const path = `/api/internal/indicators/${ID}/revision-response`;

const round: RevisionRoundRow = {
  hasDraft: true,
  draftLocked: false,
  submissionNumber: 1,
  submissionStatus: 'changes_requested',
  kind: 'minor_revisions',
  clarificationRequest: { notes: 'Which years?', reviewerName: 'Sam Reviewer' },
  revisionResponse: 'Checked the years',
  flags: [
    { task: 'polarity', notes: 'Is higher better?', reviewerName: 'Sam Reviewer', cleared: true },
    { task: 'name', notes: 'Shorter', reviewerName: 'Sam Reviewer', cleared: false },
  ],
};

const VERSION = revisionReplyVersion(round);

type Indicators = Pick<
  InternalIndicatorRepository,
  'findTeamId' | 'findRevisionRound' | 'saveRevisionResponse'
>;

function createTestApp(indicators: Partial<Indicators> = {}): Express {
  return createRouterTestApp(
    revisionResponseRouter(
      {
        findTeamId: async () => TEST_TEAM_ID,
        findRevisionRound: async () => round,
        saveRevisionResponse: async () => ({ ok: true, version: VERSION }),
        ...indicators,
      },
      testSessionVerifier,
    ),
  );
}

const asPublisher = () => testSessionCookie(['publisher']);

describe('GET the revision response', () => {
  it('answers the reply, what the round asked for and the reply’s version', async () => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await asPublisher());

    expect(response.status).toBe(200);
    expect(revisionResponseSchema.parse(response.body)).toEqual({
      kind: 'minor_revisions',
      clarificationRequest: 'Which years?',
      flaggedTaskCount: 2,
      revisionResponse: 'Checked the years',
      version: VERSION,
    });
  });

  it.each([
    ['no indicator', undefined, 404, 'not_found'],
    ['no draft', { ...round, hasDraft: false }, 404, 'no_draft'],
    ['a locked draft', { ...round, draftLocked: true }, 409, 'locked'],
    [
      'a draft never sent back',
      { ...round, submissionStatus: null, kind: null },
      409,
      'not_allowed',
    ],
    [
      'a withdrawn submission',
      { ...round, submissionStatus: 'withdrawn' as const },
      409,
      'not_allowed',
    ],
  ])('refuses %s', async (_case, found, status, error) => {
    const response = await request(createTestApp({ findRevisionRound: async () => found }))
      .get(path)
      .set('Cookie', await asPublisher());

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error });
  });

  it('refuses an id that is not one', async () => {
    const response = await request(createTestApp())
      .get('/api/internal/indicators/not-an-id/revision-response')
      .set('Cookie', await asPublisher());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it.each([
    ['an IMRG reviewer', ['imrg-reviewer'], [TEST_TEAM_ID], 403],
    ['the IMRG manager', ['imrg-manager'], [TEST_TEAM_ID], 403],
    ['a publisher in another team', ['publisher'], [TEAM_IDS.teamB], 404],
  ])('refuses %s', async (_case, roles, teams, status) => {
    const findRevisionRound = vi.fn();
    const response = await request(createTestApp({ findRevisionRound }))
      .get(path)
      .set('Cookie', await testSessionCookie(roles, teams));

    expect(response.status).toBe(status);
    expect(findRevisionRound).not.toHaveBeenCalled();
  });
});

describe('PUT the revision response', () => {
  it('saves the trimmed reply as the publisher and answers it with its new version', async () => {
    const saved = revisionReplyVersion({
      submissionNumber: 1,
      revisionResponse: 'Changed the name',
    });
    const saveRevisionResponse = vi.fn().mockResolvedValue({ ok: true, version: saved });
    // A teammate resubmitting straight after the save leaves the answer to the save alone.
    const findRevisionRound = vi
      .fn()
      .mockResolvedValueOnce(round)
      .mockResolvedValue({ ...round, draftLocked: true, submissionStatus: 'in_review' });

    const response = await request(createTestApp({ findRevisionRound, saveRevisionResponse }))
      .put(path)
      .set('Cookie', await asPublisher())
      .send({ revisionResponse: '  Changed the name  ', version: VERSION });

    expect(response.status).toBe(200);
    expect(saveRevisionResponse).toHaveBeenCalledWith(
      ID,
      'Changed the name',
      { version: VERSION, versionOf: expect.any(Function) },
      testActor(response),
    );
    expect(saveRevisionResponse.mock.lastCall?.[2].versionOf(round)).toBe(VERSION);
    expect(response.body).toEqual({
      kind: round.kind,
      clarificationRequest: 'Which years?',
      flaggedTaskCount: round.flags.length,
      revisionResponse: 'Changed the name',
      version: saved,
    });
  });

  it('refuses an empty reply, saying what the round asked for', async () => {
    const saveRevisionResponse = vi.fn();
    const response = await request(createTestApp({ saveRevisionResponse }))
      .put(path)
      .set('Cookie', await asPublisher())
      .send({ revisionResponse: '   ', version: VERSION });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: {
        revisionResponse:
          'Enter your response to the requested revisions and clarification request',
      },
    });
    expect(saveRevisionResponse).not.toHaveBeenCalled();
  });

  it('refuses a reply over 10,000 characters', async () => {
    const response = await request(createTestApp())
      .put(path)
      .set('Cookie', await asPublisher())
      .send({ revisionResponse: 'a'.repeat(10_001), version: VERSION });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: { revisionResponse: 'Your response must be 10,000 characters or fewer' },
    });
  });

  it('refuses an id that is not one before its body', async () => {
    const response = await request(createTestApp())
      .put('/api/internal/indicators/not-an-id/revision-response')
      .set('Cookie', await asPublisher())
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it.each([
    ['no version', { revisionResponse: 'A reply' }],
    ['a reply that is not text', { revisionResponse: 3, version: VERSION }],
  ])('refuses a body with %s', async (_case, body) => {
    const response = await request(createTestApp())
      .put(path)
      .set('Cookie', await asPublisher())
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
  });

  it('refuses a locked draft as locked before its empty reply', async () => {
    const response = await request(
      createTestApp({ findRevisionRound: async () => ({ ...round, draftLocked: true }) }),
    )
      .put(path)
      .set('Cookie', await asPublisher())
      .send({ revisionResponse: '', version: VERSION });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
  });

  it.each([
    [{ ok: false, reason: 'no_draft' }, 404, { error: 'no_draft' }],
    [{ ok: false, reason: 'locked' }, 409, { error: 'locked' }],
    [{ ok: false, reason: 'not_allowed' }, 409, { error: 'not_allowed' }],
    [
      { ok: false, reason: 'changed', version: editVersion('A teammate’s') },
      409,
      { error: 'changed', version: editVersion('A teammate’s') },
    ],
  ])('answers the repository refusing with %o', async (result, status, body) => {
    const response = await request(
      createTestApp({ saveRevisionResponse: async () => result as never }),
    )
      .put(path)
      .set('Cookie', await asPublisher())
      .send({ revisionResponse: 'A reply', version: VERSION });

    expect(response.status).toBe(status);
    expect(response.body).toEqual(body);
  });

  it('refuses a publisher in another team', async () => {
    const saveRevisionResponse = vi.fn();
    const response = await request(createTestApp({ saveRevisionResponse }))
      .put(path)
      .set('Cookie', await testSessionCookie(['publisher'], [TEAM_IDS.teamB]))
      .send({ revisionResponse: 'A reply', version: VERSION });

    expect(response.status).toBe(403);
    expect(saveRevisionResponse).not.toHaveBeenCalled();
  });
});
