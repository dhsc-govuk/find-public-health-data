import { request } from '@fphd/express/testing';
import { createCapturingLogger } from '@fphd/logger/testing';
import type { Express } from 'express';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import {
  definitionAndRationaleSection,
  otherNotesAndCaveatsSection,
  varianceAndQualitySection,
} from './contract.ts';
import { indicatorSectionRouter, yesNoDetailColumns } from './indicator-section.ts';
import { definitionAndRationaleColumns } from './indicator-section-columns.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  type FakeInternalRepositoryOverrides,
  handlerLogLines,
  inTestTeam,
  TEST_USER_ID,
  testActor,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

// What every section's endpoints share, shown through the first section built on them.

const id = '00000000-0000-7000-8000-000000000001';
const path = `/api/internal/indicators/${id}/definition-and-rationale`;

const draftState = {
  id,
  shortId: 90366,
  draft: { definition: 'Stored definition', rationale: 'Stored rationale' },
  indicatorStatus: 'new',
  draftStatus: 'draft',
};

const lockedState = { ...draftState, draft: { ...draftState.draft, isLocked: true } };

const noDraftState = { ...draftState, draft: null, indicatorStatus: 'live', draftStatus: null };

const answers = { definition: 'A definition', rationale: 'A rationale' };

function createTestApp(
  overrides: FakeInternalRepositoryOverrides['indicators'] = {},
  logger?: Logger,
): Express {
  const repositories = createFakeInternalRepositories({
    indicators: { ...inTestTeam, ...overrides },
  });

  return createRouterTestApp(
    indicatorSectionRouter(
      repositories.indicators,
      testSessionVerifier,
      definitionAndRationaleSection,
      definitionAndRationaleColumns,
    ),
    logger,
  );
}

function publisherCookie(roles: readonly string[] = ['internal', 'publisher']) {
  return testSessionCookie(roles);
}

