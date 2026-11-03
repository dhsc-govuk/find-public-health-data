import { TEAM_IDS } from '@fphd/auth';
import { request } from '@fphd/express/testing';
import type { Logger } from '@fphd/logger';
import { createCapturingLogger } from '@fphd/logger/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { reviewerNotesSchema } from './contract.ts';
import type { IndicatorAccessRow } from './indicator-list-repository.ts';
import type { InternalReviewerNoteRepository } from './repositories.ts';
import { type ReviewerNoteRow, reviewerNoteVersion } from './reviewer-note-repository.ts';
import { reviewerNotesRouter } from './reviewer-notes.ts';
import {
  createRouterTestApp,
  handlerLogLines,
  TEST_TEAM_ID,
  TEST_USER_ID,
  testActor,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const NOTE_ID = '00000000-0000-7000-8000-0000000000e1';
const path = `/api/internal/indicators/${ID}/reviewer-notes`;
const notePath = `${path}/${NOTE_ID}`;

const assignedToTestUser: IndicatorAccessRow = {
  teamId: TEST_TEAM_ID,
  draftReviewers: [{ id: TEST_USER_ID, name: 'Sam Taylor' }],
};

const assignedToSomeoneElse: IndicatorAccessRow = {
  teamId: TEST_TEAM_ID,
  draftReviewers: [{ id: '00000000-0000-7000-8000-0000000000a2', name: 'Robin Shaw' }],
};

const note: ReviewerNoteRow = {
  id: NOTE_ID,
  text: 'Check the 2019 dip',
  createdAt: new Date('2026-11-03T10:15:00.123Z'),
  updatedAt: new Date('2026-11-03T11:00:00.456Z'),
};

const VERSION = reviewerNoteVersion(note);

function createTestApp(
  reviewerNotes: Partial<InternalReviewerNoteRepository> = {},
  findAccess: () => Promise<IndicatorAccessRow | undefined> = async () => assignedToTestUser,
  logger?: Logger,
): Express {
  return createRouterTestApp(
    reviewerNotesRouter(
      {
        list: async () => [note],
        add: async () => ({ ok: true, note }),
        update: async () => ({ ok: true, note }),
        ...reviewerNotes,
      },
      { findAccess },
      testSessionVerifier,
    ),
    logger,
  );
}

const asReviewer = () => testSessionCookie(['internal', 'imrg-reviewer'], []);

/** Everyone the notes are closed to, each with access the test user could otherwise use. */
const REFUSED = [
  ['another reviewer', ['internal', 'imrg-reviewer'], [], assignedToSomeoneElse],
  ['the IMRG manager', ['internal', 'imrg-manager'], [], assignedToSomeoneElse],
  ['an admin', ['internal', 'admin'], [], assignedToSomeoneElse],
  ['a publisher in its team', ['internal', 'publisher'], [TEST_TEAM_ID], assignedToSomeoneElse],
  [
    'an assigned publisher without the reviewer role',
    ['internal', 'publisher'],
    [TEAM_IDS.teamB],
    assignedToTestUser,
  ],
] as const;

describe('GET /api/internal/indicators/:id/reviewer-notes', () => {
  it('serves an assigned reviewer their own notes, each with its version', async () => {
    const list = vi.fn().mockResolvedValue([note]);

    const response = await request(createTestApp({ list }))
      .get(path)
      .set('Cookie', await asReviewer());

    expect(response.status).toBe(200);
    expect(reviewerNotesSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      notes: [
        {
          id: NOTE_ID,
          text: 'Check the 2019 dip',
          createdAt: '2026-11-03T10:15:00.123Z',
          updatedAt: '2026-11-03T11:00:00.456Z',
          version: VERSION,
        },
      ],
    });
    expect(list).toHaveBeenCalledWith(ID, TEST_USER_ID);
  });

  it.each(REFUSED)('answers %s 404', async (_, roles, teams, access) => {
    const response = await request(createTestApp({}, async () => access))
      .get(path)
      .set('Cookie', await testSessionCookie(roles, teams));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('answers 404 for no such indicator', async () => {
    const response = await request(createTestApp({}, async () => undefined))
      .get(path)
      .set('Cookie', await asReviewer());

    expect(response.status).toBe(404);
  });

  it('answers 400 for an id that is not one', async () => {
    const response = await request(createTestApp())
      .get('/api/internal/indicators/not-an-id/reviewer-notes')
      .set('Cookie', await asReviewer());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('rejects an anonymous request', async () => {
    expect((await request(createTestApp()).get(path)).status).toBe(401);
  });
});

describe('POST /api/internal/indicators/:id/reviewer-notes', () => {
  it('adds the trimmed note as the signed-in reviewer, answering 204, and logs it', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');
    const add = vi.fn().mockResolvedValue({ ok: true, note });

    const response = await request(createTestApp({ add }, undefined, logger))
      .post(path)
      .set('Cookie', await asReviewer())
      .send({ text: '  Check the 2019 dip ' });

    expect(response.status).toBe(204);
    expect(add).toHaveBeenCalledWith(ID, 'Check the 2019 dip', testActor(response));
    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({
        level: 30,
        msg: 'Reviewer note added',
        indicatorId: ID,
        noteId: NOTE_ID,
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain('2019 dip');
  });

  it('answers 400 with the field error for empty notes', async () => {
    const response = await request(createTestApp())
      .post(path)
      .set('Cookie', await asReviewer())
      .send({ text: ' ' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: { text: 'Enter your notes' },
    });
  });

  it('answers 400 for a body without text', async () => {
    const response = await request(createTestApp())
      .post(path)
      .set('Cookie', await asReviewer())
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
  });

  it('answers 409 for a reviewer unassigned since the check', async () => {
    const response = await request(
      createTestApp({ add: async () => ({ ok: false, reason: 'not_a_reviewer' }) }),
    )
      .post(path)
      .set('Cookie', await asReviewer())
      .send({ text: 'Too late' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'not_a_reviewer' });
  });

  it.each(REFUSED)('answers %s 404', async (_, roles, teams, access) => {
    const add = vi.fn();

    const response = await request(createTestApp({ add }, async () => access))
      .post(path)
      .set('Cookie', await testSessionCookie(roles, teams))
      .send({ text: 'Not mine' });

    expect(response.status).toBe(404);
    expect(add).not.toHaveBeenCalled();
  });
});

describe('PUT /api/internal/indicators/:id/reviewer-notes/:noteId', () => {
  it('edits the note against the version shown, answering it, and logs it', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');
    const edited = { ...note, text: 'Settled' };
    const update = vi.fn().mockResolvedValue({ ok: true, note: edited });

    const response = await request(createTestApp({ update }, undefined, logger))
      .put(notePath)
      .set('Cookie', await asReviewer())
      .send({ text: 'Settled', version: VERSION });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: NOTE_ID,
        text: 'Settled',
        version: reviewerNoteVersion(edited),
      }),
    );
    const [indicatorId, noteId, text, precondition, actor] = update.mock.calls[0] ?? [];
    expect([indicatorId, noteId, text, actor]).toEqual([
      ID,
      NOTE_ID,
      'Settled',
      testActor(response),
    ]);
    expect(precondition.version).toBe(VERSION);
    expect(precondition.versionOf(note)).toBe(VERSION);
    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({ msg: 'Reviewer note updated', indicatorId: ID, noteId: NOTE_ID }),
    ]);
  });

  it('answers 409 with the current version when the note has changed', async () => {
    const current = reviewerNoteVersion({ text: 'Edited elsewhere' });
    const response = await request(
      createTestApp({ update: async () => ({ ok: false, reason: 'changed', version: current }) }),
    )
      .put(notePath)
      .set('Cookie', await asReviewer())
      .send({ text: 'Settled', version: VERSION });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'changed', version: current });
  });

  it.each([
    ['not_found', 404],
    ['not_a_reviewer', 409],
  ] as const)('answers %s with %i', async (reason, status) => {
    const response = await request(createTestApp({ update: async () => ({ ok: false, reason }) }))
      .put(notePath)
      .set('Cookie', await asReviewer())
      .send({ text: 'Settled', version: VERSION });

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: reason });
  });

  it('answers 400 for a note id that is not one', async () => {
    const response = await request(createTestApp())
      .put(`${path}/not-an-id`)
      .set('Cookie', await asReviewer())
      .send({ text: 'Settled', version: VERSION });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('answers 400 for a body without a version', async () => {
    const response = await request(createTestApp())
      .put(notePath)
      .set('Cookie', await asReviewer())
      .send({ text: 'Settled' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
  });

  it('answers 400 with the field error for empty notes', async () => {
    const response = await request(createTestApp())
      .put(notePath)
      .set('Cookie', await asReviewer())
      .send({ text: '', version: VERSION });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: { text: 'Enter your notes' },
    });
  });

  it.each(REFUSED)('answers %s 404', async (_, roles, teams, access) => {
    const update = vi.fn();

    const response = await request(createTestApp({ update }, async () => access))
      .put(notePath)
      .set('Cookie', await testSessionCookie(roles, teams))
      .send({ text: 'Not mine', version: VERSION });

    expect(response.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });
});
