import {
  observationPeriodType,
  observationSegmentKey,
  periodTypeLength,
} from '@fphd/utils/observation-series';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { dimensionKeyOrder } from './headline-order.ts';
import { observationPeriodSql, periodLengthSql } from './observation-series-sql.ts';
import { dimensionType, dimensionValue } from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

let database: TestDb;
beforeAll(async () => {
  database = await createTestDb();
});
afterAll(async () => {
  await database.drop();
});

it('matches the JavaScript key including the input order of values with the same type', async () => {
  const db = database.db;
  const types = await db
    .insert(dimensionType)
    .values([
      { name: 'Z type', dimensionClass: 'core' },
      { name: 'A type', dimensionClass: 'core' },
    ])
    .returning();
  const first = types[0];
  const second = types[1];
  if (!first || !second) throw new Error('Expected dimension types');
  const values = await db
    .insert(dimensionValue)
    .values([
      { dimensionTypeId: first.id, name: 'Z value' },
      { dimensionTypeId: second.id, name: 'A value' },
      { dimensionTypeId: second.id, name: 'Z value' },
    ])
    .returning();
  for (const ordered of [values, [...values].reverse()]) {
    const order = dimensionKeyOrder(sql`${ordered.map(({ id }) => id).join(',')}`, {
      dimensionValue,
      dimensionType,
    });
    const [row] = await db
      .select({ key: sql<string>`${order}` })
      .from(sql`(values (1)) fixture(id)`);
    expect(row?.key).toBe(
      observationSegmentKey({
        fromDate: '2024-01-01',
        toDate: '2024-12-31',
        dimensions: ordered.map((value) => ({
          type: types.find(({ id }) => id === value.dimensionTypeId)?.name ?? '',
          value: value.name,
        })),
      }),
    );
  }
});

it('matches cumulative period identities and lengths in JavaScript at every quarterly endpoint', async () => {
  for (let quarter = 1; quarter <= 17; quarter++) {
    const point = {
      fromDate: '2022-04-01',
      toDate: new Date(Date.UTC(2022, 3 + quarter * 3, 0)).toISOString().slice(0, 10),
      periodType: 'cumulative-quarter-2022-04-01' as const,
    };
    const type = observationPeriodSql(
      sql`${point.fromDate}::date`,
      sql`${point.toDate}::date`,
      sql`${point.periodType}::text`,
    );
    const [row] = await database.db
      .select({ type, length: periodLengthSql(type) })
      .from(sql`(values (1)) fixture(id)`);
    expect(row?.type).toBe(observationPeriodType(point));
    expect(Number(row?.length)).toBe(periodTypeLength(point.periodType));
  }
});