describe.each(['get', 'put'] as const)('%s on a section', (method) => {
  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp())[method](path).send(answers);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('rejects a signed-in non-publisher', async () => {
    const response = await request(createTestApp())
      [method](path)
      .set('Cookie', await publisherCookie(['internal']))
      .send(answers);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  it('rejects an id that is not a UUID without asking the repository', async () => {
    const findDraftState = vi.fn();
    const updateDraft = vi.fn();

    const response = await request(createTestApp({ findDraftState, updateDraft }))
      [method]('/api/internal/indicators/108/definition-and-rationale')
      .set('Cookie', await publisherCookie())
      .send(answers);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
    expect(findDraftState).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('answers not_found for an indicator that does not exist', async () => {
    const response = await request(
      createTestApp({
        findDraftState: vi.fn().mockResolvedValue(undefined),
        updateDraft: async () => ({ ok: false, reason: 'no_draft' }),
      }),
    )
      [method](path)
      .set('Cookie', await publisherCookie())
      .send(answers);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('answers no_draft for an indicator with no draft to edit', async () => {
    const response = await request(
      createTestApp({
        findDraftState: vi.fn().mockResolvedValue(noDraftState),
        updateDraft: async () => ({ ok: false, reason: 'no_draft' }),
      }),
    )
      [method](path)
      .set('Cookie', await publisherCookie())
      .send(answers);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });

  it('answers locked for a draft locked for review', async () => {
    const response = await request(
      createTestApp({
        findDraftState: vi.fn().mockResolvedValue(lockedState),
        updateDraft: async () => ({ ok: false, reason: 'locked' }),
      }),
    )
      [method](path)
      .set('Cookie', await publisherCookie())
      .send(answers);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
  });
});

describe('GET on a section', () => {
  it("serves the draft's answers", async () => {
    const findDraftState = vi.fn().mockResolvedValue(draftState);

    const response = await request(createTestApp({ findDraftState }))
      .get(path)
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(200);
    expect(findDraftState).toHaveBeenCalledWith(id);
    expect(response.body).toEqual({
      definition: 'Stored definition',
      rationale: 'Stored rationale',
    });
  });
});

describe('PUT on a section', () => {
  it('writes the answers as the signed-in publisher and serves them back as stored', async () => {
    const updateDraft = vi.fn().mockResolvedValue({ ok: true });
    const findDraftState = vi.fn().mockResolvedValue(draftState);

    const response = await request(createTestApp({ updateDraft, findDraftState }))
      .put(path)
      .set('Cookie', await publisherCookie())
      .send(answers);

    expect(response.status).toBe(200);
    expect(updateDraft).toHaveBeenCalledWith(id, answers, {}, testActor(response));
    expect(response.body).toEqual({
      definition: 'Stored definition',
      rationale: 'Stored rationale',
    });
  });

  it('writes nothing when any answer is refused, naming each field refused', async () => {
    const updateDraft = vi.fn();
    const findById = vi.fn().mockResolvedValue({ draftLocked: false });

    const response = await request(createTestApp({ updateDraft, findById }))
      .put(path)
      .set('Cookie', await publisherCookie())
      .send({ definition: '', rationale: 108 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: {
        definition: 'Enter the definition of the indicator',
        rationale: 'Invalid input: expected string, received number',
      },
    });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['no indicator', undefined],
    ['no draft', { draftStatus: null, draftLocked: false }],
  ])('names the refused answers for %s', async (_, found) => {
    const findById = vi.fn().mockResolvedValue(found);

    const response = await request(createTestApp({ findById }))
      .put(path)
      .set('Cookie', await publisherCookie())
      .send({ definition: '' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'validation_failed' });
  });

  it('answers locked rather than the refused answers for a draft locked for review', async () => {
    const updateDraft = vi.fn();
    const findById = vi.fn().mockResolvedValue({ draftLocked: true });

    const response = await request(createTestApp({ updateDraft, findById }))
      .put(path)
      .set('Cookie', await publisherCookie())
      .send({ definition: '' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('logs the save under the request id, by the ids and the section alone', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');

    const response = await request(
      createTestApp(
        {
          updateDraft: async () => ({ ok: true }),
          findDraftState: vi.fn().mockResolvedValue(draftState),
        },
        logger,
      ),
    )
      .put(path)
      .set('Cookie', await publisherCookie())
      .send(answers);

    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({
        level: 30,
        msg: 'Indicator section saved',
        req: expect.objectContaining({ id: response.headers['x-fphd-request-id'] }),
        indicatorId: id,
        shortId: 90366,
        section: 'definition-and-rationale',
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain('A definition');
    expect(JSON.stringify(lines)).not.toContain(TEST_USER_ID);
  });

  it('logs nothing when the save is refused', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');

    await request(
      createTestApp(
        {
          updateDraft: async () => ({ ok: false, reason: 'no_draft' }),
          findDraftState: vi.fn().mockResolvedValue(noDraftState),
        },
        logger,
      ),
    )
      .put(path)
      .set('Cookie', await publisherCookie())
      .send(answers);

    expect(await handlerLogLines(lines)).toEqual([]);
  });
});

// Checked by the typecheck: each @ts-expect-error fails it if the call compiles.
describe('yesNoDetailColumns', () => {
  it('needs a question for every yes/no column', () => {
    yesNoDetailColumns(
      otherNotesAndCaveatsSection,
      // @ts-expect-error hasOtherNotes is no question's answer
      [
        { answer: 'hasRounding', detail: 'roundingDetail', detailRequired: 'x' },
        { answer: 'hasCaveats', detail: 'caveatsDetail', detailRequired: 'x' },
      ],
    );
    // @ts-expect-error hasSourceDataIssues is no question's answer
    yesNoDetailColumns(varianceAndQualitySection, []);
  });

  it('takes a yes/no column alone as an answer and a text column alone as details', () => {
    yesNoDetailColumns(otherNotesAndCaveatsSection, [
      // @ts-expect-error disclosureControl is a text column
      { answer: 'disclosureControl', detail: 'disclosureControlDetail', detailRequired: 'x' },
      { answer: 'hasRounding', detail: 'roundingDetail', detailRequired: 'x' },
      { answer: 'hasCaveats', detail: 'caveatsDetail', detailRequired: 'x' },
      { answer: 'hasOtherNotes', detail: 'otherNotesDetail', detailRequired: 'x' },
    ]);
    yesNoDetailColumns(varianceAndQualitySection, [
      // @ts-expect-error hasSourceDataIssues is a yes/no column
      { answer: 'hasSourceDataIssues', detail: 'hasSourceDataIssues', detailRequired: 'x' },
    ]);
  });
});
