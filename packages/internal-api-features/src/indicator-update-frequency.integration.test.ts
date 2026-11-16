import { request } from '@fphd/express/testing';
import { describe, expect } from 'vitest';

import { updateFrequencySection } from './contract.ts';
import { editVersion } from './edit-version.ts';
import { getIndicatorDraftState, updateIndicatorDraft } from './indicator-draft-repository.ts';
import { newDraft, repositoryTest } from './indicator-repository.testing.ts';
import { indicatorSectionRouter } from './indicator-section.ts';
import { updateFrequencyColumns } from './indicator-section-columns.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  inTestTeam,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

describe('update frequency endpoint', () => {
  repositoryTest(
    'saves and clears the optional text independently of the reason',
    async ({ db }) => {
      const { indicatorId } = await newDraft(db, 'Frequency description');
      const repositories = createFakeInternalRepositories({
        indicators: {
          ...inTestTeam,
          findDraftState: (id) => getIndicatorDraftState(db, id),
          updateDraft: (...args) => updateIndicatorDraft(db, ...args),
        },
      });
      const app = createRouterTestApp(
        indicatorSectionRouter(
          repositories.indicators,
          testSessionVerifier,
          updateFrequencySection,
          updateFrequencyColumns,
        ),
      );
      const path = `/api/internal/indicators/${indicatorId}/update-frequency`;
      const cookie = await testSessionCookie(['publisher']);

      for (const updateFrequencyText of ['Academic year.\nPublished in winter.', '']) {
        const before = await getIndicatorDraftState(db, indicatorId);
        if (!before?.draft) throw new Error('Missing draft');
        const response = await request(app)
          .put(path)
          .set('Cookie', cookie)
          .send({
            answers: {
              updateFrequency: 'annually',
              noFixedFrequencyReason: '',
              noLongerUpdatedReason: '',
              updateFrequencyText,
            },
            version: editVersion(updateFrequencyColumns.fromDraft(before.draft)),
          });

        expect(response.status).toBe(200);
        expect(response.body.answers).toMatchObject({
          updateFrequency: 'annually',
          updateFrequencyText: updateFrequencyText || null,
        });
        expect((await getIndicatorDraftState(db, indicatorId))?.draft).toMatchObject({
          updateFrequency: 'annually',
          updateFrequencyReason: null,
          updateFrequencyText: updateFrequencyText || null,
        });
      }
    },
  );
});
