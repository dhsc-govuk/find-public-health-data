import { request } from '@fphd/express/testing';
import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it, vi } from 'vitest';
import {
  agesSection,
  benchmarkingSection,
  calculationSection,
  confidenceIntervalsSection,
  definitionAndRationaleSection,
  formatAndSourcesSection,
  indicatorTaskKeySchema,
  justificationsSection,
  otherCommentsSection,
  otherNotesAndCaveatsSection,
  periodTypeSection,
  polaritySection,
  publishingDateSection,
  sexGenderAndEthnicitySection,
  taggingSection,
  updateFrequencySection,
  updateSummarySection,
  valueTypeAndUnitsSection,
  varianceAndQualitySection,
} from './contract.ts';
import { editVersion } from './edit-version.ts';
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
  agesSection,
  benchmarkingSection,
  calculationSection,
  confidenceIntervalsSection,
  definitionAndRationaleSection,
  formatAndSourcesSection,
  justificationsSection,
  otherCommentsSection,
  otherNotesAndCaveatsSection,
  periodTypeSection,
  polaritySection,
  publishingDateSection,
  sexGenderAndEthnicitySection,
  taggingSection,
  updateFrequencySection,
  updateSummarySection,
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
        .set('Cookie', await testSessionCookie(['publisher']));

      expect(response.status).toBe(200);
      expect(Object.keys(response.body.answers).sort()).toEqual([...section.fields.options].sort());
      for (const answer of Object.values(response.body.answers)) {
        expect(answer === null || (Array.isArray(answer) && answer.length === 0)).toBe(true);
      }
    },
  );

  it('writes the lists a section gives beside its columns', async () => {
    const ageRanges = [
      { lowerLimit: 16, lowerLimitUnit: 'years', upperLimit: null, upperLimitUnit: null },
    ];
    const updateDraft = vi.fn().mockResolvedValue({ ok: true });
    const repositories = createFakeInternalRepositories({
      indicators: {
        ...inTestTeam,
        updateDraft,
        findDraftState: vi.fn().mockResolvedValue({
          draft: { ...unansweredDraft, ageType: 'range', ageRanges },
        }),
      },
    });

    const response = await request(
      createRouterTestApp(indicatorSectionsRouter(repositories, testSessionVerifier)),
    )
      .put('/api/internal/indicators/00000000-0000-7000-8000-000000000001/ages')
      .set('Cookie', await testSessionCookie(['publisher']))
      .send({
        answers: {
          ageType: 'range',
          ageRanges: [
            { lowerLimit: '16', lowerLimitUnit: 'years', upperLimit: '', upperLimitUnit: '' },
          ],
          specificAge: '',
          specificAgeUnit: '',
          ageDetail: '',
        },
        version: editVersion({}),
      });

    expect(response.status).toBe(200);
    expect(updateDraft).toHaveBeenCalledWith(
      '00000000-0000-7000-8000-000000000001',
      'ages',
      {
        ageType: 'range',
        specificAge: null,
        specificAgeUnit: null,
        ageDetail: null,
      },
      { ageRanges },
      testActor(response),
      expect.objectContaining({ version: editVersion({}) }),
    );
    expect(response.body).toMatchObject({ answers: { ageType: 'range', ageRanges } });
  });
});

it.each([
  ['2020-01-01', '2020-01-01'],
  ['', null],
] as const)(
  'saves the optional publication start date through the period type task (%s)',
  async (publishedFrom, stored) => {
    const updateDraft = vi.fn().mockResolvedValue({ ok: true });
    const repositories = createFakeInternalRepositories({
      indicators: {
        ...inTestTeam,
        updateDraft,
        findDraftState: vi.fn().mockResolvedValue({ draft: unansweredDraft }),
      },
    });
    const response = await request(
      createRouterTestApp(indicatorSectionsRouter(repositories, testSessionVerifier)),
    )
      .put('/api/internal/indicators/00000000-0000-7000-8000-000000000001/period-type')
      .set('Cookie', await testSessionCookie(['publisher']))
      .send({
        answers: {
          periodType: 'months',
          yearType: '',
          yearEndDay: '',
          yearEndMonth: '',
          publishedFrom,
        },
        version: editVersion({}),
      });
    expect(response.status).toBe(200);
    expect(updateDraft).toHaveBeenCalledWith(
      '00000000-0000-7000-8000-000000000001',
      'period-type',
      {
        periodType: 'months',
        yearType: null,
        yearEndDay: null,
        yearEndMonth: null,
        publishedFrom: stored,
      },
      {},
      testActor(response),
      expect.objectContaining({ version: editVersion({}) }),
    );
  },
);

describe('the calculation section', () => {
  const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/calculation';
  const unasked = { standardMethodUsed: '', methodology: '', calculatedByDetail: '' };

  function calculationApp(state: object, updateDraft = vi.fn().mockResolvedValue({ ok: true })) {
    const repositories = createFakeInternalRepositories({
      indicators: {
        ...inTestTeam,
        updateDraft,
        findDraftState: vi.fn().mockResolvedValue(state),
        findById: vi.fn().mockResolvedValue({ draftLocked: false }),
      },
    });
    return request(createRouterTestApp(indicatorSectionsRouter(repositories, testSessionVerifier)));
  }

  const score = {
    draft: { ...unansweredDraft, valueTypeId: VALUE_TYPE_IDS.score },
    draftValueTypeName: 'Score',
  };

  it("returns the draft's value type beside the answers", async () => {
    const response = await calculationApp(score)
      .get(path)
      .set('Cookie', await testSessionCookie(['publisher']));

    expect(response.status).toBe(200);
    expect(response.body.valueType).toEqual({ id: VALUE_TYPE_IDS.score, name: 'Score' });
  });

  it('returns no value type while the draft has none', async () => {
    const response = await calculationApp({ draft: unansweredDraft, draftValueTypeName: null })
      .get(path)
      .set('Cookie', await testSessionCookie(['publisher']));

    expect(response.body.valueType).toBeNull();
  });

  it("judges the answers by the draft's value type", async () => {
    const updateDraft = vi.fn();
    const response = await calculationApp(score, updateDraft)
      .put(path)
      .set('Cookie', await testSessionCookie(['publisher']))
      .send({ answers: { ...unasked, calculatedBy: 'ohid' }, version: editVersion({}) });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: { methodology: 'Enter the methodology' },
    });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('saves who calculated the indicator before a value type is chosen', async () => {
    const updateDraft = vi.fn().mockResolvedValue({ ok: true });
    const response = await calculationApp(
      { draft: unansweredDraft, draftValueTypeName: null },
      updateDraft,
    )
      .put(path)
      .set('Cookie', await testSessionCookie(['publisher']))
      .send({ answers: { ...unasked, calculatedBy: 'dhsc' }, version: editVersion({}) });

    expect(response.status).toBe(200);
    expect(updateDraft).toHaveBeenCalledWith(
      '00000000-0000-7000-8000-000000000001',
      'calculation',
      {
        standardMethodUsed: null,
        methodology: null,
        calculatedBy: 'dhsc',
        calculatedByDetail: null,
      },
      {},
      testActor(response),
      expect.objectContaining({ version: editVersion({}) }),
    );
  });

  it('returns 404 for a save to an indicator with no draft', async () => {
    const response = await calculationApp({ draft: null })
      .put(path)
      .set('Cookie', await testSessionCookie(['publisher']))
      .send({ answers: { ...unasked, calculatedBy: 'dhsc' }, version: editVersion({}) });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });
});
