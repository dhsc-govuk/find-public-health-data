import { request } from '@fphd/express/testing';
import { createFakeBlobStorage } from '@fphd/internal-storage/testing';
import { describe, expect } from 'vitest';

import { internalApiRoutes } from './index.ts';
import { newDraft, repositoryTest } from './indicator-repository.testing.ts';
import { completeDraft } from './indicator-workflow.testing.ts';
import { createInternalRepositories } from './repositories.ts';
import { createRouterTestApp, testSessionCookie, testSessionVerifier } from './testing.ts';

describe('submitting and withdrawing through the API', () => {
  repositoryTest(
    'locks the draft with the last edit the task list gave, and unlocks it on withdrawal',
    async ({ db }) => {
      const created = await newDraft(db, 'A draft submitted through the API');
      await completeDraft(db, created);
      const app = createRouterTestApp(
        internalApiRoutes({
          repositories: createInternalRepositories(db),
          session: testSessionVerifier,
          storage: createFakeBlobStorage(),
        }),
      );
      const cookie = await testSessionCookie(['publisher']);
      const path = `/api/internal/indicators/${created.indicatorId}`;
      const taskList = async () =>
        (await request(app).get(`${path}/task-list`).set('Cookie', cookie)).body;

      const shown = await taskList();
      expect(shown).toMatchObject({ canSubmit: true, editable: true, actions: ['submit'] });

      const submitted = await request(app)
        .post(`${path}/submit`)
        .set('Cookie', cookie)
        .send({ draftUpdatedAt: shown.draftUpdatedAt });
      expect(submitted.status).toBe(204);
      expect(await taskList()).toMatchObject({
        indicator: { draftSubmissionStatus: 'submitted' },
        editable: false,
        actions: ['withdraw'],
      });
      const detail = await request(app).get(path).set('Cookie', cookie);
      expect(detail.body).toMatchObject({
        draftLocked: true,
        draftSubmissionNumber: 1,
        actions: ['withdraw'],
      });
      const section = await request(app).get(`${path}/polarity`).set('Cookie', cookie);
      expect(section.status).toBe(409);

      const withdrawn = await request(app)
        .post(`${path}/withdraw`)
        .set('Cookie', cookie)
        .send({ submissionNumber: detail.body.draftSubmissionNumber });
      expect(withdrawn.status).toBe(204);
      expect(await taskList()).toMatchObject({
        indicator: { draftSubmissionStatus: 'withdrawn' },
        editable: true,
        actions: ['submit'],
        draftUpdatedAt: shown.draftUpdatedAt,
      });
    },
  );
});
