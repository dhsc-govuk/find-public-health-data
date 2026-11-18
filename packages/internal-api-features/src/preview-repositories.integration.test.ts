import { createRepositories, type Repositories, schema } from '@fphd/db';
import { apiLogin, createTestDb } from '@fphd/db/testing';
import { ENGLAND_AREA_CODE } from '@fphd/utils/observation-series';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDraftFromPublished } from './indicator-publish-repository.ts';
import { ACTOR, AS_ACTOR, newDraft } from './indicator-repository.testing.ts';
import { answerUpdate } from './indicator-workflow.testing.ts';
import {
  createPreviewRepositories,
  findPreviewVersion,
  type PreviewRepositories,
} from './preview-repository.ts';

const { indicatorVersion, uploadBatch } = schema;

// Seeded indicators with data at England level and read models for their published batch.
const MORTALITY_UNDER_75 = 108;
const DIABETES_MORTALITY = 93995;
// Shares Cornwall and England with indicator 108, so a published scatter of the two has points.
const SCATTER_PARTNER = 40501;
const SCATTER_AREAS = ['E06000052', ENGLAND_AREA_CODE];
const PREVIEWED_NAME = 'Mortality as the preview shows it';

const testDb = await createTestDb({ template: 'seeded' });
const internalDb = testDb.connectDb({ login: apiLogin('internal_api') });
const publicSite = createRepositories(testDb.connectDb({ login: apiLogin('public_api') }));

afterAll(async () => {
  await testDb.drop();
});

/** The id of a seeded published indicator, which a test then opens an update of. */
async function publishedId(shortId: number): Promise<string> {
  const id = await publicSite.indicators.resolveId(shortId);
  if (id === undefined) throw new Error(`the seed has no indicator ${shortId}`);
  return id;
}

/** The repositories of the indicator's preview, as the internal API makes them for a request. */
async function previewOf(indicatorId: string): Promise<PreviewRepositories> {
  const version = await findPreviewVersion(internalDb, indicatorId);
  if (version === undefined) throw new Error('the indicator has no draft to preview');
  return createPreviewRepositories(internalDb, version);
}

/**
 * What each kind of public read answers for an indicator, by its id and short id. The scatter
 * pairs it with `partner`, another published indicator.
 */
async function readsOf(
  repositories: Repositories,
  indicatorId: string,
  shortId: number,
  partner: number,
) {
  const [areas, data, ranking, table, scatter] = await Promise.all([
    repositories.indicators.listAreas(indicatorId),
    repositories.indicators.findObservationsForAreas(indicatorId, [ENGLAND_AREA_CODE]),
    repositories.indicators.findRankingData(indicatorId, [ENGLAND_AREA_CODE]),
    repositories.indicators.findTableData([shortId], [ENGLAND_AREA_CODE]),
    repositories.indicators.findScatterData([shortId, partner], SCATTER_AREAS),
  ]);
  const displayGroup = areas[0]?.displayGroup;
  const range = displayGroup
    ? await repositories.indicators.findObservationRange(indicatorId, displayGroup)
    : [];
  return { areas, data, ranking, table, scatter, range };
}

