import {
  observationSegmentKey,
  rankingAreaSeries,
  tableAreaSeries,
  tableSummary,
} from '@fphd/utils/observation-series';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from './client.ts';
import {
  getIndicatorObservationData,
  type IndicatorAreaData,
} from './indicator-observation-repository.ts';
import { getIndicatorSeriesData } from './indicator-series-repository.ts';
import { getIndicatorTableData } from './indicator-table-repository.ts';
import { indicatorTrendDirections } from './indicator-trends.ts';
import {
  area,
  indicatorVersion,
  observation,
  publishedIndicator,
  uploadBatch,
} from './schema/index.ts';
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

it.each(['latest', 'recent', 'ranking'] as const)(
  'uses canonical reads if publication changes while fetching cached %s points',
  async (mode) => {
    const id = ids[1 + ['latest', 'recent', 'ranking'].indexOf(mode)];
    if (!id) throw new Error('Expected a seeded indicator');
    let switched = false;
    const changing = new Proxy(db, {
      get(target, property, receiver) {
        if (property !== 'execute') return Reflect.get(target, property, receiver);
        return async (...args: Parameters<Database['execute']>) => {
          if (!switched) {
            switched = true;
            await publishNextBatch(id);
          }
          return target.execute(...args);
        };
      },
    });
    expect(await getIndicatorSeriesData(changing, [id], ['E92000001'], mode)).toBeUndefined();
    expect(switched).toBe(true);
    const [identity] = await database.sql<{ shortId: number }[]>`
      select short_id as "shortId" from indicator where id = ${id}`;
    const [loaded] = await getIndicatorTableData(
      db,
      [identity?.shortId ?? 0],
      ['E92000001'],
      'latest',
    );
    expect(loaded?.areaData[0]?.observations).toMatchObject([
      { value: 123, fromDate: '2099-01-01' },
    ]);
  },
);

it('keeps selected values and older England benchmarks in one publication snapshot', async () => {
  const [candidate] = await database.sql<{ id: string; code: string }[]>`
    select l.indicator_id as id, a.code
    from published.observation_series l join area a on a.id = l.area_id
    join observation p on p.id = l.latest_observation_id
    join area england on england.code = 'E92000001'
    join published.observation b on b.indicator_id = l.indicator_id and b.area_id = england.id
      and b.dimension_key = l.dimension_key and b.from_date = p.from_date and b.to_date = p.to_date
    where a.code <> 'E92000001' and l.indicator_id <> ${ids[0] ?? ''}::uuid
      and not exists (select 1 from published.observation_series e
        where e.indicator_id = l.indicator_id and e.area_id = england.id
          and e.latest_observation_id = b.id)
    limit 1
  `;
  if (!candidate) throw new Error('Expected a local period preceding the England headline');
  const codes = [candidate.code, 'E92000001'];
  const expected = await getIndicatorSeriesData(db, [candidate.id], codes, 'latest');
  expect(expected).toBeDefined();
  let switched = false;
  const changing = new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'execute') return Reflect.get(target, property, receiver);
      return async (...args: Parameters<Database['execute']>) => {
        const rows = await target.execute(...args);
        if (!switched) {
          switched = true;
          await publishNextBatch(candidate.id);
        }
        return rows;
      };
    },
  });
  expect(await getIndicatorSeriesData(changing, [candidate.id], codes, 'latest')).toEqual(expected);
  expect(switched).toBe(true);
});

it('uses canonical history when one code identifies multiple historical areas', async () => {
  const id = ids[4];
  if (!id) throw new Error('Expected a seeded indicator');
  const [original] = await database.db.select().from(area).where(eq(area.code, 'E06000052'));
  if (!original) throw new Error('Expected a local area');
  await database.db
    .update(area)
    .set({ validFrom: '1900-01-01', validTo: '2000-12-31', isCurrent: false })
    .where(eq(area.id, original.id));
  await database.db.insert(area).values({
    ...original,
    id: undefined,
    validFrom: '2001-01-01',
    validTo: null,
    isCurrent: true,
    name: 'Current Cornwall',
  });
  expect(await getIndicatorSeriesData(db, [id], [original.code], 'latest')).toBeUndefined();
  const [identity] = await database.sql<{ shortId: number }[]>`
    select short_id as "shortId" from indicator where id = ${id}`;
  const expected = await getIndicatorObservationData(db, [id], [original.code], 'summary');
  const [actual] = await getIndicatorTableData(
    db,
    [identity?.shortId ?? 0],
    [original.code],
    'latest',
  );
  expect(actual?.areaData).toEqual(expected.get(id)?.areaData);
});

async function publishNextBatch(id: string) {
  const [previous] = await database.db
    .select()
    .from(indicatorVersion)
    .where(eq(indicatorVersion.indicatorId, id))
    .limit(1);
  const [england] = await database.db.select().from(area).where(eq(area.code, 'E92000001'));
  if (!previous || !england) throw new Error('Expected published fixtures');
  const [version] = await database.db
    .insert(indicatorVersion)
    .values({
      ...previous,
      id: undefined,
      uploadBatchId: null,
      dataTableConfirmedAt: null,
      publishedAt: new Date('2099-01-01T00:00:00Z'),
    })
    .returning();
  if (!version) throw new Error('Expected a new publication');
  const [batch] = await database.db
    .insert(uploadBatch)
    .values({
      indicatorId: id,
      indicatorVersionId: version.id,
      originalFilename: 'new-publication.csv',
      uploadedBy: previous.createdBy,
    })
    .returning();
  if (!batch) throw new Error('Expected a new batch');
  await database.db
    .update(indicatorVersion)
    .set({ uploadBatchId: batch.id })
    .where(eq(indicatorVersion.id, version.id));
  await database.db.insert(observation).values({
    indicatorId: id,
    areaId: england.id,
    uploadBatchId: batch.id,
    dimensionKey: '',
    fromDate: '2099-01-01',
    toDate: '2099-12-31',
    value: 123,
  });
}
