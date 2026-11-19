import { readFileSync } from 'node:fs';

import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const MIGRATION = '0035_value-type-and-units';

// Every value type and unit row in Pholio, each with the service value it translates to.
const PHOLIO: {
  valueTypes: { name: string; service: string }[];
  units: { name: string; service: string; other: string | null }[];
} = JSON.parse(
  readFileSync(new URL('./pholio-value-types-and-units.json', import.meta.url), 'utf-8'),
);

/** A core data file's rows, whose ids are the ones this migration inserts. */
function coreRows(file: string): { id: string; name: string }[] {
  return JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf-8'));
}

const VALUE_TYPES = coreRows('value-types.json');
const UNITS = coreRows('units.json');

function serviceId(values: { id: string; name: string }[], name: string): string {
  const value = values.find((candidate) => candidate.name === name);
  if (!value) throw new Error(`No service value named ${name}`);
  return value.id;
}

const valueTypeId = (name: string) => serviceId(VALUE_TYPES, name);
const unitId = (name: string) => serviceId(UNITS, name);

// Fingertips value types, and what each becomes.
const VALUE_TYPE_TRANSLATIONS: [string, string][] = [
  ['Proportion', valueTypeId('Proportion')],
  ['Directly standardised rate', valueTypeId('Directly standardised rate')],
  ['Slope index of inequality', valueTypeId('Slope index of inequality')],
  ['Slope Index of Inequality', valueTypeId('Slope index of inequality')],
  ['Number', valueTypeId('Count')],
  ['Rate ratio', valueTypeId('Ratio')],
];

// Each Fingertips unit, and the unit and other unit it becomes.
const UNIT_TRANSLATIONS: [string, string, string | null][] = [
  ['Percent', unitId('%'), null],
  ['per 100,000', unitId('per 100,000'), null],
  ['Minutes', unitId('minutes'), null],
  ['Days', unitId('days'), null],
  ['Years', unitId('years'), null],
  ['£ per capita', unitId('£ per capita'), null],
  ['No unit', unitId('No unit'), null],
  ['per 1,000 live births', unitId('Other'), 'per 1,000 live births'],
  ['per 1,000, per day ', unitId('Other'), 'per 1,000, per day'],
  ['Percentage points', unitId('Other'), 'Percentage points'],
];

interface LegacyVersion {
  valueType?: string;
  unit?: string;
}

/** A database migrated to just before this one, holding a version for each legacy answer. */
async function withLegacyVersions(versions: LegacyVersion[]): Promise<[TestDb, postgres.Sql]> {
  const testDb = await createTestDb({ template: 'unmigrated' });
  const sql = testDb.sql;
  await migrateBefore(sql, MIGRATION);

  for (const [index, { valueType = null, unit = null }] of versions.entries()) {
    await sql`
      WITH
        created AS (INSERT INTO indicator (short_id) VALUES (${index + 1}) RETURNING id),
        value_type AS (
          INSERT INTO value_type (name) SELECT ${valueType}
          WHERE ${valueType}::text IS NOT NULL
          ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        ),
        unit AS (
          INSERT INTO unit (name, label) SELECT ${unit}, ${unit}
          WHERE ${unit}::text IS NOT NULL
          RETURNING id
        )
      INSERT INTO indicator_version
        (indicator_id, name, slug, value_type_id, unit_id, created_by, updated_by)
      SELECT created.id, ${`Indicator ${index + 1}`}, ${`indicator-${index + 1}`},
             (SELECT id FROM value_type), (SELECT id FROM unit), 'migration-test', 'migration-test'
      FROM created
    `;
  }

  return [testDb, sql];
}

async function versionOf(sql: postgres.Sql, shortId: number) {
  const [version] = await sql`
    SELECT v.value_type_id, v.unit_id, v.unit_other
    FROM indicator_version v JOIN indicator i ON i.id = v.indicator_id
    WHERE i.short_id = ${shortId}
  `;
  return version;
}

// The version with neither answered, which the constraint cases update.
const BLANK = VALUE_TYPE_TRANSLATIONS.length + UNIT_TRANSLATIONS.length + 1;