describe('a new draft with nothing answered', () => {
  let draft: Awaited<ReturnType<typeof newDraft>>;
  let shortId: number;

  beforeAll(async () => {
    draft = await newDraft(testDb.db, 'A draft the preview alone shows');
    const [row] = await testDb.db
      .select({ shortId: schema.indicator.shortId })
      .from(schema.indicator)
      .where(eq(schema.indicator.id, draft.indicatorId));
    if (row === undefined) throw new Error('the draft has no indicator');
    shortId = row.shortId;
  });

  it('resolves by its slug and short id in the preview, and not on the public side', async () => {
    const preview = await previewOf(draft.indicatorId);

    expect(await preview.indicators.resolveIdBySlug('a-draft-the-preview-alone-shows')).toBe(
      draft.indicatorId,
    );
    expect(await preview.indicators.resolveId(shortId)).toBe(draft.indicatorId);
    expect(
      await publicSite.indicators.resolveIdBySlug('a-draft-the-preview-alone-shows'),
    ).toBeUndefined();
    expect(await publicSite.indicators.resolveId(shortId)).toBeUndefined();
  });

  it('reads as found, naming every unanswered question, with no upload', async () => {
    const preview = await previewOf(draft.indicatorId);

    const detail = await preview.indicators.findDetailById(draft.indicatorId);

    expect(detail).toMatchObject({
      name: 'A draft the preview alone shows',
      valueType: null,
      unit: null,
      polarity: null,
      updateFrequency: null,
      unanswered: ['valueType', 'unit', 'polarity', 'updateFrequency'],
    });
    // The transaction's driver parses timestamps as the client does.
    expect(detail?.firstPublishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(await preview.findDataState(draft.indicatorId)).toBe('no-upload');
    expect(await publicSite.indicators.findDetailById(draft.indicatorId)).toBeUndefined();
  });

  it('has no table data even in the preview, as the public page could not show it', async () => {
    const preview = await previewOf(draft.indicatorId);

    expect(await preview.indicators.findTableData([shortId], [ENGLAND_AREA_CODE])).toEqual([]);
  });

  it('is listed and found by search in the preview, and not on the public side', async () => {
    const preview = await previewOf(draft.indicatorId);
    const filters = {
      query: 'alone shows',
      topics: [],
      indicatorTypes: [],
      lifeStages: [],
      frameworks: [],
      populations: [],
      inequalities: [],
      displayGroups: [],
      areaCodes: [],
      sources: [],
      valueTypes: [],
      yearTypes: [],
      limit: 20,
    };

    const names = (rows: { name: string }[]) => rows.map(({ name }) => name);

    expect(names(await preview.indicators.listPublished())).toContain(
      'A draft the preview alone shows',
    );
    expect(names(await preview.indicators.search('alone shows', 20))).toEqual([
      'A draft the preview alone shows',
    ]);
    expect(names((await preview.indicators.searchWithFilters(filters)).indicators)).toEqual([
      'A draft the preview alone shows',
    ]);
    expect(await publicSite.indicators.search('alone shows', 20)).toEqual([]);
    expect((await publicSite.indicators.searchWithFilters(filters)).indicators).toEqual([]);
  });
});

describe('an update that keeps the published batch', () => {
  let indicatorId: string;

  beforeAll(async () => {
    indicatorId = await publishedId(MORTALITY_UNDER_75);
    const opened = await createDraftFromPublished(testDb.db, indicatorId, AS_ACTOR);
    if (!opened.ok) throw new Error(`no draft: ${opened.reason}`);
    await answerUpdate(
      testDb.db,
      { indicatorId, versionId: opened.versionId },
      {
        name: PREVIEWED_NAME,
      },
    );
  });

  it('shows its answers in the preview, dated as if published when scheduled', async () => {
    const preview = await previewOf(indicatorId);

    const detail = await preview.indicators.findDetailById(indicatorId);

    expect(detail).toMatchObject({ name: PREVIEWED_NAME, unanswered: [] });
    expect(detail?.lastPublishedAt).toBe('2030-06-01T08:30:00.000Z');
    expect(detail?.updateSummaries[0]).toEqual({
      publishedAt: '2030-06-01T08:30:00.000Z',
      summary: 'Changed the polarity.',
    });
    expect((await publicSite.indicators.findDetailById(indicatorId))?.name).toBe(
      'Under 75 mortality rate from all causes',
    );
  });

  it('shows the published data, ready, with the table naming the update', async () => {
    const preview = await previewOf(indicatorId);

    const previewed = await readsOf(preview, indicatorId, MORTALITY_UNDER_75, SCATTER_PARTNER);
    const published = await readsOf(publicSite, indicatorId, MORTALITY_UNDER_75, SCATTER_PARTNER);

    expect(await preview.findDataState(indicatorId)).toBe('ready');
    expect(previewed.areas.length).toBeGreaterThan(0);
    expect(previewed.data[0]?.observations.length).toBeGreaterThan(0);
    expect(previewed.data[0]?.observations[0]?.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(previewed.range.length).toBeGreaterThan(0);
    // A scatter of two different indicators, so its equality below compares real points.
    expect(previewed.scatter?.points.length).toBeGreaterThan(0);
    expect(previewed.table[0]?.detail.name).toBe(PREVIEWED_NAME);
    expect(published.table[0]?.detail.name).toBe('Under 75 mortality rate from all causes');
    expect({ ...previewed, table: undefined }).toEqual({ ...published, table: undefined });
  });
});

describe('an update with data of its own, which has no read models yet', () => {
  let indicatorId: string;

  beforeAll(async () => {
    indicatorId = await publishedId(SCATTER_PARTNER);
    const opened = await createDraftFromPublished(testDb.db, indicatorId, AS_ACTOR);
    if (!opened.ok) throw new Error(`no draft: ${opened.reason}`);
    const [batch] = await testDb.db
      .insert(uploadBatch)
      .values({
        indicatorId,
        indicatorVersionId: opened.versionId,
        originalFilename: 'new-data.csv',
        uploadedBy: ACTOR,
        status: 'processed',
      })
      .returning({ id: uploadBatch.id });
    await testDb.db
      .update(indicatorVersion)
      .set({ uploadBatchId: batch?.id })
      .where(eq(indicatorVersion.id, opened.versionId));
  });

  it('reads as missing its read models, and no read shows the published data', async () => {
    const preview = await previewOf(indicatorId);

    const previewed = await readsOf(preview, indicatorId, SCATTER_PARTNER, MORTALITY_UNDER_75);
    const published = await readsOf(publicSite, indicatorId, SCATTER_PARTNER, MORTALITY_UNDER_75);

    expect(await preview.findDataState(indicatorId)).toBe('read-models-missing');
    const observations = (areas: { observations: unknown[] }[]) =>
      areas.flatMap((area) => area.observations);
    expect(previewed).toMatchObject({ areas: [], range: [] });
    expect(observations(previewed.data)).toEqual([]);
    expect(observations(previewed.ranking)).toEqual([]);
    expect(observations(previewed.table.flatMap(({ areaData }) => areaData))).toEqual([]);
    expect(previewed.scatter?.points.length ?? 0).toBe(0);
    expect(published.areas.length).toBeGreaterThan(0);
    expect(observations(published.data).length).toBeGreaterThan(0);
    expect(observations(published.ranking).length).toBeGreaterThan(0);
    expect(
      observations(published.table.flatMap(({ areaData }) => areaData)).length,
    ).toBeGreaterThan(0);
    expect(published.range.length).toBeGreaterThan(0);
    expect(published.scatter?.points.length).toBeGreaterThan(0);
  });
});

it('finds no version to preview for a published indicator with no draft', async () => {
  expect(
    await findPreviewVersion(internalDb, await publishedId(DIABETES_MORTALITY)),
  ).toBeUndefined();
});
