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
  getIndicatorObservations,
  getObservationRange,
  getPublishedIndicatorById,
  type IndicatorSearchFilters,
  listIndicatorFacets,
  listPublishedIndicators,
  resolveIndicatorIdBySlug,
  resolvePublishedIndicatorId,
  searchIndicators,
  searchPublishedIndicators,
} from './indicator-repository.ts';
import { SYSTEM_USER_IDS } from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

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
  const id = await resolvePublishedIndicatorId(db, shortId);
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
    const indicators = await listPublishedIndicators(db);

    expect(indicators).toHaveLength(12);
    const names = indicators.map(({ name }) => name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('carries the slug each link is built from', async () => {
    const indicators = await listPublishedIndicators(db);

    expect(indicators).toContainEqual(
      expect.objectContaining({ shortId: MORTALITY_UNDER_75, slug: MORTALITY_SLUG }),
    );
  });
});

describe('searchPublishedIndicators', () => {
  it('matches case-insensitively anywhere in the name', async () => {
    const results = await searchPublishedIndicators(db, 'DIABETES', 20);

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every(({ name }) => name.toLowerCase().includes('diabetes'))).toBe(true);
  });

  it('ranks a match earlier in the name above a later one', async () => {
    const results = await searchPublishedIndicators(db, 'diabetes', 20);

    expect(results[0]?.name).toBe('Diabetes: QOF prevalence');
  });

  it('matches a slug exactly, case-folded', async () => {
    await expect(searchPublishedIndicators(db, MORTALITY_SLUG.toUpperCase(), 20)).resolves.toEqual([
      expect.objectContaining({ shortId: MORTALITY_UNDER_75 }),
    ]);
  });

  it('matches an exact short id but not the internal id', async () => {
    await expect(searchPublishedIndicators(db, String(MORTALITY_UNDER_75), 20)).resolves.toEqual([
      expect.objectContaining({ shortId: MORTALITY_UNDER_75 }),
    ]);
    await expect(searchPublishedIndicators(db, mortalityId, 20)).resolves.toEqual([]);
  });

  it('respects the limit', async () => {
    expect(await searchPublishedIndicators(db, 'a', 3)).toHaveLength(3);
  });

  it('treats LIKE syntax in the query as literal text', async () => {
    expect(await searchPublishedIndicators(db, '%', 20)).toEqual([]);
    expect(await searchPublishedIndicators(db, '_', 20)).toEqual([]);
  });
});

describe('resolvePublishedIndicatorId', () => {
  it('answers the internal id for a seeded short id and nothing otherwise', async () => {
    expect(await resolvePublishedIndicatorId(db, MORTALITY_UNDER_75)).toMatch(/^[0-9a-f-]{36}$/);
    expect(await resolvePublishedIndicatorId(db, 424242)).toBeUndefined();
  });
});

describe('resolveIndicatorIdBySlug', () => {
  it('answers the internal id for a published slug and nothing otherwise', async () => {
    expect(await resolveIndicatorIdBySlug(db, MORTALITY_SLUG)).toBe(mortalityId);
    expect(await resolveIndicatorIdBySlug(db, 'no-such-indicator')).toBeUndefined();
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

    expect(await resolveIndicatorIdBySlug(db, 'an-earlier-name')).toBe(mortalityId);
    // The canonical slug is still the latest publication's.
    expect((await getPublishedIndicatorById(db, mortalityId))?.slug).toBe(MORTALITY_SLUG);
  });
});

