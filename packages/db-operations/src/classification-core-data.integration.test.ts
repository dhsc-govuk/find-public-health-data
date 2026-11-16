import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { schema } from '@fphd/db';
import { auditEntriesFor, createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseClassificationsFile, upsertClassifications } from './classification-core-data.ts';

const committed = parseClassificationsFile(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../data/classifications.json', import.meta.url)), 'utf-8'),
  ),
);

describe('the committed core data and seed', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    testDb = await createTestDb({ template: 'seeded' });
    sql = testDb.sql;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('hold the classifications in the file and nothing else', async () => {
    const rows = await sql<schema.ClassificationRecord[]>`
      SELECT id, dimension, slug, name FROM classification ORDER BY slug
    `;

    expect(rows).toEqual([...committed].sort((a, b) => a.slug.localeCompare(b.slug)));
  });

  it('answer yes to a life stage or framework exactly where the seed gives one', async () => {
    const rows = await sql<{ dimension: string; answered: boolean | null; linked: boolean }[]>`
      SELECT d.dimension,
        CASE d.dimension WHEN 'life_stage' THEN v.has_life_stage ELSE v.has_framework END AS answered,
        EXISTS (
          SELECT 1 FROM indicator_version_classification ic
          JOIN classification c ON c.id = ic.classification_id
          WHERE ic.indicator_version_id = v.id AND c.dimension = d.dimension
        ) AS linked
      FROM indicator_version v
      CROSS JOIN (VALUES ('life_stage'), ('framework')) AS d(dimension)
    `;

    expect(rows.some(({ linked }) => linked)).toBe(true);
    expect(rows.filter(({ linked, answered }) => linked !== (answered === true))).toEqual([]);
    expect(rows.filter(({ answered }) => answered === null)).toEqual([]);
  });
});

describe('upsertClassifications', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  const outcome: schema.ClassificationRecord = {
    id: '01a0edef-f609-758f-8890-c2d9a81ec617',
    dimension: 'indicator_type',
    slug: 'indicator-type-outcome',
    name: 'Outcome',
  };

  beforeAll(async () => {
    testDb = await createTestDb();
    sql = testDb.sql;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('matches on id, rewriting a renamed or re-slugged row in place, and reports strays', async () => {
    const { db } = testDb;
    const [stray] = await sql<{ id: string }[]>`
      INSERT INTO classification (dimension, slug, name, position)
      VALUES ('population', 'population-no-file-lists', 'A population no file lists', 0)
      RETURNING id
    `;
    const renamed = { ...outcome, slug: 'indicator-type-outcomes', name: 'Outcomes' };

    const first = await upsertClassifications(db, [outcome]);
    const again = await upsertClassifications(db, [outcome]);
    const rewritten = await upsertClassifications(db, [renamed]);
    const rows = await sql<schema.ClassificationRecord[]>`
      SELECT id, dimension, slug, name FROM classification
      WHERE dimension = 'indicator_type' ORDER BY slug
    `;

    expect(first.summary).toEqual({ inserted: 1, updated: 0, unchanged: 0 });
    expect(again.summary).toEqual({ inserted: 0, updated: 0, unchanged: 1 });
    expect(await auditEntriesFor(db, outcome.id)).toEqual([]);
    expect(rewritten.summary).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    expect(rows).toEqual([renamed]);
    expect(rewritten.orphaned).toEqual([{ id: stray?.id, slug: 'population-no-file-lists' }]);
  });

  it("stores each row's place in the file as its position, and moves it when the file does", async () => {
    const { db } = testDb;
    const second = {
      ...outcome,
      id: '01a1e2d0-0000-7000-8000-000000000001',
      slug: 'indicator-type-second',
      name: 'Second',
    };
    const positions = async () =>
      sql<{ slug: string; position: number }[]>`
        SELECT slug, position FROM classification
        WHERE id IN (${outcome.id}, ${second.id}) ORDER BY position
      `;

    await upsertClassifications(db, [outcome, second]);
    expect((await positions()).map(({ slug }) => slug)).toEqual([outcome.slug, second.slug]);

    const moved = await upsertClassifications(db, [second, outcome]);
    expect(moved.summary).toEqual({ inserted: 0, updated: 2, unchanged: 0 });
    expect(await positions()).toEqual([
      { slug: second.slug, position: 0 },
      { slug: outcome.slug, position: 1 },
    ]);
  });
});
