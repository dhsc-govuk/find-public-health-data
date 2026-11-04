import { tableAreaSeries } from '@fphd/utils/observation-series';
import { afterAll, beforeAll, expect, it } from 'vitest';

import type { Database } from './client.ts';
import { getIndicatorObservationsByIds } from './indicator-observation-repository.ts';
import { publishedIndicator } from './schema/index.ts';
import { apiLogin, createTestDb, type TestDb } from './testing.ts';

let database: TestDb;
let db: Database;
let ids: string[];

beforeAll(async () => {
  database = await createTestDb({ template: 'seeded' });
  db = database.connectDb({ login: apiLogin('public_api') });
  ids = (await db.select({ id: publishedIndicator.id }).from(publishedIndicator)).map(
    ({ id }) => id,
  );
});

afterAll(async () => {
  await database.drop();
});

it.each([[['E92000001']], [['E06000052', 'E92000001', 'E07000223', 'UNKNOWN']]])(
  'keeps every table series and its England benchmarks for %j',
  async (areas) => {
    const full = await getIndicatorObservationsByIds(db, ids, areas);
    const candidates = await getIndicatorObservationsByIds(db, ids, areas, true);
    expect(ids.length).toBeGreaterThan(1);
    let fullCount = 0;
    let candidateCount = 0;
    for (const id of ids) {
      const histories = full.get(id) ?? [];
      const pruned = candidates.get(id) ?? [];
      expect(tableAreaSeries(pruned)).toEqual(tableAreaSeries(histories));
      fullCount += histories.reduce((sum, area) => sum + area.observations.length, 0);
      candidateCount += pruned.reduce((sum, area) => sum + area.observations.length, 0);
    }
    expect(candidateCount).toBeLessThan(fullCount);
  },
);
