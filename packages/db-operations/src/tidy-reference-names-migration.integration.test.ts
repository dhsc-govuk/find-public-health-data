import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { READ_MODEL_TABLES, rebuildReadModels } from './read-models.ts';
import { migrateBefore, migrateThrough } from './testing.ts';

const MIGRATION = '0043_tidy-reference-names';

const id = (n: number) => `019de000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const DECILES = id(1);
const DECILES_COPY = id(2);
const CLUSTERS = id(3);
const MOST = id(11);
const LEAST = id(12);
const MOST_COPY = id(21);
const LEAST_COPY = id(22);
const OTHER = id(31);
const KEPT = id(33);
const CHILD = id(34);
const MERGED = id(41);
const MERGED_COPY = id(42);
const COMBINED = id(43);
const INDICATOR = id(51);
const BATCH = id(52);
const AREA = id(53);
const observation = (n: number) => id(100 + n);
const observationNote = (n: number) => id(200 + n);

interface Fixture {
  types: { id: string; name: string; dimension_class?: string; is_required?: boolean }[];
  values: { id: string; dimension_type_id: string; name: string; parent_id?: string }[];
  notes: { id: string; text: string; category: string }[];
  dimensions: { observation: number; value: string }[];
  observationNotes: { id: string; observation: number; note: string }[];
}

/** A database migrated to just before this one, holding the fixture and read models built from it. */
async function withReferenceRows(fixture: Fixture): Promise<[TestDb, postgres.Sql]> {
  const testDb = await createTestDb({ template: 'unmigrated' });
  const sql = testDb.sql;
  await migrateBefore(sql, MIGRATION);

  const types = fixture.types.map((type) => ({
    dimension_class: 'inequality',
    is_required: false,
    ...type,
  }));
  await sql`INSERT INTO dimension_type ${sql(types)}`;
  const values = fixture.values.map((value) => ({ parent_id: null, ...value }));
  await sql`INSERT INTO dimension_value ${sql(values)}`;
  await sql`INSERT INTO note_type ${sql(fixture.notes)}`;
  await sql`INSERT INTO indicator (id, short_id) VALUES (${INDICATOR}, 1)`;
  // Published, since the read models hold only what the public site shows.
  await sql`
    INSERT INTO indicator_version
      (indicator_id, status, published_at, name, slug, created_by, updated_by)
    VALUES (${INDICATOR}, 'published', now(), 'Indicator 1', 'indicator-1', 'migration-test',
            'migration-test')
  `;
  await sql`
    INSERT INTO upload_batch (id, indicator_id, original_filename, uploaded_by)
    VALUES (${BATCH}, ${INDICATOR}, 'data.csv', 'migration-test')
  `;
  const [areaType] = await sql`
    INSERT INTO area_type (name, hierarchy_type, level, display_group)
    VALUES ('Counties', 'Administrative', 1, 'Local authorities')
    RETURNING id
  `;
  await sql`
    INSERT INTO area (id, code, name, area_type_id, valid_from)
    VALUES (${AREA}, 'E10000001', 'Somewhere', ${areaType?.id}, '2020-01-01')
  `;
  const observations = [
    ...new Set([
      ...fixture.dimensions.map((row) => row.observation),
      ...fixture.observationNotes.map((row) => row.observation),
    ]),
  ];
  for (const n of observations) {
    await sql`
      INSERT INTO observation
        (id, indicator_id, area_id, from_date, to_date, value, published_at, upload_batch_id,
         created_by)
      VALUES (${observation(n)}, ${INDICATOR}, ${AREA}, '2024-01-01', '2024-12-31', ${n}, now(),
              ${BATCH}, 'migration-test')
    `;
  }
  for (const row of fixture.dimensions) {
    await sql`
      INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id)
      SELECT ${observation(row.observation)}, id, dimension_type_id
      FROM dimension_value WHERE id = ${row.value}
    `;
  }
  for (const row of fixture.observationNotes) {
    await sql`
      INSERT INTO observation_note (id, observation_id, note_type_id)
      VALUES (${row.id}, ${observation(row.observation)}, ${row.note})
    `;
  }
  await rebuildReadModels(sql);

  return [testDb, sql];
}

const DIRTY: Fixture = {
  types: [
    { id: DECILES, name: 'Deciles within area (IMD trend)\n' },
    { id: DECILES_COPY, name: 'Deciles within area (IMD trend)' },
    { id: CLUSTERS, name: 'GP\u000bcluster\u00a0 shapes\u202f' },
  ],
  values: [
    { id: MOST, dimension_type_id: DECILES, name: 'Most deprived decile' },
    { id: LEAST, dimension_type_id: DECILES, name: 'Least deprived decile' },
    { id: MOST_COPY, dimension_type_id: DECILES_COPY, name: 'Most deprived decile ' },
    { id: LEAST_COPY, dimension_type_id: DECILES_COPY, name: 'Least deprived decile' },
    { id: OTHER, dimension_type_id: CLUSTERS, name: 'Other\ufeff' },
    { id: KEPT, dimension_type_id: CLUSTERS, name: 'Next line\u0085and separator\u001c kept' },
    { id: CHILD, dimension_type_id: CLUSTERS, name: 'Child', parent_id: MOST_COPY },
  ],
  notes: [
    { id: MERGED, text: 'Aggregated from values for merged CCGs', category: 'geographic' },
    { id: MERGED_COPY, text: 'Aggregated from values for merged CCGs', category: 'geographic' },
    {
      id: COMBINED,
      text: '\u00a0Value for Dorset and\n\tPoole combined\n',
      category: 'contextual',
    },
  ],
  dimensions: [
    { observation: 1, value: MOST },
    { observation: 2, value: LEAST_COPY },
    { observation: 3, value: OTHER },
  ],
  observationNotes: [
    { id: observationNote(1), observation: 4, note: MERGED_COPY },
    { id: observationNote(2), observation: 4, note: MERGED },
    { id: observationNote(3), observation: 5, note: MERGED_COPY },
    { id: observationNote(4), observation: 6, note: COMBINED },
  ],
};

async function readModels(sql: postgres.Sql): Promise<Record<string, string[]>> {
  const entries = await Promise.all(
    READ_MODEL_TABLES.map(async (table) => {
      const rows = await sql.unsafe(`SELECT * FROM "${table}"`);
      return [table, rows.map((row) => JSON.stringify(row)).sort()] as const;
    }),
  );
  return Object.fromEntries(entries);
}

describe(`migration ${MIGRATION} over names differing only in whitespace`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    [testDb, sql] = await withReferenceRows(DIRTY);
    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('tidies each dimension type name and merges the copy into the lower id', async () => {
    const rows = await sql`SELECT id, name FROM dimension_type ORDER BY id`;

    expect(rows).toEqual([
      { id: DECILES, name: 'Deciles within area (IMD trend)' },
      { id: CLUSTERS, name: 'GP cluster shapes' },
    ]);
  });

  it("keeps the survivor's values, tidied, and drops the copy's", async () => {
    const rows = await sql`
      SELECT id, dimension_type_id, name, parent_id FROM dimension_value ORDER BY id
    `;

    expect(rows).toEqual([
      { id: MOST, dimension_type_id: DECILES, name: 'Most deprived decile', parent_id: null },
      { id: LEAST, dimension_type_id: DECILES, name: 'Least deprived decile', parent_id: null },
      { id: OTHER, dimension_type_id: CLUSTERS, name: 'Other', parent_id: null },
      {
        id: KEPT,
        dimension_type_id: CLUSTERS,
        name: 'Next line\u0085and separator\u001c kept',
        parent_id: null,
      },
      { id: CHILD, dimension_type_id: CLUSTERS, name: 'Child', parent_id: MOST },
    ]);
  });

  it("points an observation of the copy at the survivor's value of the same name", async () => {
    const rows = await sql`
      SELECT dimension_value_id, dimension_type_id FROM observation_dimension
      WHERE observation_id = ${observation(2)}
    `;

    expect(rows).toEqual([{ dimension_value_id: LEAST, dimension_type_id: DECILES }]);
  });

  it('tidies each note type and merges the duplicate into the lower id', async () => {
    const rows = await sql`SELECT id, text FROM note_type ORDER BY id`;

    expect(rows).toEqual([
      { id: MERGED, text: 'Aggregated from values for merged CCGs' },
      { id: COMBINED, text: 'Value for Dorset and Poole combined' },
    ]);
  });

  it("keeps an observation's lowest-id note of a merged pair, pointed at the survivor", async () => {
    const rows =
      await sql`SELECT id, observation_id, note_type_id FROM observation_note ORDER BY id`;

    expect(rows).toEqual([
      { id: observationNote(1), observation_id: observation(4), note_type_id: MERGED },
      { id: observationNote(3), observation_id: observation(5), note_type_id: MERGED },
      { id: observationNote(4), observation_id: observation(6), note_type_id: COMBINED },
    ]);
  });

  it('refuses a second note type with the same text', async () => {
    await expect(
      sql`INSERT INTO note_type (text, category) VALUES ('Value for Dorset and Poole combined', 'contextual')`,
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('leaves the read models as a rebuild makes them', async () => {
    const migrated = await readModels(sql);
    await rebuildReadModels(sql);

    expect(migrated).toEqual(await readModels(sql));
  });
});

describe.each([
  {
    refusal:
      'Dimension types differing only in whitespace have different classes or requirements: Deciles within area (IMD trend)',
    fixture: {
      ...DIRTY,
      types: DIRTY.types.map((type) =>
        type.id === DECILES_COPY ? { ...type, dimension_class: 'demographic' } : type,
      ),
    },
  },
  {
    refusal:
      'Dimension types differing only in whitespace have different classes or requirements: Deciles within area (IMD trend)',
    fixture: {
      ...DIRTY,
      types: DIRTY.types.map((type) =>
        type.id === DECILES_COPY ? { ...type, is_required: true } : type,
      ),
    },
  },
  {
    refusal:
      'Note types differing only in whitespace have different categories: Aggregated from values for merged CCGs',
    fixture: {
      ...DIRTY,
      notes: [
        { id: MERGED, text: 'Aggregated from values for merged CCGs', category: 'geographic' },
        {
          id: MERGED_COPY,
          text: 'Aggregated from values for merged CCGs ',
          category: 'contextual',
        },
      ],
      observationNotes: [],
    },
  },
  {
    refusal:
      'A dimension type merging into another has a value the other lacks: Least deprived decile',
    fixture: {
      ...DIRTY,
      values: [
        { id: MOST, dimension_type_id: DECILES, name: 'Most deprived decile' },
        { id: LEAST_COPY, dimension_type_id: DECILES_COPY, name: 'Least deprived decile' },
      ],
      dimensions: [],
    },
  },
  {
    refusal: 'Two values of one dimension type differ only in whitespace: Other',
    fixture: {
      ...DIRTY,
      values: [
        { id: OTHER, dimension_type_id: CLUSTERS, name: 'Other ' },
        { id: id(32), dimension_type_id: CLUSTERS, name: 'Other' },
      ],
      dimensions: [],
    },
  },
  {
    refusal: `An observation has a value in two dimension types that merge: ${observation(1)}`,
    fixture: {
      ...DIRTY,
      dimensions: [
        { observation: 1, value: MOST },
        { observation: 1, value: LEAST_COPY },
      ],
    },
  },
])(`migration ${MIGRATION} over names it cannot merge`, ({ refusal, fixture }) => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    [testDb, sql] = await withReferenceRows(fixture);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it(`stops: ${refusal}`, async () => {
    // The driver's error quotes the whole query, so this checks the database's own message.
    await expect(migrateThrough(sql, MIGRATION)).rejects.toMatchObject({
      cause: { message: refusal },
    });
  });
});
