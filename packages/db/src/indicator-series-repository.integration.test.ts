import {
  observationSegmentKey,
  rankingAreaSeries,
  tableAreaSeries,
  tableSummary,
} from '@fphd/utils/observation-series';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from './client.ts';
import {
  getIndicatorObservationData,
  type IndicatorAreaData,
} from './indicator-observation-repository.ts';
import { getIndicatorSeriesData } from './indicator-series-repository.ts';
import { getIndicatorTableData } from './indicator-table-repository.ts';
import { indicatorTrendDirections } from './indicator-trends.ts';
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

it.each([[['E92000001']], [['E06000052', 'E92000001', 'E07000223', 'UNKNOWN']], [['UNKNOWN']]])(
  'matches history-based table cells, trends and rankings for %j',
  async (areas) => {
    const full = await getIndicatorObservationData(db, ids, areas);
    for (const mode of ['recent', 'latest', 'ranking'] as const) {
      const cached = await getIndicatorSeriesData(db, ids, areas, mode);
      expect(cached).toBeDefined();
      for (const id of ids) {
        const history = full.get(id)?.areaData ?? [];
        const expected =
          mode === 'ranking'
            ? { areaData: rankingAreaSeries(history) }
            : tableSummary(tableAreaSeries(history), mode);
        const actual = cached?.get(id);
        const normaliseAreas = (areas: IndicatorAreaData[]) =>
          areas.map((area) => ({
            ...area,
            observations: [...area.observations].sort(
              (a, b) =>
                a.fromDate.localeCompare(b.fromDate) ||
                a.toDate.localeCompare(b.toDate) ||
                observationSegmentKey(a).localeCompare(observationSegmentKey(b)),
            ),
          }));
        expect(normaliseAreas(actual?.areaData ?? []), `${id} ${mode}`).toEqual(
          normaliseAreas(expected.areaData),
        );
        if ('tableSeries' in expected) {
          // Empty sex/period choices carry no cells and are omitted from the read model.
          const normalise = (choices: typeof expected.tableSeries) =>
            choices
              .filter(({ segments }) => Object.keys(segments).length)
              .sort((a, b) => `${a.sex}|${a.periodType}`.localeCompare(`${b.sex}|${b.periodType}`));
          expect(normalise(actual?.tableSeries ?? []), `${id} ${mode}`).toEqual(
            normalise(expected.tableSeries),
          );
        }
      }
    }
  },
);

it('uses canonical data when the published batch has no completed read model', async () => {
  const id = ids[0];
  if (!id) throw new Error('Expected seed data');
  const areas = ['E92000001'];
  await database.sql`delete from observation_series_batch where indicator_id = ${id}`;
  expect(await getIndicatorSeriesData(db, [id], areas, 'latest')).toBeUndefined();
  const [identity] = await database.sql<
    { shortId: number }[]
  >`select short_id as "shortId" from indicator where id = ${id}`;
  const full = await getIndicatorObservationData(db, [id], areas, 'summary');
  const [result] = await getIndicatorTableData(db, [identity?.shortId ?? 0], areas, 'latest');
  expect(result?.areaData).toEqual(full.get(id)?.areaData);
});

it('matches canonical topic trends when published-batch trend inputs are available', async () => {
  const cached = await indicatorTrendDirections(db, ids);
  await database.sql`update observation_series_batch set trend_values = null`;
  expect(await indicatorTrendDirections(db, ids)).toEqual(cached);
});
