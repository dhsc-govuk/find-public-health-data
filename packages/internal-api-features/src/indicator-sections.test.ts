import { request } from '@fphd/express/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  benchmarkingSection,
  calculationSection,
  confidenceIntervalsSection,
  copyrightAndDataReuseSection,
  dataQualitySection,
  definitionAndRationaleSection,
  denominatorSection,
  indicatorTaskKeySchema,
  justificationsSection,
  linksSection,
  numeratorSection,
  otherCommentsSection,
  otherNotesAndCaveatsSection,
  periodTypeSection,
  polaritySection,
  publishingDateSection,
  sexAndAgesSection,
  taggingSection,
  updateFrequencySection,
  valueTypeAndUnitsSection,
  varianceAndQualitySection,
} from './contract.ts';
import { editVersion } from './edit-version.ts';
import { links } from './indicator-sections.testing.ts';
import { indicatorSectionsRouter } from './indicator-sections.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  inTestTeam,
  testActor,
  testSessionCookie,
  testSessionVerifier,
  unansweredDraft,
} from './testing.ts';

// The HTTP behaviour every section shares is tested in indicator-section.test.ts.

// Every section the router serves.
const sections = [
  benchmarkingSection,
  calculationSection,
  confidenceIntervalsSection,
  copyrightAndDataReuseSection,
  dataQualitySection,
  definitionAndRationaleSection,
  denominatorSection,
  justificationsSection,
  linksSection,
  numeratorSection,
  otherCommentsSection,
  otherNotesAndCaveatsSection,
  periodTypeSection,
  polaritySection,
  publishingDateSection,
  sexAndAgesSection,
  taggingSection,
  updateFrequencySection,
  valueTypeAndUnitsSection,
  varianceAndQualitySection,
];

describe('indicatorSectionsRouter', () => {
  it('serves every task but the name and the data table', () => {
    expect(sections.map(({ key }) => key).sort()).toEqual(
      indicatorTaskKeySchema.options.filter((key) => key !== 'name' && key !== 'data-table').sort(),
    );
  });

  it.each(sections)(
    'serves the $key section, answering every field as null or an empty list',
    async (section) => {
      const repositories = createFakeInternalRepositories({
        indicators: {
          ...inTestTeam,
          findDraftState: vi.fn().mockResolvedValue({ draft: unansweredDraft }),
        },
      });

      const response = await request(
        createRouterTestApp(indicatorSectionsRouter(repositories, testSessionVerifier)),
      )
        .get(`/api/internal/indicators/00000000-0000-7000-8000-000000000001/${section.key}`)
        .set('Cookie', await testSessionCookie(['internal', 'publisher']));

      expect(response.status).toBe(200);
      expect(Object.keys(response.body.answers).sort()).toEqual(
        [...section.fields.options].filter((field) => field !== 'isAreaContext').sort(),
      );
      for (const answer of Object.values(response.body.answers)) {
        expect(answer === null || (Array.isArray(answer) && answer.length === 0)).toBe(true);
      }
    },
  );

  it('writes the lists a section gives beside its columns', async () => {
    const updateDraft = vi.fn().mockResolvedValue({ ok: true });
    const repositories = createFakeInternalRepositories({
      indicators: {
        ...inTestTeam,
        updateDraft,
        findDraftState: vi
          .fn()
          .mockResolvedValue({ draft: { ...unansweredDraft, hasLinks: true, links } }),
      },
    });

    const response = await request(
      createRouterTestApp(indicatorSectionsRouter(repositories, testSessionVerifier)),
    )
      .put('/api/internal/indicators/00000000-0000-7000-8000-000000000001/links')
      .set('Cookie', await testSessionCookie(['internal', 'publisher']))
      .send({ answers: { hasLinks: 'yes', links }, version: editVersion({}) });

    expect(response.status).toBe(200);
    expect(updateDraft).toHaveBeenCalledWith(
      '00000000-0000-7000-8000-000000000001',
      { hasLinks: true },
      { links },
      testActor(response),
      expect.objectContaining({ version: editVersion({}) }),
    );
    expect(response.body).toMatchObject({ answers: { hasLinks: 'yes', links } });
  });
});
