import { Readable } from 'node:stream';

import { request } from '@fphd/express/testing';
import type { BlobStorage } from '@fphd/internal-storage';
import { createFakeBlobStorage } from '@fphd/internal-storage/testing';
import type { Logger } from '@fphd/logger';
import { createCapturingLogger } from '@fphd/logger/testing';
import { describe, expect, it, vi } from 'vitest';

import { indicatorDiscardRouter } from './indicator-discard.ts';
import type { DiscardDraftResult } from './indicator-discard-repository.ts';
import type { IndicatorAccessRow } from './indicator-list-repository.ts';
import type { InternalIndicatorRepository } from './repositories.ts';
import {
  createRouterTestApp,
  handlerLogLines,
  TEST_TEAM_ID,
  testActor,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TEAM_ID = '00000000-0000-7000-8000-00000000000b';
const DRAFT_UPDATED_AT = '2026-10-22T09:30:00.123Z';
const PATH = `/api/internal/indicators/${ID}/discard`;
const BODY = { draftUpdatedAt: DRAFT_UPDATED_AT };

const DISCARDED: DiscardDraftResult = { ok: true, indicatorDeleted: true, deletedBlobNames: [] };

const inTeam: IndicatorAccessRow = { teamId: TEST_TEAM_ID, draftReviewers: [] };

function createTestApp({
  discardDraft = vi.fn().mockResolvedValue(DISCARDED),
  access = inTeam,
  storage = createFakeBlobStorage(),
  logger,
}: {
  discardDraft?: InternalIndicatorRepository['discardDraft'];
  access?: IndicatorAccessRow;
  storage?: BlobStorage;
  logger?: Logger;
} = {}) {
  return createRouterTestApp(
    indicatorDiscardRouter(
      { discardDraft, findAccess: async (id) => (id === ID ? access : undefined) },
      storage,
      testSessionVerifier,
    ),
    logger,
  );
}

function publisherCookie() {
  return testSessionCookie(['publisher']);
}

describe('POST /api/internal/indicators/:id/discard', () => {
  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).post(PATH).send(BODY);

    expect(response.status).toBe(401);
  });

  it.each([
    ['a publisher who may see the indicator but not edit it', ['publisher'], 404],
    ['an admin', ['admin'], 403],
    ['an IMRG manager', ['imrg-manager'], 403],
  ])('refuses %s', async (_user, roles, status) => {
    const discardDraft = vi.fn();
    const app = createTestApp({ discardDraft, access: { ...inTeam, teamId: OTHER_TEAM_ID } });

    const response = await request(app)
      .post(PATH)
      .set('Cookie', await testSessionCookie(roles))
      .send(BODY);

    expect(response.status).toBe(status);
    expect(discardDraft).not.toHaveBeenCalled();
  });

  it('answers 404 for an indicator that does not exist', async () => {
    const response = await request(createTestApp())
      .post('/api/internal/indicators/00000000-0000-7000-8000-000000000002/discard')
      .set('Cookie', await publisherCookie())
      .send(BODY);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('discards the draft as it was shown, by its last edit, and logs it', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');
    const discardDraft = vi.fn().mockResolvedValue(DISCARDED);

    const response = await request(createTestApp({ discardDraft, logger }))
      .post(PATH)
      .set('Cookie', await publisherCookie())
      .send(BODY);

    expect(response.status).toBe(204);
    expect(discardDraft).toHaveBeenCalledWith(ID, new Date(DRAFT_UPDATED_AT), testActor(response));
    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({
        msg: 'Indicator draft discarded',
        indicatorId: ID,
        indicatorDeleted: true,
      }),
    ]);
  });

  it("deletes the draft's files once it has answered", async () => {
    const storage = createFakeBlobStorage();
    await storage.put('mine.csv', Readable.from(['a']));
    await storage.put('kept.csv', Readable.from(['b']));
    const discardDraft = vi
      .fn()
      .mockResolvedValue({ ...DISCARDED, deletedBlobNames: ['mine.csv'] });

    const response = await request(createTestApp({ discardDraft, storage }))
      .post(PATH)
      .set('Cookie', await publisherCookie())
      .send(BODY);

    expect(response.status).toBe(204);
    await expect.poll(() => storage.get('mine.csv').catch(() => 'gone')).toBe('gone');
    await expect(storage.get('kept.csv')).resolves.toBeDefined();
  });

  it('discards the draft though a file fails to delete, logging the file and deleting the rest', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');
    const deleted: string[] = [];
    const storage: BlobStorage = {
      ...createFakeBlobStorage(),
      delete: async (name) => {
        if (name === 'stuck.csv') throw new Error('the storage is down');
        deleted.push(name);
      },
    };
    const discardDraft = vi
      .fn()
      .mockResolvedValue({ ...DISCARDED, deletedBlobNames: ['stuck.csv', 'other.csv'] });

    const response = await request(createTestApp({ discardDraft, storage, logger }))
      .post(PATH)
      .set('Cookie', await publisherCookie())
      .send(BODY);

    expect(response.status).toBe(204);
    await expect.poll(() => deleted).toEqual(['other.csv']);
    expect(await handlerLogLines(lines)).toContainEqual(
      expect.objectContaining({ msg: 'Blob not deleted', blobName: 'stuck.csv' }),
    );
  });

  it.each([
    ['a missing last edit', {}],
    ['a last edit with no time', { draftUpdatedAt: '2026-10-22' }],
  ])('refuses %s without asking the repository', async (_case, body) => {
    const discardDraft = vi.fn();

    const response = await request(createTestApp({ discardDraft }))
      .post(PATH)
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_draft_updated_at' });
    expect(discardDraft).not.toHaveBeenCalled();
  });

  it.each(['not_allowed', 'changed', 'upload_running', 'already_discarded'] as const)(
    'answers 409 %s',
    async (reason) => {
      const discardDraft = vi.fn().mockResolvedValue({ ok: false, reason });

      const response = await request(createTestApp({ discardDraft }))
        .post(PATH)
        .set('Cookie', await publisherCookie())
        .send(BODY);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: reason });
    },
  );
});
