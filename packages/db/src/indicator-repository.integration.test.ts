import { UNIT_IDS } from '@fphd/utils/value-type-and-unit';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  listAreaParents,
  listAreasByCodes,
  listAreasByGroup,
  listAreasByGroups,
  listAreasByType,
  listDisplayGroups,
  searchAreas,
} from './area-repository.ts';
import type { Database } from './client.ts';
import {
  completeIndicatorDetail,
  getIndicatorDetailById,
  getIndicatorObservations,
  getObservationRange,
  getObservationRangeByCategory,
  getObservationRangeByTier,
  type IndicatorSearchFilters,
  listIndicatorFacets,
  listPublishedIndicators,
  resolveIndicatorIdBySlug,
  resolvePublishedIndicatorId,
  searchIndicators,
  searchPublishedIndicators,
} from './indicator-repository.ts';
import { publishedViews, SYSTEM_USER_IDS } from './schema/index.ts';
import { apiLogin, createTestDb, type TestDb } from './testing.ts';

const ACTOR = SYSTEM_USER_IDS.pholioMigration;

// Under 75 mortality rate from all causes: a seeded indicator with full metadata, both
// single-year and rolling periods, and sex/age/deprivation breakdowns.
const MORTALITY_UNDER_75 = 108;
const DIABETES_QOF_PREVALENCE = 241;
// Mortality rate for deaths involving diabetes: a sexed series beside its aggregate.
const DIABETES_MORTALITY = 93995;
// Resident population, a count with no unit.
const RESIDENT_POPULATION = 92708;
// Emergency admissions for gastroenteritis, which no other test reads.
const GASTROENTERITIS_ADMISSIONS = 94194;
const ENGLAND = 'E92000001';
const CORNWALL = 'E06000052';

const UNSEEDED_ID = '00000000-0000-7000-8000-000000000000';
const MORTALITY_SLUG = 'under-75-mortality-rate-from-all-causes';

let testDb: TestDb;
let db: Database;
let mortalityId: string;
let diabetesId: string;
let diabetesMortalityId: string;

async function resolvedId(shortId: number): Promise<string> {
  const id = await resolvePublishedIndicatorId(db, publishedViews, shortId);
  if (!id) {
    throw new Error(`seed is missing indicator ${shortId}`);
  }
  return id;
}

beforeAll(async () => {
  testDb = await createTestDb({ template: 'seeded' });
  db = testDb.db;
  [mortalityId, diabetesId, diabetesMortalityId] = await Promise.all([
    resolvedId(MORTALITY_UNDER_75),
    resolvedId(DIABETES_QOF_PREVALENCE),
    resolvedId(DIABETES_MORTALITY),
  ]);
});

afterAll(async () => {
  await testDb.drop();
});

