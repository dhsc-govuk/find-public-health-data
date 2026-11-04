import { rankingAreaSeries, tableAreaSeries, tableSummary } from '@fphd/utils/observation-series';
import { afterAll, beforeAll, expect, it } from 'vitest';

import type { Database } from './client.ts';
import { dimensionKey } from './dimension-key.ts';
import { getIndicatorObservationData } from './indicator-observation-repository.ts';
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
    const full = await getIndicatorObservationData(db, ids, areas);
    const candidates = await getIndicatorObservationData(db, ids, areas, 'table');
    const rankings = await getIndicatorObservationData(db, ids, areas, 'ranking');
    const summaries = await getIndicatorObservationData(db, ids, areas, 'summary');
    expect(ids.length).toBeGreaterThan(1);
    let fullCount = 0;
    let candidateCount = 0;
    for (const id of ids) {
      const histories = full.get(id)?.areaData ?? [];
      const pruned = candidates.get(id)?.areaData ?? [];
      expect(candidates.get(id)).toEqual(tableSummary(tableAreaSeries(histories)));
      expect(summaries.get(id)).toEqual(tableSummary(tableAreaSeries(histories), 'latest'));
      expect(rankings.get(id)?.areaData).toEqual(rankingAreaSeries(histories));
      fullCount += histories.reduce((sum, area) => sum + area.observations.length, 0);
      candidateCount += pruned.reduce((sum, area) => sum + area.observations.length, 0);
    }
    expect(candidateCount).toBeLessThan(fullCount);
  },
);

it('keeps different area headlines when the first area selects an aggregate comparison row', async () => {
  const sql = database.sql;
  const [indicator] = await sql<{ id: string; batch: string }[]>`
    select i.id, v.upload_batch_id as batch from indicator i
    join current_published_version cpv on cpv.indicator_id = i.id
    join indicator_version v on v.id = cpv.id where i.short_id = 108
  `;
  if (!indicator) throw new Error('Expected a published indicator');
  const sexes = await sql<{ id: string; name: string }[]>`
    select v.id, v.name from dimension_value v join dimension_type t on t.id = v.dimension_type_id
    where t.name = 'Sex' and v.name in ('Male', 'Female')
  `;
  const aggregate = await sql<{ id: string }[]>`
    select distinct on (t.id) v.id from dimension_value v
    join dimension_type t on t.id = v.dimension_type_id where t.name <> 'Sex'
    order by t.id, v.id limit 2
  `;
  const male = sexes.find(({ name }) => name === 'Male');
  const female = sexes.find(({ name }) => name === 'Female');
  if (!male || !female || aggregate.length !== 2) throw new Error('Expected dimension fixtures');
  await sql`delete from observation where indicator_id = ${indicator.id}`;
  for (const [code, dimensions, years, value] of [
    ['E92000001', aggregate.map(({ id }) => id), [2094], 3],
    ['E06000052', [male.id], [2090, 2091, 2092, 2093, 2094], 1],
    ['E07000223', [female.id], [2090, 2091, 2092, 2093, 2094], 2],
  ] as [string, string[], number[], number][]) {
    for (const year of years) {
      const [point] = await sql<{ id: string }[]>`
        insert into observation (indicator_id, area_id, upload_batch_id, dimension_key, from_date, to_date, value)
        select ${indicator.id}, a.id, ${indicator.batch}, ${dimensionKey(dimensions)},
          ${`${year}-01-01`}, ${`${year}-12-31`}, ${value} from area a where a.code = ${code}
        returning id
      `;
      if (!point) throw new Error('Expected an observation');
      await sql`
        insert into observation_dimension (observation_id, dimension_type_id, dimension_value_id)
        select ${point.id}, v.dimension_type_id, v.id from dimension_value v
        where v.id = any(${dimensions}::uuid[])
      `;
    }
  }
  for (const areas of [
    ['E92000001', 'E06000052', 'E07000223'],
    ['E06000052', 'E92000001', 'E07000223'],
  ]) {
    const full = await getIndicatorObservationData(db, [indicator.id], areas);
    const ranking = await getIndicatorObservationData(db, [indicator.id], areas, 'ranking');
    expect(ranking.get(indicator.id)?.areaData).toEqual(
      rankingAreaSeries(full.get(indicator.id)?.areaData ?? []),
    );
  }
});
