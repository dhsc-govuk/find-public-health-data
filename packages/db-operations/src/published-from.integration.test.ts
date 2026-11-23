import { createRepositories, type IndicatorSearchFilters, type Repositories } from '@fphd/db';
import { apiLogin, createTestDb, type TestDb } from '@fphd/db/testing';
import { refreshIndicatorReadModels } from '@fphd/internal-read-models';
import { afterAll, beforeAll, expect, it } from 'vitest';

let database: TestDb;
let repositories: Repositories;
let indicatorId: string;
let hiddenId: string;

const filters: IndicatorSearchFilters = {
  query: '108',
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
  limit: 10,
};

beforeAll(async () => {
  database = await createTestDb({ template: 'seeded' });
  repositories = createRepositories(database.connectDb({ login: apiLogin('public_api') }));
  const sql = database.sql;
  const [indicator] = await sql<{ id: string; batch: string }[]>`
    SELECT i.id, v.upload_batch_id AS batch FROM indicator i
    JOIN current_published_version c ON c.indicator_id = i.id
    JOIN indicator_version v ON v.id = c.id WHERE i.short_id = 108
  `;
  if (!indicator) throw new Error('Expected indicator 108');
  indicatorId = indicator.id;
  await sql`UPDATE indicator_version SET published_from = '2021-01-01' WHERE id = (SELECT id FROM current_published_version WHERE indicator_id = ${indicatorId})`;
  await sql`DELETE FROM observation WHERE indicator_id = ${indicatorId}`;
  for (const year of [2020, 2021, 2022, 2023, 2024, 2025]) {
    await sql`
      INSERT INTO observation
        (indicator_id, upload_batch_id, area_id, from_date, to_date, value,
         dimension_key)
      SELECT ${indicatorId}, ${indicator.batch}, a.id, ${`${year}-01-01`}::date,
        ${`${year}-12-31`}::date, ${year}, ''
      FROM area a WHERE a.code = 'E92000001'
    `;
  }
  const [hidden] = await sql<{ id: string }[]>`
    INSERT INTO observation
      (indicator_id, upload_batch_id, area_id, from_date, to_date, value,
       dimension_key)
    SELECT ${indicatorId}, ${indicator.batch}, a.id, '2014-01-01', '2014-12-31', 999,
      dv.id::text
    FROM area a JOIN area_type at ON at.id = a.area_type_id
    CROSS JOIN dimension_value dv JOIN dimension_type dt ON dt.id = dv.dimension_type_id
    WHERE at.display_group = 'Local authorities' AND dt.name = 'Sex' AND dv.name = 'Male'
    LIMIT 1 RETURNING id
  `;
  if (!hidden) throw new Error('Expected hidden observation');
  hiddenId = hidden.id;
  await sql`
    INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id)
    SELECT ${hiddenId}, id, dimension_type_id FROM dimension_value
    WHERE id = (SELECT dimension_key::uuid FROM observation WHERE id = ${hiddenId})
  `;
  await sql`
    INSERT INTO observation_note (observation_id, note_type_id)
    SELECT ${hiddenId}, id FROM note_type LIMIT 1
  `;
  await database.db.transaction((tx) => refreshIndicatorReadModels(tx, indicatorId));
});

afterAll(async () => {
  await database?.drop();
});

it('keeps hidden observations and their bridges in storage but excludes them from public views', async () => {
  const sql = database.sql;
  expect(
    await sql`SELECT count(*)::int AS n FROM observation WHERE indicator_id = ${indicatorId}`,
  ).toEqual([{ n: 7 }]);
  expect(
    await sql`SELECT count(*)::int AS n FROM published.observation WHERE indicator_id = ${indicatorId}`,
  ).toEqual([{ n: 5 }]);
  expect(
    await sql`SELECT * FROM published.observation_dimension WHERE observation_id = ${hiddenId}`,
  ).toEqual([]);
  expect(
    await sql`SELECT * FROM published.observation_note WHERE observation_id = ${hiddenId}`,
  ).toEqual([]);
});

it('serves only visible periods to observation, comparison and download callers', async () => {
  const data = await repositories.indicators.findObservations(indicatorId, 'E92000001');
  expect(data?.observations.map((o) => o.fromDate)).toEqual([
    '2021-01-01',
    '2022-01-01',
    '2023-01-01',
    '2024-01-01',
    '2025-01-01',
  ]);
  const areas = await repositories.indicators.findObservationsForAreas(indicatorId, ['E92000001']);
  expect(areas).toEqual([data]);
});

it.each(['recent', 'latest', 'sparkline'] as const)(
  'serves only visible %s cached table points',
  async (mode) => {
    const tables = await repositories.indicators.findTableData([108], ['E92000001'], mode);
    expect(tables).toHaveLength(1);
    const points = tables.flatMap((t) => t.areaData.flatMap((a) => a.observations));
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((o) => o.fromDate >= '2021-01-01')).toBe(true);
  },
);

it('rebuilds ranges, latest periods, rankings, area availability and topic trend values from visible rows', async () => {
  const sql = database.sql;
  const rankings = await repositories.indicators.findRankingData(indicatorId, ['E92000001']);
  expect(rankings[0]?.observations.map((o) => o.fromDate)).toEqual(['2025-01-01']);
  const result = await repositories.indicators.searchWithFilters(filters);
  expect(result.indicators[0]?.latestPeriod).toEqual({
    fromDate: '2025-01-01',
    toDate: '2025-12-31',
  });
  expect(
    await sql`SELECT area_count FROM available_data WHERE indicator_id = ${indicatorId}`,
  ).toEqual([{ area_count: 1 }]);
  expect(
    await sql`SELECT * FROM observation_range WHERE indicator_id = ${indicatorId}
    AND from_date < '2021-01-01'`,
  ).toEqual([]);
  expect(
    await sql`SELECT trend_values FROM published.observation_series_batch WHERE indicator_id = ${indicatorId}`,
  ).toEqual([{ trend_values: [2025, 2024, 2023, 2022, 2021] }]);
});