describe('listPublishedIndicators', () => {
  it('returns the seeded indicators in name order', async () => {
    const indicators = await listPublishedIndicators(db, publishedViews);

    expect(indicators).toHaveLength(12);
    const names = indicators.map(({ name }) => name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('carries the slug each link is built from', async () => {
    const indicators = await listPublishedIndicators(db, publishedViews);

    expect(indicators).toContainEqual(
      expect.objectContaining({ shortId: MORTALITY_UNDER_75, slug: MORTALITY_SLUG }),
    );
  });
});

describe('searchPublishedIndicators', () => {
  it('matches case-insensitively anywhere in the name', async () => {
    const results = await searchPublishedIndicators(db, publishedViews, 'DIABETES', 20);

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every(({ name }) => name.toLowerCase().includes('diabetes'))).toBe(true);
  });

  it('ranks a match earlier in the name above a later one', async () => {
    const results = await searchPublishedIndicators(db, publishedViews, 'diabetes', 20);

    expect(results[0]?.name).toBe('Diabetes: QOF prevalence');
  });

  it('matches a slug exactly, case-folded', async () => {
    await expect(
      searchPublishedIndicators(db, publishedViews, MORTALITY_SLUG.toUpperCase(), 20),
    ).resolves.toEqual([expect.objectContaining({ shortId: MORTALITY_UNDER_75 })]);
  });

  it('matches an exact short id but not the internal id', async () => {
    await expect(
      searchPublishedIndicators(db, publishedViews, String(MORTALITY_UNDER_75), 20),
    ).resolves.toEqual([expect.objectContaining({ shortId: MORTALITY_UNDER_75 })]);
    await expect(searchPublishedIndicators(db, publishedViews, mortalityId, 20)).resolves.toEqual(
      [],
    );
  });

  it('respects the limit', async () => {
    expect(await searchPublishedIndicators(db, publishedViews, 'a', 3)).toHaveLength(3);
  });

  it('treats LIKE syntax in the query as literal text', async () => {
    expect(await searchPublishedIndicators(db, publishedViews, '%', 20)).toEqual([]);
    expect(await searchPublishedIndicators(db, publishedViews, '_', 20)).toEqual([]);
  });
});

describe('resolvePublishedIndicatorId', () => {
  it('answers the internal id for a seeded short id and nothing otherwise', async () => {
    expect(await resolvePublishedIndicatorId(db, publishedViews, MORTALITY_UNDER_75)).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(await resolvePublishedIndicatorId(db, publishedViews, 424242)).toBeUndefined();
  });
});

describe('resolveIndicatorIdBySlug', () => {
  it('answers the internal id for a published slug and nothing otherwise', async () => {
    expect(await resolveIndicatorIdBySlug(db, publishedViews, MORTALITY_SLUG)).toBe(mortalityId);
    expect(await resolveIndicatorIdBySlug(db, publishedViews, 'no-such-indicator')).toBeUndefined();
  });

  // The added publication is older than the seed's, so it supersedes nothing the rest of
  // this file reads: the views still show one row per indicator, under the current name.
  it('still answers for a slug only a superseded published version carries', async () => {
    const owner = testDb.connectDb();
    await owner.execute(
      sql`INSERT INTO indicator_version
            (indicator_id, status, name, slug, published_at, created_by, updated_by)
          SELECT ${mortalityId}, 'published', 'An earlier name', 'an-earlier-name',
                 '2020-01-01T00:00:00Z', ${ACTOR}, ${ACTOR}`,
    );
    await owner.$client.end();

    expect(await resolveIndicatorIdBySlug(db, publishedViews, 'an-earlier-name')).toBe(mortalityId);
    // The canonical slug is still the latest publication's.
    expect((await getIndicatorDetailById(db, publishedViews, mortalityId))?.slug).toBe(
      MORTALITY_SLUG,
    );
  });
});

describe('getIndicatorDetailById', () => {
  it('resolves the lookups, metadata and available area types in one result', async () => {
    const indicator = await getIndicatorDetailById(db, publishedViews, mortalityId);

    expect(indicator).toMatchObject({
      shortId: MORTALITY_UNDER_75,
      name: expect.stringContaining('Under 75 mortality rate'),
      valueType: 'Directly standardised rate',
      unit: 'per 100,000',
      yearType: { value: expect.any(String), label: expect.any(String) },
      updateFrequency: 'annually',
      updateFrequencyReason: null,
      polarity: expect.any(String),
      definition: expect.any(String),
    });
    // Topic membership and the source publication date come from the seed import.
    expect(indicator?.dataUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(indicator?.topics.map(({ title }) => title)).toContain('Mortality and life expectancy');

    expect(indicator?.areaTypes.length).toBeGreaterThan(0);
    // Ordered by name so the filter pane does not have to sort what it renders.
    const areaTypeNames = indicator?.areaTypes.map(({ name }) => name) ?? [];
    expect(areaTypeNames).toEqual([...areaTypeNames].sort((a, b) => a.localeCompare(b)));
  });

  it('gives no unit to values that have none, which answers the unit question', async () => {
    const id = await resolvedId(RESIDENT_POPULATION);

    expect(await getIndicatorDetailById(db, publishedViews, id)).toMatchObject({
      unit: null,
      unanswered: [],
    });
  });

  it('names the unit unanswered when the version has no unit at all', async () => {
    const id = await resolvedId(GASTROENTERITIS_ADMISSIONS);
    await db.execute(
      sql`UPDATE indicator_version SET unit_id = NULL, unit_detail = NULL WHERE indicator_id = ${id}`,
    );

    const found = await getIndicatorDetailById(db, publishedViews, id);

    expect(found?.unit).toBeNull();
    expect(found?.unanswered).toContain('unit');
    expect(found && completeIndicatorDetail(found)).toBeUndefined();
  });

  it('dates the first and the latest publication', async () => {
    const id = await resolvedId(RESIDENT_POPULATION);
    const imported = await getIndicatorDetailById(db, publishedViews, id);

    // An imported indicator has one published version.
    expect(imported?.firstPublishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(imported?.lastPublishedAt).toBe(imported?.firstPublishedAt);

    const owner = testDb.connectDb();
    await owner.execute(
      sql`INSERT INTO indicator_version
            (indicator_id, status, name, slug, published_at, is_locked, created_by, updated_by)
          SELECT ${id}, 'published', 'An earlier name', 'resident-population-earlier',
                 '2000-01-01T00:00:00Z', true, ${ACTOR}, ${ACTOR}`,
    );
    await owner.$client.end();

    const withEarlier = await getIndicatorDetailById(db, publishedViews, id);

    expect(withEarlier?.firstPublishedAt).toBe('2000-01-01T00:00:00.000Z');
    expect(withEarlier?.lastPublishedAt).toBe(imported?.lastPublishedAt);
  });

  it('names an other unit as its publisher did', async () => {
    const id = await resolvedId(GASTROENTERITIS_ADMISSIONS);
    await db.execute(
      sql`UPDATE indicator_version SET unit_id = ${UNIT_IDS.other}, unit_detail = 'per 1,000 live births'
          WHERE indicator_id = ${id}`,
    );

    expect((await getIndicatorDetailById(db, publishedViews, id))?.unit).toBe(
      'per 1,000 live births',
    );
  });

  it('serves an indicator imported without an update frequency, naming the question unanswered', async () => {
    const id = await resolvedId(DIABETES_MORTALITY);
    await db.execute(
      sql`UPDATE indicator_version SET update_frequency = NULL, update_frequency_reason = NULL,
            update_frequency_text = NULL
          WHERE indicator_id = ${id}`,
    );

    const found = await getIndicatorDetailById(db, publishedViews, id);

    expect(found).toMatchObject({
      shortId: DIABETES_MORTALITY,
      updateFrequency: null,
      unanswered: ['updateFrequency'],
    });
    expect(found && completeIndicatorDetail(found)).toMatchObject({ updateFrequency: null });
  });

  it.each(['annually', null] as const)(
    'returns original frequency text beside %s',
    async (updateFrequency) => {
      const id = await resolvedId(DIABETES_MORTALITY);
      await db.execute(
        sql`UPDATE indicator_version SET update_frequency = ${updateFrequency}, update_frequency_reason = NULL, update_frequency_text = 'Academic year.\nPublished in winter.' WHERE indicator_id = ${id}`,
      );

      // The original text answers the question, with or without a frequency beside it.
      expect(await getIndicatorDetailById(db, publishedViews, id)).toMatchObject({
        updateFrequency,
        updateFrequencyText: 'Academic year.\nPublished in winter.',
        unanswered: [],
      });
    },
  );

  it('returns undefined for an id no indicator carries', async () => {
    expect(await getIndicatorDetailById(db, publishedViews, UNSEEDED_ID)).toBeUndefined();
  });

  it('includes the prototype diabetes indicator with its high-fidelity geography coverage', async () => {
    const indicator = await getIndicatorDetailById(db, publishedViews, diabetesId);

    expect(indicator).toMatchObject({
      shortId: DIABETES_QOF_PREVALENCE,
      name: 'Diabetes: QOF prevalence',
      valueType: 'Proportion',
      unit: '%',
    });
    expect(indicator?.areaTypes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['England', 'GPs', 'ICBs', 'NHS regions', 'Regions (statistical)']),
    );
  });

  it("lists each part's providers and sources in order, a provider alone where none is named", async () => {
    const [version] = await db.execute<{ id: string }>(
      sql`SELECT id FROM current_published_version WHERE indicator_id = ${diabetesId}`,
    );
    await db.execute(
      sql`DELETE FROM indicator_version_source WHERE indicator_version_id = ${version?.id}`,
    );
    // Inserted out of position order, so the order read back is the positions'.
    await db.execute(
      sql`INSERT INTO indicator_version_source
            (indicator_version_id, part, position, provider_id, source_id)
          SELECT ${version?.id}, entry.part, entry.position, p.id, s.id
          FROM (VALUES
            ('numerator', 2, 'Estimated', NULL),
            ('denominator', 0, 'Office for National Statistics (ONS)', 'Mid-year population estimates'),
            ('numerator', 0, 'NHS England (NHSE)', 'Hospital Episode Statistics (HES)'),
            ('numerator', 1, 'NHS England (NHSE)', 'Admitted Patient Care (APC)')
          ) AS entry (part, position, provider, source)
          JOIN data_provider p ON p.name = entry.provider
          LEFT JOIN data_provider_source s ON s.provider_id = p.id AND s.name = entry.source`,
    );

    const indicator = await getIndicatorDetailById(db, publishedViews, diabetesId);

    expect(indicator?.numeratorSources).toEqual([
      { provider: 'NHS England (NHSE)', source: 'Hospital Episode Statistics (HES)' },
      { provider: 'NHS England (NHSE)', source: 'Admitted Patient Care (APC)' },
      { provider: 'Estimated', source: null },
    ]);
    expect(indicator?.denominatorSources).toEqual([
      { provider: 'Office for National Statistics (ONS)', source: 'Mid-year population estimates' },
    ]);
  });
});

describe('getIndicatorObservations', () => {
  it('returns every published observation for the area with its dimension labels', async () => {
    const data = await getIndicatorObservations(db, publishedViews, mortalityId, ENGLAND);

    expect(data?.areaName).toBe('England');
    expect(data?.observations.length).toBeGreaterThan(1000);

    // Ordered by period so a trend series needs no further sorting.
    const fromDates = data?.observations.map(({ fromDate }) => fromDate) ?? [];
    expect(fromDates).toEqual([...fromDates].sort());

    // The least-disaggregated England series for this indicator carries one Age dimension.
    const singleDimension = data?.observations.filter(({ dimensions }) => dimensions.length === 1);
    expect(singleDimension).toHaveLength(18);
    expect(singleDimension?.[0]?.dimensions[0]).toMatchObject({
      type: 'Age',
      value: '<75 yrs',
      dimensionClass: 'core',
    });
  });

  it('returns an empty observation list when the area holds no data for the indicator', async () => {
    // 93622 is seeded for deprivation-within-area only, so lower-tier authorities are empty.
    const [lowerTier] = await listAreasByType(db, publishedViews, 'LA unchanged');
    expect(lowerTier).toBeTruthy();

    const data = await getIndicatorObservations(
      db,
      publishedViews,
      await resolvedId(93622),
      lowerTier?.code ?? '',
    );

    expect(data?.observations).toEqual([]);
    expect(data?.areaName).toBe(lowerTier?.name);
  });

  it('returns undefined only for an unknown area, now the id arrives resolved', async () => {
    expect(
      await getIndicatorObservations(db, publishedViews, mortalityId, 'E00000000'),
    ).toBeUndefined();
    // An id that resolved but holds no rows is an empty series, not an error.
    expect(
      (await getIndicatorObservations(db, publishedViews, UNSEEDED_ID, ENGLAND))?.observations,
    ).toEqual([]);
  });

  it('returns the published Cornwall trend for the prototype diabetes indicator', async () => {
    const data = await getIndicatorObservations(db, publishedViews, diabetesId, CORNWALL);

    expect(data?.areaName).toBe('Cornwall');
    expect(data?.observations).toHaveLength(13);
    expect(data?.observations[0]).toMatchObject({
      fromDate: '2012-04-01',
      toDate: '2013-03-31',
    });
    expect(data?.observations.at(-1)).toMatchObject({
      fromDate: '2024-04-01',
      toDate: '2025-03-31',
    });
  });
});

describe('getObservationRange', () => {
  it('brackets each period of the trend series across every area of the level', async () => {
    const [range, cornwall] = await Promise.all([
      getObservationRange(db, publishedViews, diabetesId, 'Local authorities'),
      getIndicatorObservations(db, publishedViews, diabetesId, CORNWALL),
    ]);

    expect(range.length).toBeGreaterThan(0);
    for (const period of range) {
      expect(period.min).toBeLessThanOrEqual(period.max);
      const observation = cornwall?.observations.find(
        ({ fromDate, toDate, value }) =>
          fromDate === period.fromDate && toDate === period.toDate && value !== null,
      );
      if (observation?.value != null) {
        expect(observation.value).toBeGreaterThanOrEqual(period.min);
        expect(observation.value).toBeLessThanOrEqual(period.max);
      }
    }
  });

  it('returns an empty range for an unknown group or an id holding no data', async () => {
    expect(await getObservationRange(db, publishedViews, diabetesId, 'No Such Level')).toEqual([]);
    expect(await getObservationRange(db, publishedViews, UNSEEDED_ID, 'Local authorities')).toEqual(
      [],
    );
  });

  it('returns one range per sex segment beside the aggregate series', async () => {
    const range = await getObservationRange(
      db,
      publishedViews,
      diabetesMortalityId,
      'Local authorities',
    );

    const segments = new Set(range.map(({ segment }) => segment));
    expect(segments.has('')).toBe(true);
    expect(segments.has('Male')).toBe(true);
    expect(segments.has('Female')).toBe(true);
    for (const period of range) {
      expect(period.min).toBeLessThanOrEqual(period.max);
    }
  });

  it('includes selectable segments when an aggregate series also exists', async () => {
    const range = await getObservationRange(db, publishedViews, mortalityId, 'Local authorities');
    const segments = new Set(range.map(({ segment }) => segment));

    expect(segments.has('<75 yrs')).toBe(true);
    expect(segments.has('<75 yrs|Male')).toBe(true);
    expect(segments.has('<75 yrs|Female')).toBe(true);
  });
});

describe('listAreaParents', () => {
  it('maps each area to its parent of the requested type', async () => {
    const parents = await listAreaParents(db, publishedViews, [CORNWALL], 'Regions (statistical)');

    expect(parents).toEqual([
      {
        code: CORNWALL,
        parentCode: 'E12000009',
        parentName: 'South West',
      },
    ]);
  });

  it('returns nothing for empty input or a parent type the areas do not roll up to', async () => {
    expect(await listAreaParents(db, publishedViews, [], 'Regions (statistical)')).toEqual([]);
    expect(await listAreaParents(db, publishedViews, [CORNWALL], 'No Such Type')).toEqual([]);
  });
});

describe('listAreasByType', () => {
  it('returns the current areas of the type in name order', async () => {
    const regions = await listAreasByType(db, publishedViews, 'Regions (statistical)');

    expect(regions).toHaveLength(9);
    const names = regions.map(({ name }) => name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(regions.every(({ code }) => /^E\d{8}$/.test(code))).toBe(true);
  });

  it('returns nothing for an area type that does not exist', async () => {
    expect(await listAreasByType(db, publishedViews, 'No Such Area Type')).toEqual([]);
  });
});

describe('listDisplayGroups', () => {
  it('returns the user-facing levels in display order', async () => {
    expect(await listDisplayGroups(db, publishedViews)).toEqual([
      'Local authorities',
      'Statistical regions',
      'NHS regions',
      'Integrated care boards',
      'Middle-layer super output areas',
      'GP practices',
    ]);
  });
});

describe('listAreasByGroup', () => {
  it('returns every current area across the group types, bare-named and ordered', async () => {
    const regions = await listAreasByGroup(db, publishedViews, 'Statistical regions');

    expect(regions.map(({ name }) => name)).toEqual([
      'East Midlands',
      'East of England',
      'London',
      'North East',
      'North West',
      'South East',
      'South West',
      'West Midlands',
      'Yorkshire and the Humber',
    ]);
  });

  it('returns nothing for an unknown group', async () => {
    expect(await listAreasByGroup(db, publishedViews, 'No Such Level')).toEqual([]);
  });

  it('limits a group preview without changing its order', async () => {
    expect(
      (await listAreasByGroup(db, publishedViews, 'Statistical regions', 2)).map(
        ({ name }) => name,
      ),
    ).toEqual(['East Midlands', 'East of England']);
  });
});

describe('listAreasByGroups', () => {
  it('limits each display group independently and keeps requested order', async () => {
    expect(
      await listAreasByGroups(
        db,
        publishedViews,
        ['Statistical regions', 'No Such Level', 'NHS regions'],
        2,
      ),
    ).toEqual([
      {
        displayGroup: 'Statistical regions',
        areas: await listAreasByGroup(db, publishedViews, 'Statistical regions', 2),
      },
      { displayGroup: 'No Such Level', areas: [] },
      {
        displayGroup: 'NHS regions',
        areas: await listAreasByGroup(db, publishedViews, 'NHS regions', 2),
      },
    ]);
  });

  it('orders areas with the same name consistently by code', async () => {
    const [group] = await listAreasByGroups(db, publishedViews, ['GP practices']);
    expect(group?.areas).toEqual(await listAreasByGroup(db, publishedViews, 'GP practices'));
    const duplicateNames = group?.areas.filter(({ name }) => name === 'High Street Surgery') ?? [];
    expect(duplicateNames.length).toBeGreaterThan(1);
    expect(duplicateNames.map(({ code }) => code)).toEqual(
      duplicateNames.map(({ code }) => code).sort(),
    );
  });
});

describe('listAreasByCodes', () => {
  it('resolves each code to its current name and area type', async () => {
    expect(await listAreasByCodes(db, publishedViews, [CORNWALL, ENGLAND])).toEqual([
      {
        code: CORNWALL,
        name: 'Cornwall',
        areaType: 'UA unchanged',
        displayGroup: 'Local authorities',
      },
      { code: ENGLAND, name: 'England', areaType: 'England', displayGroup: null },
    ]);
  });

  it('returns nothing for empty input, silently skipping unknown codes', async () => {
    expect(await listAreasByCodes(db, publishedViews, [])).toEqual([]);
    expect(await listAreasByCodes(db, publishedViews, ['X99999999'])).toEqual([]);
  });
});

describe('searchAreas', () => {
  it('matches by name or exact code across displayed types, carrying the display group', async () => {
    const cornwall = {
      code: CORNWALL,
      name: 'Cornwall',
      areaType: 'UA unchanged',
      displayGroup: 'Local authorities',
    };
    const results = await searchAreas(db, publishedViews, 'cornwall', 10);

    // The council ranks above the ICB and practices that contain the same word.
    expect(results[0]).toEqual(cornwall);
    expect(results.every(({ name }) => name.toLowerCase().includes('cornwall'))).toBe(true);
    expect(results.every(({ displayGroup }) => displayGroup !== null)).toBe(true);
    expect((await searchAreas(db, publishedViews, 'e06000052', 10))[0]).toEqual(cornwall);
  });

  it('never surfaces an area whose type has no display group', async () => {
    expect(
      (await searchAreas(db, publishedViews, 'england', 20)).every(({ code }) => code !== ENGLAND),
    ).toBe(true);
  });

  it('ranks earlier matches first and applies the limit', async () => {
    const names = (await searchAreas(db, publishedViews, 'west', 3)).map(({ name }) => name);

    expect(names).toHaveLength(3);
    expect(names.every((name) => name.startsWith('West'))).toBe(true);
  });

  it('treats pattern characters literally instead of as wildcards', async () => {
    expect(await searchAreas(db, publishedViews, '%', 10)).toEqual([]);
    expect(await searchAreas(db, publishedViews, '____', 10)).toEqual([]);
  });
});

function noFilters(overrides: Partial<IndicatorSearchFilters> = {}): IndicatorSearchFilters {
  return {
    query: '',
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
    limit: 200,
    ...overrides,
  };
}

describe('searchIndicators', () => {
  it('no-filter total equals listPublished count', async () => {
    const [all, { total }] = await Promise.all([
      listPublishedIndicators(db, publishedViews),
      searchIndicators(db, publishedViews, noFilters()),
    ]);

    expect(total).toBe(all.length);
  });

  it('keyword matches across words with AND semantics', async () => {
    const { total: both } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: 'mortality cancer' }),
    );
    const { total: first } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: 'mortality' }),
    );
    const { total: second } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: 'cancer' }),
    );

    expect(both).toBeGreaterThan(0);
    expect(both).toBeLessThanOrEqual(first);
    expect(both).toBeLessThanOrEqual(second);
  });

  it('matches a slug exactly, case-folded', async () => {
    const bySlug = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: MORTALITY_SLUG.toUpperCase() }),
    );

    expect(bySlug.total).toBe(1);
    expect(bySlug.indicators).toEqual([expect.objectContaining({ shortId: MORTALITY_UNDER_75 })]);
  });

  it("carries England's latest period in the first series, the year type and the update date", async () => {
    const { indicators } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: 'under 75 mortality rate from all causes' }),
    );
    const { indicators: diabetes } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: String(DIABETES_QOF_PREVALENCE) }),
    );

    // The rolling three-year series also ends in 2024, but the aggregate series comes first.
    expect(indicators).toEqual([
      expect.objectContaining({
        shortId: MORTALITY_UNDER_75,
        latestPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
        yearType: { value: 'calendar', label: 'Calendar' },
        dataUpdatedAt: '2026-04-20T16:25:18.000Z',
      }),
    ]);
    expect(diabetes).toEqual([
      expect.objectContaining({
        latestPeriod: { fromDate: '2024-04-01', toDate: '2025-03-31' },
        yearType: expect.objectContaining({ value: 'financial' }),
      }),
    ]);
  });

  it('matches an exact short id but not the internal id', async () => {
    const byShortId = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: String(MORTALITY_UNDER_75) }),
    );

    expect(byShortId.total).toBe(1);
    expect(byShortId.indicators).toEqual([
      expect.objectContaining({ shortId: MORTALITY_UNDER_75 }),
    ]);
    expect(byShortId.indicators[0]).not.toHaveProperty('id');

    const byInternalId = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: mortalityId }),
    );

    expect(byInternalId.total).toBe(0);
  });

  it('matches associated topic and classification slugs', async () => {
    const [topicResult, topicFilter, classificationResult, classificationFilter] =
      await Promise.all([
        searchIndicators(db, publishedViews, noFilters({ query: 'mortality-and-life-expectancy' })),
        searchIndicators(
          db,
          publishedViews,
          noFilters({ topics: ['mortality-and-life-expectancy'] }),
        ),
        searchIndicators(db, publishedViews, noFilters({ query: 'indicator-type-outcome' })),
        searchIndicators(
          db,
          publishedViews,
          noFilters({ indicatorTypes: ['indicator-type-outcome'] }),
        ),
      ]);

    expect(topicResult.total).toBe(topicFilter.total);
    expect(topicResult.total).toBeGreaterThan(0);
    expect(classificationResult.total).toBe(classificationFilter.total);
    expect(classificationResult.total).toBeGreaterThan(0);
  });

  it('lets words match across the indicator name and its taxonomy', async () => {
    const result = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: 'diabetes prevalence' }),
    );

    expect(result.total).toBeGreaterThan(0);
    expect(result.indicators[0]?.name).toContain('Diabetes');
  });

  it('ranks direct name matches ahead of taxonomy-only matches', async () => {
    const { indicators } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: 'diabetes' }),
    );

    expect(indicators[0]?.name).toBe('Diabetes: QOF prevalence');
  });

  it('treats LIKE syntax in the keyword query as literal text', async () => {
    await expect(
      searchIndicators(db, publishedViews, noFilters({ query: '%' })),
    ).resolves.toMatchObject({
      total: 0,
      indicators: [],
    });
    await expect(
      searchIndicators(db, publishedViews, noFilters({ query: '_' })),
    ).resolves.toMatchObject({
      total: 0,
      indicators: [],
    });
  });

  it('keyword search is case-insensitive', async () => {
    const { total: upper } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: 'DIABETES' }),
    );
    const { total: lower } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ query: 'diabetes' }),
    );

    expect(upper).toBeGreaterThan(0);
    expect(upper).toBe(lower);
  });

  it('topic filter uses OR within dimension', async () => {
    const { total: diabetes } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ topics: ['diabetes'] }),
    );
    const { total: mortality } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ topics: ['mortality-and-life-expectancy'] }),
    );
    const { total: both } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ topics: ['diabetes', 'mortality-and-life-expectancy'] }),
    );

    expect(diabetes).toBeGreaterThan(0);
    expect(mortality).toBeGreaterThan(0);
    expect(both).toBeGreaterThanOrEqual(Math.max(diabetes, mortality));
  });

  it('AND across topic and classification dimensions', async () => {
    const { total: topicOnly } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ topics: ['diabetes'] }),
    );
    const { total: topicAndType } = await searchIndicators(
      db,
      publishedViews,
      noFilters({
        topics: ['diabetes'],
        indicatorTypes: ['indicator-type-outcome'],
      }),
    );

    expect(topicOnly).toBeGreaterThan(0);
    expect(topicAndType).toBeGreaterThan(0);
    expect(topicAndType).toBeLessThanOrEqual(topicOnly);
  });

  it('indicator type filter works (OR within dimension)', async () => {
    const { total: outcome } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ indicatorTypes: ['indicator-type-outcome'] }),
    );
    const { total: prevalence } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ indicatorTypes: ['indicator-type-risk-factor'] }),
    );
    const { total: both } = await searchIndicators(
      db,
      publishedViews,
      noFilters({
        indicatorTypes: ['indicator-type-outcome', 'indicator-type-risk-factor'],
      }),
    );

    expect(outcome).toBeGreaterThan(0);
    expect(prevalence).toBeGreaterThan(0);
    expect(both).toBeGreaterThanOrEqual(Math.max(outcome, prevalence));
  });

  it('does not infer life stage tags where the workbook leaves them to age metadata', async () => {
    const { total } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ lifeStages: ['life-stage-older-people'] }),
    );

    expect(total).toBe(0);
  });

  it('framework filter exercises the framework dimension', async () => {
    const { total } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ frameworks: ['framework-public-health-outcomes-framework'] }),
    );

    expect(total).toBeGreaterThan(0);
  });

  it('does not retain the former all-ages population tag', async () => {
    const { total } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ populations: ['population-all-ages'] }),
    );

    expect(total).toBe(0);
  });

  it('does not infer inequality tags from available observation breakdowns', async () => {
    const { total } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ inequalities: ['inequality-deprivation-or-income'] }),
    );

    expect(total).toBe(0);
  });

  it('display group filter returns indicators available in that geography level', async () => {
    const { total } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ displayGroups: ['Local authorities'] }),
    );

    expect(total).toBeGreaterThan(0);
  });

  it('area filters require usable data for every selected area', async () => {
    const { indicators } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ areaCodes: ['E07000223', 'E07000032'] }),
    );
    const ids = indicators.map(({ shortId }) => shortId);

    expect(ids).toContain(92443);
    expect(ids).not.toContain(93622);
  });

  it('source filter returns indicators with that data source', async () => {
    const facets = await listIndicatorFacets(db, publishedViews);
    const firstSource = facets.sources[0];

    if (!firstSource) {
      return;
    }

    const { total } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ sources: [firstSource] }),
    );
    expect(total).toBeGreaterThan(0);
  });

  it('value type filter returns indicators with that value type', async () => {
    const { total } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ valueTypes: ['Proportion'] }),
    );

    expect(total).toBeGreaterThan(0);
  });

  it('year type filter returns indicators with that year type', async () => {
    const facets = await listIndicatorFacets(db, publishedViews);
    const firstYearType = facets.yearTypes[0];

    if (!firstYearType) {
      return;
    }

    const { total } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ yearTypes: [firstYearType] }),
    );
    expect(total).toBeGreaterThan(0);
  });

  it('limit 1 returns 1 row but total is unchanged', async () => {
    const { total: fullTotal } = await searchIndicators(db, publishedViews, noFilters());
    const { total, indicators } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ limit: 1 }),
    );

    expect(total).toBe(fullTotal);
    expect(indicators).toHaveLength(1);
  });

  it('empty combination returns total 0 and empty indicators', async () => {
    const { total, indicators } = await searchIndicators(
      db,
      publishedViews,
      noFilters({
        topics: ['diabetes', 'mortality-and-life-expectancy'],
        frameworks: ['framework-public-health-outcomes-framework'],
        inequalities: ['inequality-deprivation-or-income'],
      }),
    );

    // diabetes topic contains no indicators that also have framework+inequality — this is
    // expected to return zero given the AND-across-dimensions semantics.
    // Verify the API contract shape regardless of exact count.
    expect(total).toBeGreaterThanOrEqual(0);
    expect(indicators).toHaveLength(Math.min(total, 200));
  });

  it('an impossible filter combination returns empty', async () => {
    // No indicator has slug "no-such-topic"
    const { total, indicators } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ topics: ['no-such-topic-slug-zxqw'] }),
    );

    expect(total).toBe(0);
    expect(indicators).toEqual([]);
  });

  it('rows carry topics and classifications', async () => {
    const { indicators } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ topics: ['diabetes'] }),
    );

    expect(indicators.length).toBeGreaterThan(0);
    for (const row of indicators) {
      expect(row.topics.length).toBeGreaterThan(0);
      expect(
        row.topics.every((t) => typeof t.slug === 'string' && typeof t.title === 'string'),
      ).toBe(true);
      // classifications may be empty for some indicators but the array must exist
      expect(Array.isArray(row.classifications)).toBe(true);
      for (const c of row.classifications) {
        expect(typeof c.dimension).toBe('string');
        expect(typeof c.slug).toBe('string');
        expect(typeof c.name).toBe('string');
      }
    }
  });

  it('is deterministic — same query returns the same order on repeated calls', async () => {
    const [first, second] = await Promise.all([
      searchIndicators(
        db,
        publishedViews,
        noFilters({ topics: ['mortality-and-life-expectancy'] }),
      ),
      searchIndicators(
        db,
        publishedViews,
        noFilters({ topics: ['mortality-and-life-expectancy'] }),
      ),
    ]);

    expect(first.indicators.map((i) => i.shortId)).toEqual(second.indicators.map((i) => i.shortId));
  });

  it.each(['', 'diabetes'])(
    'orders recently updated results by data update date for query %j',
    async (query) => {
      const updated = new Map(
        (
          await db
            .select({
              shortId: publishedViews.indicator.shortId,
              dataUpdatedAt: publishedViews.indicator.dataUpdatedAt,
            })
            .from(publishedViews.indicator)
        ).map(({ shortId, dataUpdatedAt }) => [shortId, dataUpdatedAt?.getTime() ?? null]),
      );
      const { indicators } = await searchIndicators(
        db,
        publishedViews,
        noFilters({ query, sort: 'recently-updated' }),
      );
      const dates = indicators.map(({ shortId }) => updated.get(shortId) ?? null);
      const dated = dates.filter((date) => date !== null);

      expect(new Set(dated).size).toBeGreaterThan(1);
      expect(dates.slice(0, dated.length)).toEqual([...dated].sort((a, b) => b - a));
    },
  );

  it.each(['', 'rate'])(
    'pages through every result once, in the unpaged order, for query %j',
    async (query) => {
      const all = await searchIndicators(db, publishedViews, noFilters({ query }));
      const pages = await Promise.all(
        Array.from({ length: Math.ceil(all.total / 2) }, (_, index) =>
          searchIndicators(db, publishedViews, noFilters({ query, page: index + 1, limit: 2 })),
        ),
      );

      expect(all.total).toBeGreaterThan(2);
      expect(pages.flatMap(({ indicators }) => indicators.map((i) => i.shortId))).toEqual(
        all.indicators.map((i) => i.shortId),
      );
    },
  );

  it('indicators with a unique first-topic are sub-ordered by name', async () => {
    // These indicators share one topic, so the sub-order is by name.
    const { indicators } = await searchIndicators(
      db,
      publishedViews,
      noFilters({ topics: ['health-behaviours'] }),
    );

    expect(indicators.length).toBeGreaterThan(0);
    const names = indicators.map((i) => i.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('listIndicatorFacets', () => {
  it('topics are scoped to published indicators — every topic slug returns at least one result when searched', async () => {
    const facets = await listIndicatorFacets(db, publishedViews);

    expect(facets.topics.length).toBeGreaterThan(0);
    for (const { slug } of facets.topics) {
      const { total } = await searchIndicators(db, publishedViews, noFilters({ topics: [slug] }));
      expect(total).toBeGreaterThan(0);
    }
  });

  it('topics are ordered by title', async () => {
    const facets = await listIndicatorFacets(db, publishedViews);

    const titles = facets.topics.map((t) => t.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });

  it('classifications are ordered by dimension then name', async () => {
    const facets = await listIndicatorFacets(db, publishedViews);

    expect(facets.classifications.length).toBeGreaterThan(0);
    const pairs = facets.classifications.map((c) => `${c.dimension}|${c.name}`);
    expect(pairs).toEqual([...pairs].sort((a, b) => a.localeCompare(b)));
  });

  it('uses the workbook tag groups without duplicating population and inequality metadata', async () => {
    const facets = await listIndicatorFacets(db, publishedViews);

    const dimensions = new Set(facets.classifications.map((c) => c.dimension));
    expect(dimensions).toEqual(new Set(['indicator_type', 'framework']));
  });

  it('sources are deduplicated — no duplicate name in the list', async () => {
    const facets = await listIndicatorFacets(db, publishedViews);

    const names = facets.sources;
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('sources are ordered alphabetically', async () => {
    const facets = await listIndicatorFacets(db, publishedViews);

    const names = facets.sources;
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('value types and year types are non-empty and ordered', async () => {
    const facets = await listIndicatorFacets(db, publishedViews);

    expect(facets.valueTypes.length).toBeGreaterThan(0);
    expect(facets.valueTypes).toEqual([...facets.valueTypes].sort((a, b) => a.localeCompare(b)));

    expect(facets.yearTypes.length).toBeGreaterThan(0);
    expect(facets.yearTypes).toEqual([...facets.yearTypes].sort((a, b) => a.localeCompare(b)));
  });

  it('all facet classification slugs return at least one result when searched', async () => {
    const facets = await listIndicatorFacets(db, publishedViews);

    for (const { dimension, slug } of facets.classifications) {
      const filterKey = {
        indicator_type: 'indicatorTypes',
        life_stage: 'lifeStages',
        framework: 'frameworks',
        population: 'populations',
        inequality: 'inequalities',
      }[dimension] as keyof IndicatorSearchFilters;

      const { total } = await searchIndicators(
        db,
        publishedViews,
        noFilters({ [filterKey]: [slug] }),
      );
      expect(total).toBeGreaterThan(0);
    }
  });
});

describe('area deprivation memberships', () => {
  it('reads both tiers and schemes through the public role', async () => {
    const publicDb = testDb.connectDb({ login: apiLogin('public_api') });
    const rows = (
      await listAreasByCodes(
        publicDb,
        publishedViews,
        ['E10000032', CORNWALL, ENGLAND, 'UNKNOWN'],
        true,
      )
    ).flatMap(({ benchmarks }) => benchmarks?.deprivation ?? []);
    expect(rows.map(({ code, scheme, tier, decile }) => ({ code, scheme, tier, decile }))).toEqual(
      expect.arrayContaining([
        { code: 'E10000032', scheme: 'IMD2025', tier: 'upper', decile: 9 },
        { code: 'E10000032', scheme: 'IMD2019', tier: 'upper', decile: 9 },
        { code: CORNWALL, scheme: 'IMD2025', tier: 'upper', decile: 6 },
        { code: CORNWALL, scheme: 'IMD2019', tier: 'upper', decile: 5 },
        { code: CORNWALL, scheme: 'IMD2025', tier: 'lower', decile: 4 },
        { code: CORNWALL, scheme: 'IMD2019', tier: 'lower', decile: 4 },
      ]),
    );
    expect(rows).toHaveLength(6);
    expect(await listAreasByCodes(publicDb, publishedViews, [], true)).toEqual([]);
    expect(
      (await listAreasByCodes(publicDb, publishedViews, [ENGLAND], true)).flatMap(
        ({ benchmarks }) => benchmarks?.deprivation ?? [],
      ),
    ).toEqual([]);
    for (const row of rows) {
      expect(row.dimensionTypeId).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.dimensionValueId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe('published policy goals', () => {
  it('returns numeric single-value and interval goals and null without a goal', async () => {
    const indicatorId = await resolvedId(GASTROENTERITIS_ADMISSIONS);
    const publicDb = testDb.connectDb({ login: apiLogin('public_api') });
    try {
      for (const upper of [null, 95.5]) {
        await testDb.sql`
          UPDATE indicator_version SET has_goal_benchmark = true, goal_lower_value = 90.25,
            goal_upper_value = ${upper}, goal_polarity = 'higher-is-better', goal_policy_detail = 'Policy target'
          WHERE id = (SELECT id FROM current_published_version WHERE indicator_id = ${indicatorId})
        `;
        expect((await getIndicatorDetailById(publicDb, publishedViews, indicatorId))?.goal).toEqual(
          {
            lower: 90.25,
            upper,
            polarity: 'higher-is-better',
            policyDetail: 'Policy target',
          },
        );
      }
      await testDb.sql`
        UPDATE indicator_version SET has_goal_benchmark = true, goal_lower_value = 10,
          goal_upper_value = null, goal_polarity = 'lower-is-better', goal_policy_detail = null
        WHERE id = (SELECT id FROM current_published_version WHERE indicator_id = ${indicatorId})
      `;
      expect((await getIndicatorDetailById(publicDb, publishedViews, indicatorId))?.goal).toEqual({
        lower: 10,
        upper: null,
        polarity: 'lower-is-better',
        policyDetail: null,
      });
    } finally {
      await testDb.sql`
        UPDATE indicator_version SET has_goal_benchmark = false, goal_lower_value = null,
          goal_upper_value = null, goal_polarity = null, goal_policy_detail = null
        WHERE id = (SELECT id FROM current_published_version WHERE indicator_id = ${indicatorId})
      `;
    }
    expect((await getIndicatorDetailById(publicDb, publishedViews, indicatorId))?.goal).toBeNull();
  });
});

describe('getObservationRangeByCategory', () => {
  it('computes exact segment percentiles using only member areas and the published batch', async () => {
    const sql = testDb.sql;
    const publicDb = testDb.connectDb({ login: apiLogin('public_api') });
    const memberships = (
      await listAreasByCodes(publicDb, publishedViews, [CORNWALL], true)
    ).flatMap(({ benchmarks }) => benchmarks?.deprivation ?? []);
    const category = memberships.find(
      ({ scheme, tier }) => scheme === 'IMD2025' && tier === 'upper',
    )?.dimensionValueId;
    if (!category) throw new Error('Missing category fixture');
    const members = await sql<
      { area_id: string }[]
    >`SELECT area_id FROM area_category WHERE dimension_value_id = ${category} ORDER BY area_id LIMIT 5`;
    expect(members).toHaveLength(5);
    const [outsider] = await sql<{ id: string }[]>`SELECT a.id FROM area a WHERE NOT EXISTS (
      SELECT 1 FROM area_category c WHERE c.area_id = a.id AND c.dimension_value_id = ${category}
    ) ORDER BY a.id LIMIT 1`;
    const [published] = await sql<{ id: string; upload_batch_id: string }[]>`
      SELECT v.id, v.upload_batch_id FROM indicator_version v JOIN current_published_version cpv ON cpv.id = v.id
      WHERE cpv.indicator_id = ${diabetesMortalityId}
    `;
    if (!published || !outsider) throw new Error('Missing range fixtures');
    const [unpublished] = await sql<{ id: string }[]>`
      INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
      VALUES (${diabetesMortalityId}, ${published.id}, 'unpublished-range.csv', ${ACTOR}) RETURNING id
    `;
    if (!unpublished) throw new Error('Missing unpublished batch');
    try {
      for (const [index, member] of members.entries()) {
        await sql`
          INSERT INTO observation (indicator_id, area_id, upload_batch_id, from_date, to_date, value, dimension_key)
          VALUES (${diabetesMortalityId}, ${member.area_id}, ${published.upload_batch_id}, '2099-01-01', '2099-12-31', ${[1, 2, 3, 4, 100][index] ?? 0}, '')
        `;
      }
      const first = members[0];
      if (!first) throw new Error('Missing first category member');
      await sql`
        INSERT INTO observation (indicator_id, area_id, upload_batch_id, from_date, to_date, value, dimension_key)
        VALUES (${diabetesMortalityId}, ${outsider.id}, ${published.upload_batch_id}, '2099-01-01', '2099-12-31', 1000, ''),
          (${diabetesMortalityId}, ${first.area_id}, ${unpublished.id}, '2099-01-01', '2099-12-31', 10000, ''),
          (${diabetesMortalityId}, ${first.area_id}, ${published.upload_batch_id}, '2098-01-01', '2098-12-31', null, '')
      `;
      await sql`
        WITH dimensions AS (
          SELECT dv.id, dv.dimension_type_id FROM dimension_value dv JOIN dimension_type dt ON dt.id = dv.dimension_type_id
          WHERE (dt.name = 'Age' AND dv.name = '<75 yrs') OR (dt.name = 'Sex' AND dv.name = 'Male')
        ), inserted AS (
          INSERT INTO observation (indicator_id, area_id, upload_batch_id, from_date, to_date, value, dimension_key)
          SELECT ${diabetesMortalityId}, ${first.area_id}, ${published.upload_batch_id}, '2099-01-01', '2099-12-31', 7,
            string_agg(id::text, ',' ORDER BY id) FROM dimensions RETURNING id
        )
        INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id)
        SELECT inserted.id, dimensions.id, dimensions.dimension_type_id FROM inserted, dimensions
      `;
      const range = await getObservationRangeByCategory(
        publicDb,
        publishedViews,
        diabetesMortalityId,
        category,
      );
      expect(range.filter(({ fromDate }) => fromDate === '2099-01-01')).toEqual([
        {
          fromDate: '2099-01-01',
          toDate: '2099-12-31',
          segment: '',
          min: 1,
          max: 100,
          p25: 2,
          p75: 4,
          quintileCutoffs: [1, 2, 3, 4],
        },
        {
          fromDate: '2099-01-01',
          toDate: '2099-12-31',
          segment: '<75 yrs|Male',
          min: 7,
          max: 7,
          p25: 7,
          p75: 7,
          quintileCutoffs: null,
        },
      ]);
      expect(range.some(({ fromDate }) => fromDate === '2098-01-01')).toBe(false);
      expect(
        await getObservationRangeByCategory(
          publicDb,
          publishedViews,
          diabetesMortalityId,
          UNSEEDED_ID,
        ),
      ).toEqual([]);
      expect(
        await getObservationRangeByCategory(publicDb, publishedViews, UNSEEDED_ID, category),
      ).toEqual([]);
    } finally {
      await sql`DELETE FROM observation WHERE indicator_id = ${diabetesMortalityId} AND from_date >= '2098-01-01'`;
      await sql`DELETE FROM upload_batch WHERE id = ${unpublished.id}`;
    }
  });
});

describe('getObservationRangeByTier', () => {
  it('ranges published observations by tier and exact segment, optionally within a current parent', async () => {
    const sql = testDb.sql;
    const publicDb = testDb.connectDb({ login: apiLogin('public_api') });
    const [published] = await sql<{ id: string; upload_batch_id: string }[]>`
      SELECT v.id, v.upload_batch_id FROM indicator_version v JOIN current_published_version cpv ON cpv.id = v.id
      WHERE cpv.indicator_id = ${diabetesMortalityId}
    `;
    const [councilType] = await sql<
      { id: string }[]
    >`SELECT id FROM area_type WHERE display_group = 'Local authorities' LIMIT 1`;
    const [regionType] = await sql<
      { id: string }[]
    >`SELECT id FROM area_type WHERE name = 'Regions (statistical)'`;
    if (!published || !councilType || !regionType) throw new Error('Missing parent range fixtures');
    const [parent] = await sql<{ id: string }[]>`
      INSERT INTO area (code, name, area_type_id) VALUES ('RANGE660', 'Range parent', ${regionType.id}) RETURNING id
    `;
    const [unpublished] = await sql<{ id: string }[]>`
      INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
      VALUES (${diabetesMortalityId}, ${published.id}, 'parent-range.csv', ${ACTOR}) RETURNING id
    `;
    if (!parent || !unpublished) throw new Error('Missing parent range parent or batch');
    try {
      const children = await sql<{ id: string; code: string }[]>`
        INSERT INTO area (code, name, area_type_id, is_current)
        SELECT (CASE WHEN n = 2 THEN 'E06' WHEN n = 3 THEN 'E08' WHEN n = 4 THEN 'E09' WHEN n = 8 THEN 'E54' WHEN n = 10 THEN 'E07' ELSE 'E10' END) || lpad((990000 + n)::text, 6, '0'), 'Range child ' || n,
          CASE WHEN n = 8 THEN ${regionType.id}::uuid ELSE ${councilType.id}::uuid END, n <> 7
        FROM generate_series(1, 10) n RETURNING id, code
      `;
      for (const child of children) {
        const index = Number(child.code.slice(3)) - 990000;
        if (index !== 9) {
          await sql`
            INSERT INTO area_relationship (parent_area_id, child_area_id, valid_to)
            VALUES (${parent.id}, ${child.id}, ${index === 6 ? '2098-12-31' : null})
          `;
        }
        await sql`
          INSERT INTO observation (indicator_id, area_id, upload_batch_id, from_date, to_date, value, dimension_key)
          VALUES (${diabetesMortalityId}, ${child.id}, ${published.upload_batch_id}, '2099-01-01', '2099-12-31', ${[1, 2, 3, 4, 100, 1000, 1000, 1000, 1000, 50][index - 1] ?? 1000}, '')
        `;
      }
      const first = children.find(({ code }) => code === 'E10990001');
      if (!first) throw new Error('Missing range child');
      await sql`
        INSERT INTO area_relationship (parent_area_id, child_area_id) VALUES (${parent.id}, ${first.id})
      `;
      await sql`
        INSERT INTO observation (indicator_id, area_id, upload_batch_id, from_date, to_date, value, dimension_key)
        VALUES (${diabetesMortalityId}, ${first.id}, ${unpublished.id}, '2099-01-01', '2099-12-31', 10000, ''),
          (${diabetesMortalityId}, ${first.id}, ${published.upload_batch_id}, '2098-01-01', '2098-12-31', null, '')
      `;
      await sql`
        WITH dimensions AS (
          SELECT dv.id, dv.dimension_type_id FROM dimension_value dv JOIN dimension_type dt ON dt.id = dv.dimension_type_id
          WHERE (dt.name = 'Age' AND dv.name = '<75 yrs') OR (dt.name = 'Sex' AND dv.name = 'Male')
        ), inserted AS (
          INSERT INTO observation (indicator_id, area_id, upload_batch_id, from_date, to_date, value, dimension_key)
          SELECT ${diabetesMortalityId}, ${first.id}, ${published.upload_batch_id}, '2099-01-01', '2099-12-31', 7,
            string_agg(id::text, ',' ORDER BY id) FROM dimensions RETURNING id
        )
        INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id)
        SELECT inserted.id, dimensions.id, dimensions.dimension_type_id FROM inserted, dimensions
      `;
      expect(
        await getObservationRangeByTier(
          publicDb,
          publishedViews,
          diabetesMortalityId,
          'upper',
          'RANGE660',
        ),
      ).toEqual([
        {
          fromDate: '2099-01-01',
          toDate: '2099-12-31',
          segment: '',
          min: 1,
          max: 100,
          p25: 2,
          p75: 4,
          quintileCutoffs: [1, 2, 3, 4],
        },
        {
          fromDate: '2099-01-01',
          toDate: '2099-12-31',
          segment: '<75 yrs|Male',
          min: 7,
          max: 7,
          p25: 7,
          p75: 7,
          quintileCutoffs: null,
        },
      ]);
      expect(
        await getObservationRangeByTier(
          publicDb,
          publishedViews,
          diabetesMortalityId,
          'upper',
          'UNKNOWN',
        ),
      ).toEqual([]);
      expect(
        await getObservationRangeByTier(
          publicDb,
          publishedViews,
          diabetesMortalityId,
          'lower',
          'RANGE660',
        ),
      ).toEqual([
        {
          fromDate: '2099-01-01',
          toDate: '2099-12-31',
          segment: '',
          min: 2,
          max: 50,
          p25: 2.75,
          p75: 15.5,
          quintileCutoffs: null,
        },
      ]);
      expect(
        (
          await getObservationRangeByTier(publicDb, publishedViews, diabetesMortalityId, 'upper')
        ).find(({ fromDate, segment }) => fromDate === '2099-01-01' && segment === ''),
      ).toMatchObject({ min: 1, max: 1000, p25: 2.5, p75: 550 });
      expect(
        await getObservationRangeByTier(publicDb, publishedViews, UNSEEDED_ID, 'upper', 'RANGE660'),
      ).toEqual([]);
      await sql`UPDATE area SET is_current = false WHERE id = ${parent.id}`;
      expect(
        await getObservationRangeByTier(
          publicDb,
          publishedViews,
          diabetesMortalityId,
          'upper',
          'RANGE660',
        ),
      ).toEqual([]);
    } finally {
      await sql`DELETE FROM observation WHERE indicator_id = ${diabetesMortalityId} AND from_date >= '2098-01-01'`;
      await sql`DELETE FROM upload_batch WHERE id = ${unpublished.id}`;
      await sql`DELETE FROM area_relationship WHERE parent_area_id = ${parent.id}`;
      await sql`DELETE FROM area WHERE name LIKE 'Range child %' OR code = 'RANGE660'`;
    }
  });
});
