import type postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';

import type { Database } from './client.ts';
import { type IndicatorSearchFilters, searchIndicators } from './indicator-repository.ts';
import { publishedViews } from './schema/index.ts';
import { apiLogin, createTestDb, type TestDb } from './testing.ts';

// Emergency admissions for gastroenteritis: given England series for each sex and none for all
// persons, with the female series a year behind the male one.
const SEXED_ONLY = 94194;
// Air pollution: seeded with no England values, so it has no England series.
const NO_ENGLAND = 93861;

let testDb: TestDb;
let owner: postgres.Sql;
let db: Database;

function query(shortId: number): IndicatorSearchFilters {
  return {
    query: String(shortId),
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
}

async function latestPeriod(shortId: number) {
  const { indicators } = await searchIndicators(db, publishedViews, query(shortId));
  expect(indicators).toHaveLength(1);
  return indicators[0]?.latestPeriod;
}

beforeAll(async () => {
  testDb = await createTestDb({ template: 'seeded' });
  owner = testDb.sql;
  db = testDb.connectDb({ login: apiLogin('public_api') });

  await owner`
    INSERT INTO observation_series (upload_batch_id, indicator_id, area_id, dimension_key,
      sex, period_type, variants, latest_observation_id, ranking_observation_id,
      recent_observation_ids, sparkline_observation_ids, recent_values)
    SELECT s.upload_batch_id, s.indicator_id, s.area_id, point.dimension_key,
      sex.name, 'all', s.variants, point.id, point.id, ARRAY[point.id], ARRAY[point.id],
      CASE WHEN point.value IS NULL THEN '{}'::double precision[] ELSE ARRAY[point.value] END
    FROM observation_series s
    JOIN indicator i ON i.id = s.indicator_id AND i.short_id = ${SEXED_ONLY}
    JOIN area a ON a.id = s.area_id AND a.code = 'E92000001'
    CROSS JOIN (VALUES ('Female'), ('Male')) sex(name)
    JOIN LATERAL (
      SELECT o.id, o.dimension_key, o.value FROM observation o
      JOIN dimension_value dv ON dv.id = ANY(string_to_array(o.dimension_key, ',')::uuid[])
      JOIN dimension_type dt ON dt.id = dv.dimension_type_id AND dt.name = 'Sex'
      WHERE o.indicator_id = s.indicator_id AND o.area_id = s.area_id
        AND o.upload_batch_id = s.upload_batch_id AND dv.name = sex.name
      ORDER BY o.from_date DESC, o.to_date DESC LIMIT 1
    ) point ON true
    WHERE s.sex = '' AND s.period_type = 'all'
  `;
  await owner`
    DELETE FROM observation_series s
    USING indicator i, area a
    WHERE s.indicator_id = i.id AND i.short_id = ${SEXED_ONLY}
      AND s.area_id = a.id AND a.code = 'E92000001' AND s.sex = ''
  `;
  await owner`
    UPDATE observation_series s
    SET variants = '[{"sex": "Female", "periodType": "all"}, {"sex": "Male", "periodType": "all"}]'
    FROM indicator i, area a
    WHERE s.indicator_id = i.id AND i.short_id = ${SEXED_ONLY}
      AND s.area_id = a.id AND a.code = 'E92000001'
  `;
  await owner`
    UPDATE observation_series s
    SET latest_observation_id = (
      SELECT o.id FROM observation o
      WHERE o.indicator_id = s.indicator_id AND o.area_id = s.area_id
        AND o.upload_batch_id = s.upload_batch_id AND o.dimension_key = s.dimension_key
        AND o.from_date = '2021-04-01' AND o.to_date = '2022-03-31'
      LIMIT 1
    )
    FROM indicator i, area a
    WHERE s.indicator_id = i.id AND i.short_id = ${SEXED_ONLY}
      AND s.area_id = a.id AND a.code = 'E92000001' AND s.sex = 'Female'
  `;
});

afterAll(async () => {
  await testDb.drop();
});

it("takes the first sex's England period when an indicator has no series for all persons", async () => {
  expect(await latestPeriod(SEXED_ONLY)).toEqual({
    fromDate: '2021-04-01',
    toDate: '2022-03-31',
  });
});

it('has no period for an indicator with no England series', async () => {
  expect(await latestPeriod(NO_ENGLAND)).toBeNull();
});
