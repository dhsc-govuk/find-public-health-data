import { readFileSync } from 'node:fs';

import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { NUMERATOR_VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const { SYSTEM_USER_IDS } = schema;

const MIGRATION = '0052_count-and-numerator';
const ACTOR = SYSTEM_USER_IDS.testSeed;

const VALUE_TYPES: { id: string; name: string }[] = JSON.parse(
  readFileSync(new URL('../data/value-types.json', import.meta.url), 'utf-8'),
);

function valueTypeId(name: string): string {
  const valueType = VALUE_TYPES.find((candidate) => candidate.name === name);
  if (!valueType) throw new Error(`No value type named ${name}`);
  return valueType.id;
}

let nextShortId = 0;

/** A published indicator of the value type given, with one observation of the count given. */
async function observationOf(
  sql: postgres.Sql,
  areaId: string,
  valueType: string | null,
  count: number | null,
  { shortId = ++nextShortId, uploadedBy = ACTOR }: { shortId?: number; uploadedBy?: string } = {},
): Promise<{ indicatorId: string; observationId: string }> {
  const [version] = await sql<{ indicatorId: string; versionId: string }[]>`
    WITH i AS (INSERT INTO indicator (short_id) VALUES (${shortId}) RETURNING id)
    INSERT INTO indicator_version
      (indicator_id, status, published_at, name, slug, value_type_id, created_by, updated_by)
    SELECT i.id, 'published', '2026-02-01T00:00:00Z', ${`Indicator ${shortId}`},
           ${`indicator-${shortId}`}, ${valueType === null ? null : valueTypeId(valueType)},
           ${ACTOR}, ${ACTOR}
    FROM i
    RETURNING indicator_id AS "indicatorId", id AS "versionId"
  `;
  if (!version) throw new Error('inserted no version');
  const [batch] = await sql<{ id: string }[]>`
    INSERT INTO upload_batch
      (indicator_id, indicator_version_id, original_filename, uploaded_by, status)
    VALUES (${version.indicatorId}, ${version.versionId}, 'data.csv', ${uploadedBy}, 'processed')
    RETURNING id
  `;
  await sql`
    UPDATE indicator_version SET upload_batch_id = ${batch?.id ?? ''}, data_table_confirmed_at = now()
    WHERE id = ${version.versionId}
  `;
  const [observation] = await sql<{ id: string }[]>`
    INSERT INTO observation
      (indicator_id, area_id, from_date, to_date, value, count, denominator, upload_batch_id,
       dimension_key)
    VALUES (${version.indicatorId}, ${areaId}, '2024-01-01', '2024-12-31', 25, ${count}, 400,
            ${batch?.id ?? ''}, '')
    RETURNING id
  `;
  return { indicatorId: version.indicatorId, observationId: observation?.id ?? '' };
}

describe(`migration ${MIGRATION}`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;
  const observations = new Map<string, string>();

  beforeAll(async () => {
    testDb = await createTestDb({ template: 'unmigrated' });
    sql = testDb.sql;
    await migrateBefore(sql, MIGRATION);

    const [area] = await sql<{ id: string }[]>`
      WITH t AS (
        INSERT INTO area_type (name, hierarchy_type, level)
        VALUES ('Region', 'Administrative', 1) RETURNING id
      )
      INSERT INTO area (code, name, area_type_id, valid_from)
      SELECT 'E12000001', 'North East', t.id, '2009-01-01' FROM t
      RETURNING id
    `;
    const areaId = area?.id ?? '';
    for (const { name } of VALUE_TYPES) {
      const { observationId } = await observationOf(sql, areaId, name, 100);
      observations.set(name, observationId);
    }
    observations.set('none', (await observationOf(sql, areaId, null, 100)).observationId);
    observations.set(
      'Proportion without a count',
      (await observationOf(sql, areaId, 'Proportion', null)).observationId,
    );
    observations.set(
      'smoking prevalence',
      (await observationOf(sql, areaId, 'Proportion', 100, { shortId: 92443 })).observationId,
    );
    const [publisher] = await sql<{ id: string }[]>`
      INSERT INTO app_user (display_name, kind) VALUES ('A publisher', 'person') RETURNING id
    `;
    observations.set(
      'Proportion a publisher uploaded',
      (await observationOf(sql, areaId, 'Proportion', 100, { uploadedBy: publisher?.id ?? '' }))
        .observationId,
    );

    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  async function measures(name: string) {
    const [row] = await sql<{ count: number | null; numerator: number | null }[]>`
      SELECT count, numerator FROM observation WHERE id = ${observations.get(name) ?? ''}
    `;
    return row;
  }

  it.each(
    VALUE_TYPES.filter(({ id }) => NUMERATOR_VALUE_TYPE_IDS.includes(id)).map(({ name }) => name),
  )('moves the count of a %s to its numerator', async (name) => {
    expect(await measures(name)).toEqual({ count: null, numerator: 100 });
  });

  it.each(
    VALUE_TYPES.filter(({ id }) => !NUMERATOR_VALUE_TYPE_IDS.includes(id)).map(({ name }) => name),
  )('keeps the count of a %s', async (name) => {
    expect(await measures(name)).toEqual({ count: 100, numerator: null });
  });

  it('keeps the count of an indicator with no value type', async () => {
    expect(await measures('none')).toEqual({ count: 100, numerator: null });
  });

  it('keeps the estimated count of smoking prevalence, a survey proportion', async () => {
    expect(await measures('smoking prevalence')).toEqual({ count: 100, numerator: null });
  });

  it("keeps the count in a publisher's own upload", async () => {
    expect(await measures('Proportion a publisher uploaded')).toEqual({
      count: 100,
      numerator: null,
    });
  });

  it('leaves both empty where there was no count', async () => {
    expect(await measures('Proportion without a count')).toEqual({ count: null, numerator: null });
  });

  it('shows the numerator in the published view', async () => {
    const [row] = await sql<{ count: number | null; numerator: number | null }[]>`
      SELECT count, numerator FROM published.observation
      WHERE id = ${observations.get('Proportion') ?? ''}
    `;

    expect(row).toEqual({ count: null, numerator: 100 });
  });
});
