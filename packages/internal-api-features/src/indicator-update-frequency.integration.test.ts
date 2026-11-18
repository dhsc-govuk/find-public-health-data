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
    'saves the details of the chosen answer and clears those of the others',
    async ({ db }) => {
      const { indicatorId } = await newDraft(db, 'Frequency details');
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
      const typed = {
        updateFrequencyYears: '3',
        updateFrequencyText: 'Academic year.\nPublished in winter.',
        noFixedFrequencyReason: 'Published when the survey runs.',
        noLongerUpdatedReason: 'The survey has ended.',
      };
      const saved = [
        ['every-n-years', { updateFrequencyYears: 3 }],
        ['other', { updateFrequencyText: 'Academic year.\nPublished in winter.' }],
        ['no-fixed-frequency', { updateFrequencyReason: 'Published when the survey runs.' }],
        ['annually', {}],
      ] as const;

      for (const [updateFrequency, kept] of saved) {
        const before = await getIndicatorDraftState(db, indicatorId);
        if (!before?.draft) throw new Error('Missing draft');
        const response = await request(app)
          .put(path)
          .set('Cookie', cookie)
          .send({
            answers: { updateFrequency, ...typed },
            version: editVersion(updateFrequencyColumns.fromDraft(before.draft)),
          });

        expect(response.status).toBe(200);
        expect((await getIndicatorDraftState(db, indicatorId))?.draft).toMatchObject({
          updateFrequency,
          updateFrequencyYears: null,
          updateFrequencyText: null,
          updateFrequencyReason: null,
          ...kept,
        });
      }
    },
  );
});
