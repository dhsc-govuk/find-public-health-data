import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const MIGRATION = '0032_indicator-tagging';

// One classification per dimension, as an earlier seed stored them: the first three are in the
// core data file, which gives them these ids; the population is not.
const CLASSIFICATIONS = [
  {
    dimension: 'risk_factor',
    slug: 'risk-factor-smoking-and-tobacco',
    fixedId: '01a0edef-f609-758f-8890-f23d6e3a1846',
  },
  {
    dimension: 'framework',
    slug: 'framework-public-health-outcomes-framework',
    fixedId: '01a0edef-f609-758f-8891-079e7e9029dc',
  },
  {
    dimension: 'indicator_type',
    slug: 'indicator-type-outcome',
    fixedId: '01a0edef-f609-758f-8890-c2d9a81ec617',
  },
  { dimension: 'population', slug: 'population-not-in-the-file', fixedId: null },
];

// The classifications each version holds before the migration, keyed by its short id.
const TAGGED: Record<number, string[]> = {
  1: ['risk_factor'],
  2: ['framework', 'indicator_type'],
  3: ['risk_factor', 'framework'],
  4: ['population'],
  5: [],
};

interface Link {
  shortId: number;
  slug: string;
  classificationId: string;
}

let testDb: TestDb;
let sql: postgres.Sql;
const originalIds = new Map<string, string>();

function listLinks(): Promise<Link[]> {
  return sql<Link[]>`
    SELECT i.short_id AS "shortId", c.slug, c.id AS "classificationId"
    FROM indicator_classification ic
    JOIN classification c ON c.id = ic.classification_id
    JOIN indicator_version v ON v.id = ic.indicator_version_id
    JOIN indicator i ON i.id = v.indicator_id
    ORDER BY i.short_id, c.slug
  `;
}

beforeAll(async () => {
  testDb = await createTestDb({ template: 'unmigrated' });
  sql = testDb.sql;
  await migrateBefore(sql, MIGRATION);

  for (const { dimension, slug } of CLASSIFICATIONS) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO classification (dimension, slug, name)
      VALUES (${dimension}, ${slug}, ${slug})
      RETURNING id
    `;
    if (row) originalIds.set(slug, row.id);
  }

  for (const [shortId, dimensions] of Object.entries(TAGGED)) {
    const [version] = await sql<{ id: string }[]>`
      WITH created AS (INSERT INTO indicator (short_id) VALUES (${Number(shortId)}) RETURNING id)
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      SELECT id, ${`Indicator ${shortId}`}, ${`indicator-${shortId}`}, 'migration-test', 'migration-test'
      FROM created
      RETURNING id
    `;
    for (const dimension of dimensions) {
      await sql`
        INSERT INTO indicator_classification (indicator_version_id, classification_id)
        SELECT ${version?.id ?? ''}, id FROM classification WHERE dimension = ${dimension}
      `;
    }
  }

  await migrateThrough(sql, MIGRATION);
});

afterAll(async () => {
  await testDb?.drop();
});

describe(`migration ${MIGRATION}`, () => {
  it('answers yes where a version already has a risk factor or framework, and leaves the rest unanswered', async () => {
    const rows = await sql<
      { shortId: number; hasRiskFactor: boolean | null; hasFramework: boolean | null }[]
    >`
      SELECT i.short_id AS "shortId", v.has_risk_factor AS "hasRiskFactor", v.has_framework AS "hasFramework"
      FROM indicator_version v JOIN indicator i ON i.id = v.indicator_id
      ORDER BY i.short_id
    `;

    expect(rows).toEqual([
      { shortId: 1, hasRiskFactor: true, hasFramework: null },
      { shortId: 2, hasRiskFactor: null, hasFramework: true },
      { shortId: 3, hasRiskFactor: true, hasFramework: true },
      { shortId: 4, hasRiskFactor: null, hasFramework: null },
      { shortId: 5, hasRiskFactor: null, hasFramework: null },
    ]);
  });

  it('moves each classification the core data names to its fixed id, taking its links with it', async () => {
    const [smoking, outcomesFramework, outcome] = CLASSIFICATIONS.map(({ fixedId }) => fixedId);
    const population = originalIds.get('population-not-in-the-file');

    expect(await sql`SELECT slug, id FROM classification ORDER BY slug`).toEqual([
      { slug: 'framework-public-health-outcomes-framework', id: outcomesFramework },
      { slug: 'indicator-type-outcome', id: outcome },
      { slug: 'population-not-in-the-file', id: population },
      { slug: 'risk-factor-smoking-and-tobacco', id: smoking },
    ]);
    expect(originalIds.get('indicator-type-outcome')).not.toBe(outcome);
    expect(await listLinks()).toEqual([
      { shortId: 1, slug: 'risk-factor-smoking-and-tobacco', classificationId: smoking },
      {
        shortId: 2,
        slug: 'framework-public-health-outcomes-framework',
        classificationId: outcomesFramework,
      },
      { shortId: 2, slug: 'indicator-type-outcome', classificationId: outcome },
      {
        shortId: 3,
        slug: 'framework-public-health-outcomes-framework',
        classificationId: outcomesFramework,
      },
      { shortId: 3, slug: 'risk-factor-smoking-and-tobacco', classificationId: smoking },
      { shortId: 4, slug: 'population-not-in-the-file', classificationId: population },
    ]);
  });
});
