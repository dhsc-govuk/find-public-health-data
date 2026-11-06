import { TEAM_IDS } from '@fphd/auth';
import { request } from '@fphd/express/testing';
import type { Logger } from '@fphd/logger';
import { createCapturingLogger } from '@fphd/logger/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { reviewerNotesSchema } from './contract.ts';
import type { IndicatorAccessRow } from './indicator-list-repository.ts';
import type { InternalReviewerNoteRepository } from './repositories.ts';
import {
  type ListedReviewerNoteRow,
  type ReviewerNoteRow,
  reviewerNoteVersion,
} from './reviewer-note-repository.ts';
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

const ROBIN = { id: '00000000-0000-7000-8000-0000000000a2', name: 'Robin Shaw' };

const listed: ListedReviewerNoteRow[] = [
  {
    id: '00000000-0000-7000-8000-0000000000e2',
    text: 'Numerator checked',
    createdAt: new Date('2026-11-04T09:00:00.000Z'),
    updatedAt: new Date('2026-11-04T09:00:00.000Z'),
    author: ROBIN,
  },
  { ...note, author: { id: TEST_USER_ID, name: 'Sam Taylor' } },
];

function createTestApp(
  reviewerNotes: Partial<InternalReviewerNoteRepository> = {},
  findAccess: () => Promise<IndicatorAccessRow | undefined> = async () => assignedToTestUser,
  logger?: Logger,
): Express {
  return createRouterTestApp(
    reviewerNotesRouter(
      {
        list: async () => listed,
        add: async () => ({ ok: true, note }),
        update: async () => ({ ok: true, note, changed: true }),
        ...reviewerNotes,
      },
      { findAccess },
      testSessionVerifier,
    ),
    logger,
  );
}

const asReviewer = () => testSessionCookie(['imrg-reviewer'], []);

/**
 * Everyone who may not read the notes, each with access the test user could otherwise use: 404
 * for those who may not see the indicator, 403 for those who may.
 */
const NOT_READERS = [
  ['an unassigned reviewer', ['imrg-reviewer'], [], assignedToSomeoneElse, 404],
  ['a publisher in its team', ['publisher'], [TEST_TEAM_ID], assignedToSomeoneElse, 403],
  [
    'an assigned publisher without the reviewer role',
    ['publisher'],
    [TEAM_IDS.teamB],
    assignedToTestUser,
    404,
  ],
] as const;

/** Everyone who may not write notes, with the answers as for `NOT_READERS`. */
const NOT_WRITERS = [
  ['an unassigned reviewer', ['imrg-reviewer'], [], assignedToSomeoneElse, 404],
  ['the IMRG manager', ['imrg-manager'], [], assignedToSomeoneElse, 403],
  ['an admin', ['admin'], [], assignedToSomeoneElse, 403],
  ['a publisher in its team', ['publisher'], [TEST_TEAM_ID], assignedToSomeoneElse, 403],
  [
    'an assigned publisher without the reviewer role',
    ['publisher'],
    [TEAM_IDS.teamB],
    assignedToTestUser,
    404,
  ],
] as const;

describe('GET /api/internal/indicators/:id/reviewer-notes', () => {
  it("serves an assigned reviewer every reviewer's notes, each with its author and version", async () => {
    const list = vi.fn().mockResolvedValue(listed);

    const response = await request(createTestApp({ list }))
      .get(path)
      .set('Cookie', await asReviewer());

    expect(response.status).toBe(200);
    expect(reviewerNotesSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      notes: [
        {
          id: '00000000-0000-7000-8000-0000000000e2',
          text: 'Numerator checked',
          createdAt: '2026-11-04T09:00:00.000Z',
          updatedAt: '2026-11-04T09:00:00.000Z',
          version: reviewerNoteVersion({ text: 'Numerator checked' }),
          author: ROBIN,
        },
        {
          id: NOTE_ID,
          text: 'Check the 2019 dip',
          createdAt: '2026-11-03T10:15:00.123Z',
          updatedAt: '2026-11-03T11:00:00.456Z',
          version: VERSION,
          author: { id: TEST_USER_ID, name: 'Sam Taylor' },
        },
      ],
    });
    expect(list).toHaveBeenCalledWith(ID);
  });

  it.each([
    ['the IMRG manager', ['imrg-manager']],
    ['an admin', ['admin']],
  ] as const)("serves %s every reviewer's notes", async (_, roles) => {
    const response = await request(createTestApp({}, async () => assignedToSomeoneElse))
      .get(path)
      .set('Cookie', await testSessionCookie(roles, []));

    expect(response.status).toBe(200);
    expect(response.body.notes).toHaveLength(2);
  });

  it.each(NOT_READERS)('answers %s %i', async (_, roles, teams, access, status) => {
    const response = await request(createTestApp({}, async () => access))
      .get(path)
      .set('Cookie', await testSessionCookie(roles, teams));

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: status === 404 ? 'not_found' : 'forbidden' });
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

  it.each(NOT_WRITERS)('answers %s %i', async (_, roles, teams, access, status) => {
    const add = vi.fn();

    const response = await request(createTestApp({ add }, async () => access))
      .post(path)
      .set('Cookie', await testSessionCookie(roles, teams))
      .send({ text: 'Not mine' });

    expect(response.status).toBe(status);
    expect(add).not.toHaveBeenCalled();
  });
});

describe('PUT /api/internal/indicators/:id/reviewer-notes/:noteId', () => {
  it('edits the note against the version shown, answering it, and logs it', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');
    const edited = { ...note, text: 'Settled' };
    const update = vi.fn().mockResolvedValue({ ok: true, note: edited, changed: true });

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

  it('answers the note and logs nothing for an edit that changes nothing', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');
    const update = vi.fn().mockResolvedValue({ ok: true, note, changed: false });

    const response = await request(createTestApp({ update }, undefined, logger))
      .put(notePath)
      .set('Cookie', await asReviewer())
      .send({ text: note.text, version: VERSION });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ id: NOTE_ID, version: VERSION }));
    expect(await handlerLogLines(lines)).toEqual([]);
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

  it.each(NOT_WRITERS)('answers %s %i', async (_, roles, teams, access, status) => {
    const update = vi.fn();

    const response = await request(createTestApp({ update }, async () => access))
      .put(notePath)
      .set('Cookie', await testSessionCookie(roles, teams))
      .send({ text: 'Not mine', version: VERSION });

    expect(response.status).toBe(status);
    expect(update).not.toHaveBeenCalled();
  });
});
