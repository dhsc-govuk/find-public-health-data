import type postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';

import type { Database } from './client.ts';
import { type IndicatorSearchFilters, searchIndicators } from './indicator-repository.ts';
import { publishedViews } from './schema/index.ts';
import { apiLogin, createTestDb, type TestDb } from './testing.ts';

// Emergency admissions for gastroenteritis: given England series for each sex and none for all
// persons, with the female series a year behind the male one.
const SEXED_ONLY = 94194;
// Air pollution: given no England series at all.
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
        AND o.upload_batch_id = s.upload_batch_id AND o.from_date = '2021-04-01'
      LIMIT 1
    )
    FROM indicator i, area a
    WHERE s.indicator_id = i.id AND i.short_id = ${SEXED_ONLY}
      AND s.area_id = a.id AND a.code = 'E92000001' AND s.sex = 'Female'
  `;
  await owner`
    DELETE FROM observation_series s
    USING indicator i, area a
    WHERE s.indicator_id = i.id AND i.short_id = ${NO_ENGLAND}
      AND s.area_id = a.id AND a.code = 'E92000001'
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