it.each([2014, 2020])(
  'does not match a hidden year in the public search filters (%i)',
  async (year) => {
    const result = await repositories.indicators.searchWithFilters({
      ...filters,
      dataFromYear: year,
      dataToYear: year,
    });
    expect(result.total).toBe(0);
  },
);

it.each([2021, 2024, 2025])(
  'matches a visible year in the public search filters (%i)',
  async (year) => {
    const result = await repositories.indicators.searchWithFilters({
      ...filters,
      dataFromYear: year,
      dataToYear: year,
    });
    expect(result.indicators.map((i) => i.shortId)).toEqual([108]);
  },
);

it('keeps a draft cutoff from changing the published batch visibility', async () => {
  const sql = database.sql;
  await sql`
    INSERT INTO indicator_version
      (indicator_id, name, slug, created_by, updated_by, published_from, upload_batch_id)
    SELECT indicator_id, name, slug, created_by, updated_by, '2030-01-01', upload_batch_id
    FROM indicator_version WHERE id = (SELECT id FROM current_published_version WHERE indicator_id = ${indicatorId})
  `;
  await database.db.transaction((tx) => refreshIndicatorReadModels(tx, indicatorId));
  expect(
    await sql`SELECT count(*)::int AS n FROM published.observation WHERE indicator_id = ${indicatorId}`,
  ).toEqual([{ n: 5 }]);
  expect(
    await sql`SELECT trend_values FROM published.observation_series_batch WHERE indicator_id = ${indicatorId}`,
  ).toEqual([{ trend_values: [2025, 2024, 2023, 2022, 2021] }]);
});

it('shows all retained rows and rebuilds their ranges and trends when the start date is null', async () => {
  const sql = database.sql;
  await sql`UPDATE indicator_version SET published_from = NULL WHERE indicator_id = ${indicatorId}`;
  await database.db.transaction((tx) => refreshIndicatorReadModels(tx, indicatorId));
  expect(
    await sql`SELECT count(*)::int AS n FROM published.observation WHERE indicator_id = ${indicatorId}`,
  ).toEqual([{ n: 7 }]);
  expect(
    await sql`SELECT observation_id FROM published.observation_dimension WHERE observation_id = ${hiddenId}`,
  ).toEqual([{ observation_id: hiddenId }]);
  expect(
    await sql`SELECT observation_id FROM published.observation_note WHERE observation_id = ${hiddenId}`,
  ).toEqual([{ observation_id: hiddenId }]);
  const data = await repositories.indicators.findObservations(indicatorId, 'E92000001');
  expect(data?.observations.map((o) => o.fromDate)).toContain('2020-01-01');
  expect(
    await sql`SELECT area_count FROM available_data WHERE indicator_id = ${indicatorId} ORDER BY area_count`,
  ).toEqual([{ area_count: 1 }, { area_count: 1 }]);
  expect(
    await sql`SELECT count(*)::int AS n FROM observation_range WHERE indicator_id = ${indicatorId} AND from_date = '2014-01-01'`,
  ).toEqual([{ n: 1 }]);
  const result = await repositories.indicators.searchWithFilters({
    ...filters,
    dataFromYear: 2020,
    dataToYear: 2020,
  });
  expect(result.indicators.map((i) => i.shortId)).toEqual([108]);
});

it('filters NHS Health Check cohorts by their start date and retains within-year rows at the cutoff', async () => {
  const sql = database.sql;
  await sql`DELETE FROM observation WHERE indicator_id = ${indicatorId}`;
  await sql`UPDATE indicator_version SET published_from = '2022-04-01' WHERE indicator_id = ${indicatorId}`;
  const [batch] = await sql<
    { id: string }[]
  >`SELECT v.upload_batch_id AS id FROM current_published_version c JOIN indicator_version v ON v.id = c.id WHERE c.indicator_id = ${indicatorId}`;
  for (const [from, to, value] of [
    ['2015-04-01', '2016-03-31', 1],
    ['2021-04-01', '2022-03-31', 2],
    ['2021-04-01', '2026-06-30', 3],
    ['2022-04-01', '2022-06-30', 3.76467489982254],
    ['2022-04-01', '2023-03-31', 18.307717475901],
    ['2022-04-01', '2026-06-30', 94.6615995700261],
  ] as const) {
    await sql`
      INSERT INTO observation (indicator_id, upload_batch_id, area_id, from_date, to_date, value, dimension_key)
      SELECT ${indicatorId}, ${batch?.id ?? null}, id, ${from}::date, ${to}::date, ${value}, '' FROM area WHERE code = 'E92000001'
    `;
  }
  await database.db.transaction((tx) => refreshIndicatorReadModels(tx, indicatorId));
  const data = await repositories.indicators.findObservations(indicatorId, 'E92000001');
  expect(data?.observations.map((o) => [o.fromDate, o.toDate, o.value])).toEqual([
    ['2022-04-01', '2022-06-30', 3.76467489982254],
    ['2022-04-01', '2023-03-31', 18.307717475901],
    ['2022-04-01', '2026-06-30', 94.6615995700261],
  ]);
  expect(
    await sql`SELECT count(*)::int AS n FROM observation WHERE indicator_id = ${indicatorId}`,
  ).toEqual([{ n: 6 }]);
});
