import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const MIGRATION = '0036_period-and-year-type-values';

// The rows migration 0034 inserted; each year type is listed with the value it becomes.
const YEARS_ID = '01a0d88c-310a-7c54-b512-a99ca789cc12';
const QUARTERS_ID = '01a0d88c-310a-7c9d-b589-353d97eedb54';
const MONTHS_ID = '01a0d88c-310a-7ca1-9ba4-031b00f46799';
const FINANCIAL_ID = '01a0d88c-310a-7ca8-9a3b-40fc6f585b8a';
const SPECIFIED_END_DATE_ID = '01a0d88c-310a-7cb1-af6e-3712b2958e12';
const YEAR_TYPES: [string, string][] = [
  ['01a0d88c-310a-7ca5-8494-19e32c307628', 'calendar'],
  ['01a0d88c-310a-7ca8-9a3b-40fc6f585b8a', 'financial'],
  ['01a0d88c-310a-7cab-8847-543e49e4c685', 'academic'],
  ['01a0d88c-310a-7cae-ae91-2c6e6e6b707a', 'rolling'],
  ['01a0d88c-310a-7cb1-af6e-3712b2958e12', 'specified-end-date'],
];
interface LegacyVersion {
  periodTypeId: string | null;
  yearTypeId: string | null;
  yearEnd?: [number, number];
}

/** A database migrated to just before this one, holding a version for each answer. */
async function withLegacyVersions(versions: LegacyVersion[]): Promise<[TestDb, postgres.Sql]> {
  const testDb = await createTestDb({ template: 'unmigrated' });
  const sql = testDb.sql;
  await migrateBefore(sql, MIGRATION);

  for (const [index, { periodTypeId, yearTypeId, yearEnd }] of versions.entries()) {
    await sql`
      WITH created AS (INSERT INTO indicator (short_id) VALUES (${index + 1}) RETURNING id)
      INSERT INTO indicator_version
        (indicator_id, name, slug, period_type_id, year_type_id, year_end_day, year_end_month,
         created_by, updated_by)
      SELECT created.id, ${`Indicator ${index + 1}`}, ${`indicator-${index + 1}`},
             ${periodTypeId}, ${yearTypeId}, ${yearEnd?.[0] ?? null}, ${yearEnd?.[1] ?? null},
             'migration-test', 'migration-test'
      FROM created
    `;
  }

  return [testDb, sql];
}

describe(`migration ${MIGRATION}`, () => {
  const versions: LegacyVersion[] = [
    ...YEAR_TYPES.map(([yearTypeId]) => ({
      periodTypeId: YEARS_ID,
      yearTypeId,
      ...(yearTypeId === SPECIFIED_END_DATE_ID ? { yearEnd: [31, 7] as [number, number] } : {}),
    })),
    { periodTypeId: QUARTERS_ID, yearTypeId: FINANCIAL_ID },
    { periodTypeId: MONTHS_ID, yearTypeId: null },
    { periodTypeId: null, yearTypeId: null },
  ];
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    [testDb, sql] = await withLegacyVersions(versions);
    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('gives each version the values its period and year types become', async () => {
    const rows = await sql`
      SELECT v.period_type, v.year_type, v.year_end_day, v.year_end_month
      FROM indicator_version v JOIN indicator i ON i.id = v.indicator_id
      ORDER BY i.short_id
    `;

    expect(rows).toEqual([
      ...YEAR_TYPES.map(([id, yearType]) => ({
        period_type: 'years',
        year_type: yearType,
        year_end_day: id === SPECIFIED_END_DATE_ID ? 31 : null,
        year_end_month: id === SPECIFIED_END_DATE_ID ? 7 : null,
      })),
      { period_type: 'quarters', year_type: 'financial', year_end_day: null, year_end_month: null },
      { period_type: 'months', year_type: null, year_end_day: null, year_end_month: null },
      { period_type: null, year_type: null, year_end_day: null, year_end_month: null },
    ]);
  });

  it('drops the lookup tables and the view of them', async () => {
    const [relations] = await sql`
      SELECT to_regclass('public.period_type') AS period_type,
        to_regclass('public.year_type') AS year_type,
        to_regclass('published.year_type') AS published_year_type
    `;

    expect(relations).toEqual({ period_type: null, year_type: null, published_year_type: null });
  });
});

describe(`migration ${MIGRATION} over a period type it cannot translate`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    [testDb, sql] = await withLegacyVersions([]);
    const [fortnights] = await sql<{ id: string }[]>`
      INSERT INTO period_type (name) VALUES ('Fortnights') RETURNING id
    `;
    await sql`
      WITH created AS (INSERT INTO indicator (short_id) VALUES (1) RETURNING id)
      INSERT INTO indicator_version
        (indicator_id, name, slug, period_type_id, year_type_id, created_by, updated_by)
      SELECT created.id, 'Indicator 1', 'indicator-1', ${fortnights?.id ?? null},
             ${FINANCIAL_ID}, 'migration-test', 'migration-test'
      FROM created
    `;
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('stops rather than drop the answer', async () => {
    await expect(migrateThrough(sql, MIGRATION)).rejects.toThrow(/no value to translate it to/);
  });
});
