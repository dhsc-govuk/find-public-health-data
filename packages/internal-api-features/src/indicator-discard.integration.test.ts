import { TEAM_IDS } from '@fphd/auth';
import type { Database } from '@fphd/db';
import { request } from '@fphd/express/testing';
import { BlobNotFoundError, type BlobStorage } from '@fphd/internal-storage';
import { createFakeBlobStorage } from '@fphd/internal-storage/testing';
import { describe, expect } from 'vitest';

import { internalApiRoutes } from './index.ts';
import { newDraft, repositoryTest } from './indicator-repository.testing.ts';
import { openedUpdate } from './indicator-workflow.testing.ts';
import { stepWhileWriteHolds } from './indicator-workflow-concurrency.testing.ts';
import { createInternalRepositories } from './repositories.ts';
import {
  createRouterTestApp,
  noPublicRoutes,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

function createTestApp(db: Database, storage: BlobStorage = createFakeBlobStorage()) {
  return createRouterTestApp(
    internalApiRoutes({
      repositories: createInternalRepositories(db),
      session: testSessionVerifier,
      storage,
      publicRoutes: noPublicRoutes,
    }),
  );
}

const READS = [
  '',
  '/task-list',
  '/polarity',
  '/data-table',
  '/data-table/values?column=areaCode',
  '/data-uploads/latest',
  '/revision-response',
  '/notes-for-reviewers',
  '/history',
  '/preview/api/indicators/108',
];

const CSV = [
  'area_code,period_start,period_end,value,count,sex,age,category_type,category,value_note',
  'E92000001,2019-04-01,2020-03-31,83.8,1234,Female,<75 yrs,,,',
].join('\n');

/** Storage that also says which files were put in it, as their names hold generated ids. */
function recordingStorage(storage: BlobStorage) {
  const names: string[] = [];
  return {
    names,
    storage: {
      ...storage,
      put: async (...[name, content]: Parameters<BlobStorage['put']>) => {
        await storage.put(name, content);
        names.push(name);
      },
    } satisfies BlobStorage,
  };
}

describe('discarding a draft through the API', () => {
  repositoryTest(
    'deletes a new indicator and its file, leaving nothing for anyone to open',
    async ({ db }) => {
      const { indicatorId } = await newDraft(db, 'Discarded through the API');
      const { names, storage } = recordingStorage(createFakeBlobStorage());
      const app = createTestApp(db, storage);
      const cookie = await testSessionCookie(['publisher']);
      const path = `/api/internal/indicators/${indicatorId}`;
      const uploaded = await request(app)
        .post(`${path}/data-uploads`)
        .set('Cookie', cookie)
        .attach('dataTable', Buffer.from(CSV), 'data.csv');
      expect(uploaded.status).toBe(201);
      const detail = (await request(app).get(path).set('Cookie', cookie)).body;
      expect(detail).toMatchObject({ canDiscardDraft: true });
      const discard = () =>
        request(app)
          .post(`${path}/discard`)
          .set('Cookie', cookie)
          .send({ draftUpdatedAt: detail.draftUpdatedAt });

      expect((await discard()).status).toBe(204);

      expect(names).toHaveLength(1);
      await expect
        .poll(() => storage.get(names[0] ?? '').catch((error: unknown) => error))
        .toBeInstanceOf(BlobNotFoundError);
      expect((await discard()).status).toBe(404);
      const admin = await testSessionCookie(['admin'], []);
      for (const read of READS) {
        for (const user of [cookie, admin]) {
          const response = await request(app).get(`${path}${read}`).set('Cookie', user);
          expect(response.status, read).toBe(404);
          expect(response.body, read).toEqual({ error: 'not_found' });
        }
      }
      const save = await request(app)
        .put(`${path}/polarity`)
        .set('Cookie', cookie)
        .send({ answers: { polarity: 'no-polarity' }, version: 'a'.repeat(64) });
      expect(save.status).toBe(404);
    },
  );

  repositoryTest(
    'answers a second post that overlaps the first as already discarded',
    async ({ db }) => {
      const { indicatorId } = await newDraft(db, 'Discarded by overlapping posts');
      const app = createTestApp(db);
      const cookie = await testSessionCookie(['publisher']);
      const path = `/api/internal/indicators/${indicatorId}`;
      const { draftUpdatedAt } = (await request(app).get(path).set('Cookie', cookie)).body;
      const discard = async () => {
        const { status, body } = await request(app)
          .post(`${path}/discard`)
          .set('Cookie', cookie)
          .send({ draftUpdatedAt });
        return { status, body };
      };

      // Each request passes the guard, and the second then waits for the first to commit.
      const { write: first, step: second } = await stepWhileWriteHolds(db, discard, discard);

      expect(first.status).toBe(204);
      expect(second).toEqual({ status: 409, body: { error: 'already_discarded' } });
      expect((await request(app).get(path).set('Cookie', cookie)).status).toBe(404);
    },
  );

  repositoryTest('deletes the draft though its file fails to delete', async ({ db }) => {
    const { indicatorId } = await newDraft(db, 'Discarded with its file stuck');
    const app = createTestApp(db, {
      ...createFakeBlobStorage(),
      delete: async () => {
        throw new Error('the storage is down');
      },
    });
    const cookie = await testSessionCookie(['publisher']);
    const path = `/api/internal/indicators/${indicatorId}`;
    await request(app)
      .post(`${path}/data-uploads`)
      .set('Cookie', cookie)
      .attach('dataTable', Buffer.from(CSV), 'data.csv');
    const { draftUpdatedAt } = (await request(app).get(path).set('Cookie', cookie)).body;

    const discarded = await request(app)
      .post(`${path}/discard`)
      .set('Cookie', cookie)
      .send({ draftUpdatedAt });

    expect(discarded.status).toBe(204);
    expect((await request(app).get(path).set('Cookie', cookie)).status).toBe(404);
  });

  repositoryTest(
    'leaves a live indicator its overview, with no draft to open, save or discard',
    async ({ db }) => {
      const { indicatorId } = await openedUpdate(db, 'Update discarded through the API');
      const app = createTestApp(db);
      const cookie = await testSessionCookie(['publisher']);
      const path = `/api/internal/indicators/${indicatorId}`;
      const section = (await request(app).get(`${path}/polarity`).set('Cookie', cookie)).body;
      const { draftUpdatedAt } = (await request(app).get(path).set('Cookie', cookie)).body;
      const discard = () =>
        request(app).post(`${path}/discard`).set('Cookie', cookie).send({ draftUpdatedAt });

      expect((await discard()).status).toBe(204);

      expect((await request(app).get(path).set('Cookie', cookie)).body).toMatchObject({
        indicatorStatus: 'live',
        draftStatus: null,
        draftUpdatedAt: null,
        canDiscardDraft: false,
      });
      for (const read of [
        '/task-list',
        '/polarity',
        '/data-table',
        '/data-table/values?column=areaCode',
        '/preview/api/indicators/108',
      ]) {
        const response = await request(app).get(`${path}${read}`).set('Cookie', cookie);
        expect(response.status, read).toBe(404);
        expect(response.body, read).toEqual({ error: 'no_draft' });
      }
      const save = await request(app)
        .put(`${path}/polarity`)
        .set('Cookie', cookie)
        .send({ answers: section.answers, version: section.version });
      expect(save.status).toBe(404);
      const again = await discard();
      expect(again.status).toBe(409);
      expect(again.body).toEqual({ error: 'already_discarded' });
    },
  );

  repositoryTest(
    'is closed to a publisher in another team, who may see the indicator',
    async ({ db }) => {
      const { indicatorId } = await newDraft(db, 'Seen by another team');
      const app = createTestApp(db);
      const teamA = await testSessionCookie(['publisher']);
      const teamB = await testSessionCookie(['publisher'], [TEAM_IDS.teamB]);
      const path = `/api/internal/indicators/${indicatorId}`;
      const { draftUpdatedAt } = (await request(app).get(path).set('Cookie', teamA)).body;

      const seen = await request(app).get(path).set('Cookie', teamB);
      expect(seen.status).toBe(200);
      expect(seen.body).toMatchObject({ canDiscardDraft: false, draftUpdatedAt: null });

      const discard = await request(app)
        .post(`${path}/discard`)
        .set('Cookie', teamB)
        .send({ draftUpdatedAt });
      expect(discard.status).toBe(404);
      expect((await request(app).get(path).set('Cookie', teamA)).status).toBe(200);
    },
  );
});
