import { TEAM_IDS } from '@fphd/auth';
import { request } from '@fphd/express/testing';
import { createFakeBlobStorage } from '@fphd/internal-storage/testing';
import { describe, expect } from 'vitest';

import { editVersion } from './edit-version.ts';
import { internalApiRoutes } from './index.ts';
import { newDraft, repositoryTest } from './indicator-repository.testing.ts';
import { createInternalRepositories } from './repositories.ts';
import { createRouterTestApp, testSessionCookie, testSessionVerifier } from './testing.ts';

describe("the publish journey's endpoints, for a publisher in another team", () => {
  repositoryTest(
    'refuses every write to a Team A indicator and every read of it',
    async ({ db }) => {
      const { indicatorId } = await newDraft(db, 'A Team A draft');
      const app = createRouterTestApp(
        internalApiRoutes({
          repositories: createInternalRepositories(db),
          session: testSessionVerifier,
          storage: createFakeBlobStorage(),
        }),
      );
      const teamB = await testSessionCookie(['internal', 'publisher'], [TEAM_IDS.teamB]);
      const path = `/api/internal/indicators/${indicatorId}`;

      const writes = {
        name: request(app).patch(path).send({ name: 'Renamed by Team B' }),
        section: request(app).put(`${path}/definition-and-rationale`).send({ definition: 'B' }),
        upload: request(app).post(`${path}/data-uploads`).send('area_code\n'),
        confirmation: request(app).put(`${path}/data-table/confirmation`).send({}),
        submit: request(app)
          .post(`${path}/submit`)
          .send({ draftUpdatedAt: new Date().toISOString() }),
        withdraw: request(app).post(`${path}/withdraw`).send({ submissionNumber: 1 }),
      };
      for (const [write, pending] of Object.entries(writes)) {
        const response = await pending.set('Cookie', teamB);
        expect(response.status, write).toBe(403);
      }

      for (const read of [
        'task-list',
        'definition-and-rationale',
        'data-table',
        'data-uploads/latest',
      ]) {
        const response = await request(app).get(`${path}/${read}`).set('Cookie', teamB);
        expect(response.status, read).toBe(404);
      }

      const own = await request(app)
        .patch(path)
        .set('Cookie', await testSessionCookie(['internal', 'publisher'], [TEAM_IDS.teamA]))
        .send({ name: 'Renamed by Team A', version: editVersion({ name: 'A Team A draft' }) });
      expect(own.status).toBe(200);
    },
  );
});