describe(`migration ${MIGRATION}`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  function updateBlank(columns: Record<string, string | null>) {
    return sql`
      UPDATE indicator_version v SET ${sql(columns)}
      FROM indicator i
      WHERE i.id = v.indicator_id AND i.short_id = ${BLANK}
    `;
  }

  beforeAll(async () => {
    [testDb, sql] = await withLegacyVersions([
      ...VALUE_TYPE_TRANSLATIONS.map(([valueType]) => ({ valueType })),
      ...UNIT_TRANSLATIONS.map(([unit]) => ({ unit })),
      {},
    ]);
    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it.each(VALUE_TYPE_TRANSLATIONS.map(([name, id], index) => [name, index + 1, id]))(
    'translates the value type %s',
    async (_, shortId, id) => {
      expect(await versionOf(sql, shortId)).toMatchObject({ value_type_id: id });
    },
  );

  it.each(
    UNIT_TRANSLATIONS.map(([name, id, other], index) => [
      name,
      VALUE_TYPE_TRANSLATIONS.length + index + 1,
      id,
      other,
    ]),
  )('translates the unit %s', async (_, shortId, id, other) => {
    expect(await versionOf(sql, shortId)).toMatchObject({ unit_id: id, unit_other: other });
  });

  it('leaves a version with neither unanswered', async () => {
    expect(await versionOf(sql, BLANK)).toEqual({
      value_type_id: null,
      unit_id: null,
      unit_other: null,
    });
  });

  it('holds only value types and units the core data files hold, and no Fingertips one', async () => {
    const valueTypes = await sql<{ id: string; name: string }[]>`SELECT id, name FROM value_type`;
    const units = await sql<{ id: string; name: string }[]>`SELECT id, name FROM unit`;

    expect(valueTypes).toHaveLength(16);
    expect(VALUE_TYPES).toEqual(expect.arrayContaining(valueTypes));
    expect(units).toHaveLength(16);
    expect(UNITS).toEqual(expect.arrayContaining(units));
  });

  describe('constraints', () => {
    beforeEach(async () => {
      await updateBlank({
        value_type_id: null,
        unit_id: null,
        unit_other: null,
        standard_population: null,
        standard_population_detail: null,
      });
    });

    it.each<[string, Record<string, string | null>, string]>([
      [
        'an other unit with no name',
        { unit_id: unitId('Other'), unit_other: null },
        'unit_other_check',
      ],
      [
        'a named unit beside one in the list',
        { unit_id: unitId('%'), unit_other: 'people' },
        'unit_other_check',
      ],
      [
        'an other unit over 100 characters',
        { unit_id: unitId('Other'), unit_other: 'x'.repeat(101) },
        'unit_other_length_check',
      ],
      [
        'a standard population on a crude rate',
        { value_type_id: valueTypeId('Crude rate'), standard_population: 'esp-2013' },
        'standard_population_value_type_check',
      ],
      [
        'an unknown standard population',
        { value_type_id: valueTypeId('Directly standardised rate'), standard_population: '1976' },
        'standard_population_check',
      ],
      [
        'an other standard population with no detail',
        { value_type_id: valueTypeId('Directly standardised rate'), standard_population: 'other' },
        'standard_population_other_check',
      ],
      [
        'a detail beside the 2013 European Standard Population',
        {
          value_type_id: valueTypeId('Directly standardised rate'),
          standard_population: 'esp-2013',
          standard_population_detail: 'England 2021',
        },
        'standard_population_detail_check',
      ],
      [
        'a population detail on a proportion',
        { value_type_id: valueTypeId('Proportion'), standard_population_detail: 'England 2021' },
        'standard_population_detail_check',
      ],
    ])('refuses %s', async (_, columns, constraint) => {
      await expect(updateBlank(columns)).rejects.toMatchObject({
        code: '23514',
        constraint_name: `indicator_version_${constraint}`,
      });
    });

    it.each<[string, Record<string, string | null>]>([
      ['an other unit with its name', { unit_id: unitId('Other'), unit_other: 'people' }],
      [
        'a directly standardised rate with an other population',
        {
          value_type_id: valueTypeId('Directly standardised rate'),
          standard_population: 'other',
          standard_population_detail: 'England 2021',
        },
      ],
      [
        'an indirectly standardised ratio with its reference population',
        {
          value_type_id: valueTypeId('Indirectly standardised ratio'),
          standard_population_detail: 'England 2021',
        },
      ],
    ])('takes %s', async (_, columns) => {
      await expect(updateBlank(columns)).resolves.toHaveProperty('count', 1);
    });
  });
});

describe(`migration ${MIGRATION} over every Pholio value type and unit`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    [testDb, sql] = await withLegacyVersions([
      ...PHOLIO.valueTypes.map(({ name }) => ({ valueType: name })),
      ...PHOLIO.units.map(({ name }) => ({ unit: name })),
    ]);
    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('translates each value type', async () => {
    const translated = await Promise.all(
      PHOLIO.valueTypes.map((_, index) => versionOf(sql, index + 1)),
    );

    expect(
      PHOLIO.valueTypes.map(({ name }, index) => [name, translated[index]?.value_type_id]),
    ).toEqual(
      PHOLIO.valueTypes.map(({ name, service }) => [name, serviceId(VALUE_TYPES, service)]),
    );
  });

  it('translates each unit', async () => {
    const translated = await Promise.all(
      PHOLIO.units.map((_, index) => versionOf(sql, PHOLIO.valueTypes.length + index + 1)),
    );

    expect(
      PHOLIO.units.map(({ name }, index) => [
        name,
        translated[index]?.unit_id,
        translated[index]?.unit_other,
      ]),
    ).toEqual(
      PHOLIO.units.map(({ name, service, other }) => [name, serviceId(UNITS, service), other]),
    );
  });
});

describe.each<[string, LegacyVersion]>([
  ['a value type', { valueType: 'Weighted mean' }],
  ['a placeholder unit', { unit: 'Unknown unit 99' }],
  ['a blank unit', { unit: '  ' }],
  ['a unit named in over 100 characters', { unit: 'x'.repeat(101) }],
])(`migration ${MIGRATION} over %s it cannot translate`, (_, version) => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    [testDb, sql] = await withLegacyVersions([{ valueType: 'Count', unit: 'Percent' }, version]);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('stops rather than drop the answer', async () => {
    await expect(migrateThrough(sql, MIGRATION)).rejects.toThrow(/no value to translate it to/);
  });
});
