import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from './client.ts';
import {
  type IndicatorSearchFilters,
  listPublishedIndicators,
  resolvePublishedIndicatorId,
  searchIndicators,
  searchPublishedIndicators,
} from './indicator-repository.ts';
import { publishedViews } from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

// Reception and Year 6 prevalence of obesity share their topics, so with one name they tie on
// every key the orders use before the short id.
const RECEPTION_OBESITY = 92026;
const YEAR_6_OBESITY = 92033;
const SHARED_NAME = 'Prevalence of obesity';

let testDb: TestDb;
let db: Database;

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

beforeAll(async () => {
  testDb = await createTestDb({ template: 'seeded' });
  db = testDb.db;
  const ids = await Promise.all(
    [RECEPTION_OBESITY, YEAR_6_OBESITY].map((shortId) =>
      resolvePublishedIndicatorId(db, publishedViews, shortId),
    ),
  );
  await db.execute(
    sql`UPDATE indicator_version SET name = ${SHARED_NAME}
        WHERE status = 'published' AND indicator_id IN (${ids[0]}, ${ids[1]})`,
  );
});

afterAll(async () => {
  await testDb.drop();
});

describe('indicators that share a name', () => {
  it.each([
    ['the default order', ''],
    ['relevance order', 'obesity'],
  ])('page one per page in %s, each exactly once and by short id', async (_order, query) => {
    const { total } = await searchIndicators(db, publishedViews, noFilters({ query }));
    const pages = await Promise.all(
      Array.from({ length: total }, (_, index) =>
        searchIndicators(db, publishedViews, noFilters({ query, page: index + 1, limit: 1 })),
      ),
    );
    const shortIds = pages.flatMap(({ indicators }) => indicators.map((i) => i.shortId));

    expect(shortIds).toHaveLength(total);
    expect(new Set(shortIds).size).toBe(total);
    expect(shortIds.filter((id) => id === RECEPTION_OBESITY || id === YEAR_6_OBESITY)).toEqual([
      RECEPTION_OBESITY,
      YEAR_6_OBESITY,
    ]);
  });

  it('are listed by short id among the published indicators', async () => {
    const shortIds = (await listPublishedIndicators(db, publishedViews)).map((i) => i.shortId);

    expect(shortIds.filter((id) => id === RECEPTION_OBESITY || id === YEAR_6_OBESITY)).toEqual([
      RECEPTION_OBESITY,
      YEAR_6_OBESITY,
    ]);
  });

  it('are found by short id, so a limit of one always keeps the same one', async () => {
    const found = await searchPublishedIndicators(db, publishedViews, SHARED_NAME, 20);
    const [first] = await searchPublishedIndicators(db, publishedViews, SHARED_NAME, 1);

    expect(found.map((i) => i.shortId)).toEqual([RECEPTION_OBESITY, YEAR_6_OBESITY]);
    expect(first?.shortId).toBe(RECEPTION_OBESITY);
  });
});