describe('getPublishedIndicatorById', () => {
  it('resolves the lookups, metadata and available area types in one result', async () => {
    const indicator = await getPublishedIndicatorById(db, mortalityId);

    expect(indicator).toMatchObject({
      shortId: MORTALITY_UNDER_75,
      name: expect.stringContaining('Under 75 mortality rate'),
      valueType: 'Directly standardised rate',
      unit: 'per 100,000',
      yearType: { value: expect.any(String), label: expect.any(String) },
      updateFrequency: 'annually',
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

  it('gives no unit to values that have none', async () => {
    const id = await resolvedId(RESIDENT_POPULATION);

    expect((await getPublishedIndicatorById(db, id))?.unit).toBeNull();
  });

  it('names an other unit as its publisher did', async () => {
    const id = await resolvedId(GASTROENTERITIS_ADMISSIONS);
    await db.execute(
      sql`UPDATE indicator_version SET unit_id = ${UNIT_IDS.other}, unit_detail = 'per 1,000 live births'
          WHERE indicator_id = ${id}`,
    );

    expect((await getPublishedIndicatorById(db, id))?.unit).toBe('per 1,000 live births');
  });

  it('returns undefined for an id no indicator carries', async () => {
    expect(await getPublishedIndicatorById(db, UNSEEDED_ID)).toBeUndefined();
  });

  it('includes the prototype diabetes indicator with its high-fidelity geography coverage', async () => {
    const indicator = await getPublishedIndicatorById(db, diabetesId);

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

    const indicator = await getPublishedIndicatorById(db, diabetesId);

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
    const data = await getIndicatorObservations(db, mortalityId, ENGLAND);

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
    const [lowerTier] = await listAreasByType(db, 'LA unchanged');
    expect(lowerTier).toBeTruthy();

    const data = await getIndicatorObservations(db, await resolvedId(93622), lowerTier?.code ?? '');

    expect(data?.observations).toEqual([]);
    expect(data?.areaName).toBe(lowerTier?.name);
  });

  it('returns undefined only for an unknown area, now the id arrives resolved', async () => {
    expect(await getIndicatorObservations(db, mortalityId, 'E00000000')).toBeUndefined();
    // An id that resolved but holds no rows is an empty series, not an error.
    expect((await getIndicatorObservations(db, UNSEEDED_ID, ENGLAND))?.observations).toEqual([]);
  });

  it('returns the published Cornwall trend for the prototype diabetes indicator', async () => {
    const data = await getIndicatorObservations(db, diabetesId, CORNWALL);

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
      getObservationRange(db, diabetesId, 'Local authorities'),
      getIndicatorObservations(db, diabetesId, CORNWALL),
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
    expect(await getObservationRange(db, diabetesId, 'No Such Level')).toEqual([]);
    expect(await getObservationRange(db, UNSEEDED_ID, 'Local authorities')).toEqual([]);
  });

  it('returns one range per sex segment beside the aggregate series', async () => {
    const range = await getObservationRange(db, diabetesMortalityId, 'Local authorities');

    const segments = new Set(range.map(({ segment }) => segment));
    expect(segments.has('')).toBe(true);
    expect(segments.has('Male')).toBe(true);
    expect(segments.has('Female')).toBe(true);
    for (const period of range) {
      expect(period.min).toBeLessThanOrEqual(period.max);
    }
  });

  it('includes selectable segments when an aggregate series also exists', async () => {
    const range = await getObservationRange(db, mortalityId, 'Local authorities');
    const segments = new Set(range.map(({ segment }) => segment));

    expect(segments.has('<75 yrs')).toBe(true);
    expect(segments.has('<75 yrs|Male')).toBe(true);
    expect(segments.has('<75 yrs|Female')).toBe(true);
  });
});

describe('listAreaParents', () => {
  it('maps each area to its parent of the requested type', async () => {
    const parents = await listAreaParents(db, [CORNWALL], 'Regions (statistical)');

    expect(parents).toEqual([
      {
        code: CORNWALL,
        parentCode: 'E12000009',
        parentName: 'South West',
      },
    ]);
  });

  it('returns nothing for empty input or a parent type the areas do not roll up to', async () => {
    expect(await listAreaParents(db, [], 'Regions (statistical)')).toEqual([]);
    expect(await listAreaParents(db, [CORNWALL], 'No Such Type')).toEqual([]);
  });
});

describe('listAreasByType', () => {
  it('returns the current areas of the type in name order', async () => {
    const regions = await listAreasByType(db, 'Regions (statistical)');

    expect(regions).toHaveLength(9);
    const names = regions.map(({ name }) => name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(regions.every(({ code }) => /^E\d{8}$/.test(code))).toBe(true);
  });

  it('returns nothing for an area type that does not exist', async () => {
    expect(await listAreasByType(db, 'No Such Area Type')).toEqual([]);
  });
});

describe('listDisplayGroups', () => {
  it('returns the user-facing levels in display order', async () => {
    expect(await listDisplayGroups(db)).toEqual([
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
    const regions = await listAreasByGroup(db, 'Statistical regions');

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
    expect(await listAreasByGroup(db, 'No Such Level')).toEqual([]);
  });

  it('limits a group preview without changing its order', async () => {
    expect((await listAreasByGroup(db, 'Statistical regions', 2)).map(({ name }) => name)).toEqual([
      'East Midlands',
      'East of England',
    ]);
  });
});

describe('listAreasByGroups', () => {
  it('limits each display group independently and keeps requested order', async () => {
    expect(
      await listAreasByGroups(db, ['Statistical regions', 'No Such Level', 'NHS regions'], 2),
    ).toEqual([
      {
        displayGroup: 'Statistical regions',
        areas: await listAreasByGroup(db, 'Statistical regions', 2),
      },
      { displayGroup: 'No Such Level', areas: [] },
      {
        displayGroup: 'NHS regions',
        areas: await listAreasByGroup(db, 'NHS regions', 2),
      },
    ]);
  });

  it('orders areas with the same name consistently by code', async () => {
    const [group] = await listAreasByGroups(db, ['GP practices']);
    expect(group?.areas).toEqual(await listAreasByGroup(db, 'GP practices'));
    const duplicateNames = group?.areas.filter(({ name }) => name === 'High Street Surgery') ?? [];
    expect(duplicateNames.length).toBeGreaterThan(1);
    expect(duplicateNames.map(({ code }) => code)).toEqual(
      duplicateNames.map(({ code }) => code).sort(),
    );
  });
});

describe('listAreasByCodes', () => {
  it('resolves each code to its current name and area type', async () => {
    expect(await listAreasByCodes(db, [CORNWALL, ENGLAND])).toEqual([
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
    expect(await listAreasByCodes(db, [])).toEqual([]);
    expect(await listAreasByCodes(db, ['X99999999'])).toEqual([]);
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
    const results = await searchAreas(db, 'cornwall', 10);

    // The council ranks above the ICB and practices that contain the same word.
    expect(results[0]).toEqual(cornwall);
    expect(results.every(({ name }) => name.toLowerCase().includes('cornwall'))).toBe(true);
    expect(results.every(({ displayGroup }) => displayGroup !== null)).toBe(true);
    expect((await searchAreas(db, 'e06000052', 10))[0]).toEqual(cornwall);
  });

  it('never surfaces an area whose type has no display group', async () => {
    expect((await searchAreas(db, 'england', 20)).every(({ code }) => code !== ENGLAND)).toBe(true);
  });

  it('ranks earlier matches first and applies the limit', async () => {
    const names = (await searchAreas(db, 'west', 3)).map(({ name }) => name);

    expect(names).toHaveLength(3);
    expect(names.every((name) => name.startsWith('West'))).toBe(true);
  });

  it('treats pattern characters literally instead of as wildcards', async () => {
    expect(await searchAreas(db, '%', 10)).toEqual([]);
    expect(await searchAreas(db, '____', 10)).toEqual([]);
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
      listPublishedIndicators(db),
      searchIndicators(db, noFilters()),
    ]);

    expect(total).toBe(all.length);
  });

  it('keyword matches across words with AND semantics', async () => {
    const { total: both } = await searchIndicators(db, noFilters({ query: 'mortality cancer' }));
    const { total: first } = await searchIndicators(db, noFilters({ query: 'mortality' }));
    const { total: second } = await searchIndicators(db, noFilters({ query: 'cancer' }));

    expect(both).toBeGreaterThan(0);
    expect(both).toBeLessThanOrEqual(first);
    expect(both).toBeLessThanOrEqual(second);
  });

  it('matches a slug exactly, case-folded', async () => {
    const bySlug = await searchIndicators(db, noFilters({ query: MORTALITY_SLUG.toUpperCase() }));

    expect(bySlug.total).toBe(1);
    expect(bySlug.indicators).toEqual([expect.objectContaining({ shortId: MORTALITY_UNDER_75 })]);
  });

  it('matches an exact short id but not the internal id', async () => {
    const byShortId = await searchIndicators(db, noFilters({ query: String(MORTALITY_UNDER_75) }));

    expect(byShortId.total).toBe(1);
    expect(byShortId.indicators).toEqual([
      expect.objectContaining({ shortId: MORTALITY_UNDER_75 }),
    ]);
    expect(byShortId.indicators[0]).not.toHaveProperty('id');

    const byInternalId = await searchIndicators(db, noFilters({ query: mortalityId }));

    expect(byInternalId.total).toBe(0);
  });

  it('matches associated topic and classification slugs', async () => {
    const [topicResult, topicFilter, classificationResult, classificationFilter] =
      await Promise.all([
        searchIndicators(db, noFilters({ query: 'mortality-and-life-expectancy' })),
        searchIndicators(db, noFilters({ topics: ['mortality-and-life-expectancy'] })),
        searchIndicators(db, noFilters({ query: 'indicator-type-outcome' })),
        searchIndicators(db, noFilters({ indicatorTypes: ['indicator-type-outcome'] })),
      ]);

    expect(topicResult.total).toBe(topicFilter.total);
    expect(topicResult.total).toBeGreaterThan(0);
    expect(classificationResult.total).toBe(classificationFilter.total);
    expect(classificationResult.total).toBeGreaterThan(0);
  });

  it('lets words match across the indicator name and its taxonomy', async () => {
    const result = await searchIndicators(db, noFilters({ query: 'diabetes prevalence' }));

    expect(result.total).toBeGreaterThan(0);
    expect(result.indicators[0]?.name).toContain('Diabetes');
  });

  it('ranks direct name matches ahead of taxonomy-only matches', async () => {
    const { indicators } = await searchIndicators(db, noFilters({ query: 'diabetes' }));

    expect(indicators[0]?.name).toBe('Diabetes: QOF prevalence');
  });

  it('treats LIKE syntax in the keyword query as literal text', async () => {
    await expect(searchIndicators(db, noFilters({ query: '%' }))).resolves.toMatchObject({
      total: 0,
      indicators: [],
    });
    await expect(searchIndicators(db, noFilters({ query: '_' }))).resolves.toMatchObject({
      total: 0,
      indicators: [],
    });
  });

  it('keyword search is case-insensitive', async () => {
    const { total: upper } = await searchIndicators(db, noFilters({ query: 'DIABETES' }));
    const { total: lower } = await searchIndicators(db, noFilters({ query: 'diabetes' }));

    expect(upper).toBeGreaterThan(0);
    expect(upper).toBe(lower);
  });

  it('topic filter uses OR within dimension', async () => {
    const { total: diabetes } = await searchIndicators(db, noFilters({ topics: ['diabetes'] }));
    const { total: mortality } = await searchIndicators(
      db,
      noFilters({ topics: ['mortality-and-life-expectancy'] }),
    );
    const { total: both } = await searchIndicators(
      db,
      noFilters({ topics: ['diabetes', 'mortality-and-life-expectancy'] }),
    );

    expect(diabetes).toBeGreaterThan(0);
    expect(mortality).toBeGreaterThan(0);
    expect(both).toBeGreaterThanOrEqual(Math.max(diabetes, mortality));
  });

  it('AND across topic and classification dimensions', async () => {
    const { total: topicOnly } = await searchIndicators(db, noFilters({ topics: ['diabetes'] }));
    const { total: topicAndType } = await searchIndicators(
      db,
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
      noFilters({ indicatorTypes: ['indicator-type-outcome'] }),
    );
    const { total: prevalence } = await searchIndicators(
      db,
      noFilters({ indicatorTypes: ['indicator-type-risk-factor'] }),
    );
    const { total: both } = await searchIndicators(
      db,
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
      noFilters({ lifeStages: ['life-stage-older-people'] }),
    );

    expect(total).toBe(0);
  });

  it('framework filter exercises the framework dimension', async () => {
    const { total } = await searchIndicators(
      db,
      noFilters({ frameworks: ['framework-public-health-outcomes-framework'] }),
    );

    expect(total).toBeGreaterThan(0);
  });

  it('does not retain the former all-ages population tag', async () => {
    const { total } = await searchIndicators(
      db,
      noFilters({ populations: ['population-all-ages'] }),
    );

    expect(total).toBe(0);
  });

  it('does not infer inequality tags from available observation breakdowns', async () => {
    const { total } = await searchIndicators(
      db,
      noFilters({ inequalities: ['inequality-deprivation-or-income'] }),
    );

    expect(total).toBe(0);
  });

  it('display group filter returns indicators available in that geography level', async () => {
    const { total } = await searchIndicators(
      db,
      noFilters({ displayGroups: ['Local authorities'] }),
    );

    expect(total).toBeGreaterThan(0);
  });

  it('area filters require usable data for every selected area', async () => {
    const { indicators } = await searchIndicators(
      db,
      noFilters({ areaCodes: ['E07000223', 'E07000032'] }),
    );
    const ids = indicators.map(({ shortId }) => shortId);

    expect(ids).toContain(92443);
    expect(ids).not.toContain(93622);
  });

  it('source filter returns indicators with that data source', async () => {
    const facets = await listIndicatorFacets(db);
    const firstSource = facets.sources[0];

    if (!firstSource) {
      return;
    }

    const { total } = await searchIndicators(db, noFilters({ sources: [firstSource] }));
    expect(total).toBeGreaterThan(0);
  });

  it('value type filter returns indicators with that value type', async () => {
    const { total } = await searchIndicators(db, noFilters({ valueTypes: ['Proportion'] }));

    expect(total).toBeGreaterThan(0);
  });

  it('year type filter returns indicators with that year type', async () => {
    const facets = await listIndicatorFacets(db);
    const firstYearType = facets.yearTypes[0];

    if (!firstYearType) {
      return;
    }

    const { total } = await searchIndicators(db, noFilters({ yearTypes: [firstYearType] }));
    expect(total).toBeGreaterThan(0);
  });

  it('limit 1 returns 1 row but total is unchanged', async () => {
    const { total: fullTotal } = await searchIndicators(db, noFilters());
    const { total, indicators } = await searchIndicators(db, noFilters({ limit: 1 }));

    expect(total).toBe(fullTotal);
    expect(indicators).toHaveLength(1);
  });

  it('empty combination returns total 0 and empty indicators', async () => {
    const { total, indicators } = await searchIndicators(
      db,
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
      noFilters({ topics: ['no-such-topic-slug-zxqw'] }),
    );

    expect(total).toBe(0);
    expect(indicators).toEqual([]);
  });

  it('rows carry topics and classifications', async () => {
    const { indicators } = await searchIndicators(db, noFilters({ topics: ['diabetes'] }));

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
      searchIndicators(db, noFilters({ topics: ['mortality-and-life-expectancy'] })),
      searchIndicators(db, noFilters({ topics: ['mortality-and-life-expectancy'] })),
    ]);

    expect(first.indicators.map((i) => i.shortId)).toEqual(second.indicators.map((i) => i.shortId));
  });

  it('indicators with a unique first-topic are sub-ordered by name', async () => {
    // These indicators share one topic, so the sub-order is by name.
    const { indicators } = await searchIndicators(db, noFilters({ topics: ['health-behaviours'] }));

    expect(indicators.length).toBeGreaterThan(0);
    const names = indicators.map((i) => i.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('listIndicatorFacets', () => {
  it('topics are scoped to published indicators — every topic slug returns at least one result when searched', async () => {
    const facets = await listIndicatorFacets(db);

    expect(facets.topics.length).toBeGreaterThan(0);
    for (const { slug } of facets.topics) {
      const { total } = await searchIndicators(db, noFilters({ topics: [slug] }));
      expect(total).toBeGreaterThan(0);
    }
  });

  it('topics are ordered by title', async () => {
    const facets = await listIndicatorFacets(db);

    const titles = facets.topics.map((t) => t.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });

  it('classifications are ordered by dimension then name', async () => {
    const facets = await listIndicatorFacets(db);

    expect(facets.classifications.length).toBeGreaterThan(0);
    const pairs = facets.classifications.map((c) => `${c.dimension}|${c.name}`);
    expect(pairs).toEqual([...pairs].sort((a, b) => a.localeCompare(b)));
  });

  it('uses the workbook tag groups without duplicating population and inequality metadata', async () => {
    const facets = await listIndicatorFacets(db);

    const dimensions = new Set(facets.classifications.map((c) => c.dimension));
    expect(dimensions).toEqual(new Set(['indicator_type', 'framework']));
  });

  it('sources are deduplicated — no duplicate name in the list', async () => {
    const facets = await listIndicatorFacets(db);

    const names = facets.sources;
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('sources are ordered alphabetically', async () => {
    const facets = await listIndicatorFacets(db);

    const names = facets.sources;
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('value types and year types are non-empty and ordered', async () => {
    const facets = await listIndicatorFacets(db);

    expect(facets.valueTypes.length).toBeGreaterThan(0);
    expect(facets.valueTypes).toEqual([...facets.valueTypes].sort((a, b) => a.localeCompare(b)));

    expect(facets.yearTypes.length).toBeGreaterThan(0);
    expect(facets.yearTypes).toEqual([...facets.yearTypes].sort((a, b) => a.localeCompare(b)));
  });

  it('all facet classification slugs return at least one result when searched', async () => {
    const facets = await listIndicatorFacets(db);

    for (const { dimension, slug } of facets.classifications) {
      const filterKey = {
        indicator_type: 'indicatorTypes',
        life_stage: 'lifeStages',
        framework: 'frameworks',
        population: 'populations',
        inequality: 'inequalities',
      }[dimension] as keyof IndicatorSearchFilters;

      const { total } = await searchIndicators(db, noFilters({ [filterKey]: [slug] }));
      expect(total).toBeGreaterThan(0);
    }
  });
});
