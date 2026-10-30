import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { schema } from '@fphd/db';
import { auditEntriesFor, createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type CiMethodRecord, upsertCiMethods } from './ci-method-core-data.ts';
import { importCoreData } from './core-data.ts';
import { loadIndicatorVersions } from './seeding.ts';

const { SYSTEM_USER_IDS } = schema;

// The service's list, in the order the publisher's form shows it.
const SERVICE_CI_METHODS = [
  { name: "Byar's method", kind: 'standard' },
  { name: "Byar's method (adjusted for repeat hospital admissions)", kind: 'standard' },
  { name: "Byar's method (no small number correction)", kind: 'standard' },
  { name: 'Chiang-Silcocks method', kind: 'standard' },
  { name: "Dobson & Byar's methods", kind: 'standard' },
  { name: 'Exact Poisson method', kind: 'standard' },
  { name: 'Newcombe-Wilson method', kind: 'standard' },
  { name: 'No confidence intervals available', kind: 'none' },
  { name: 'Other method', kind: 'other' },
  { name: 'T-distribution method', kind: 'standard' },
  { name: 'Unknown', kind: 'none' },
  { name: 'Wald normal approximation', kind: 'standard' },
  { name: 'Wilson Score method', kind: 'standard' },
];

async function ciMethods(sql: postgres.Sql) {
  return sql<{ name: string; kind: string }[]>`SELECT name, kind FROM ci_method ORDER BY name`;
}

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

  it("hold the service's confidence interval methods and nothing else", async () => {
    expect(await ciMethods(sql)).toEqual(SERVICE_CI_METHODS);
  });

  it('describe the methods in plain text', async () => {
    const [marked] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM ci_method WHERE description ~ '<[a-z/]|&[a-z]+;'
    `;

    expect(marked?.count).toBe(0);
  });

  it("point each seeded version at the service's method for Pholio's", async () => {
    const rows = await sql<{ name: string }[]>`
      SELECT c.name FROM indicator_version v
      JOIN indicator i ON i.id = v.indicator_id
      JOIN ci_method c ON c.id = v.ci_method_id
      WHERE i.short_id = 92443
    `;

    // Pholio calls it "Other method - see below".
    expect(rows).toEqual([{ name: 'Other method' }]);
  });
});

describe('upsertCiMethods', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  const method: CiMethodRecord = {
    id: '019fa38f-073f-764e-9ac6-1c4d03b1cb92',
    name: "Byar's method",
    kind: 'standard',
    description: null,
  };

  beforeAll(async () => {
    testDb = await createTestDb();
    sql = testDb.sql;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('inserts, leaves an unchanged method alone, rewrites a changed one and reports strays', async () => {
    const { db } = testDb;
    const [stray] = await sql<{ id: string }[]>`
      INSERT INTO ci_method (name) VALUES ('A method no file lists') RETURNING id
    `;

    const first = await upsertCiMethods(db, [method]);
    const again = await upsertCiMethods(db, [method]);
    const renamed = await upsertCiMethods(db, [{ ...method, name: "Byar's method, renamed" }]);

    expect(first.summary).toEqual({ inserted: 1, updated: 0, unchanged: 0 });
    expect(again.summary).toEqual({ inserted: 0, updated: 0, unchanged: 1 });
    expect(renamed.summary).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    expect(renamed.orphaned).toEqual([{ id: stray?.id, name: 'A method no file lists' }]);
  });

  it('records the methods it writes as the core data import, and nothing for the rest', async () => {
    const { db } = testDb;
    const recorded = { ...method, id: '019fa38f-073f-764e-9ac6-1c4d03b1cb93', name: 'Recorded' };

    await upsertCiMethods(db, [recorded]);
    await upsertCiMethods(db, [recorded]);
    await upsertCiMethods(db, [{ ...recorded, name: 'Recorded, renamed' }]);

    expect(await auditEntriesFor(db, recorded.id)).toEqual([
      expect.objectContaining({
        actorId: SYSTEM_USER_IDS.coreDataImport,
        action: 'ci_method.created',
        changes: expect.objectContaining({ name: { before: null, after: 'Recorded' } }),
      }),
      expect.objectContaining({
        actorId: SYSTEM_USER_IDS.coreDataImport,
        action: 'ci_method.updated',
        changes: { name: { before: 'Recorded', after: 'Recorded, renamed' } },
      }),
    ]);
  });

  it('touches updated_at only on a method it rewrites', async () => {
    const { db } = testDb;
    const stamp = async () => {
      const [row] = await sql<{ stamp: number }[]>`
        SELECT extract(epoch FROM updated_at)::float8 AS stamp FROM ci_method WHERE id = ${method.id}
      `;
      return row?.stamp ?? 0;
    };
    await upsertCiMethods(db, [method]);
    const before = await stamp();

    await upsertCiMethods(db, [method]);
    const unchanged = await stamp();
    await upsertCiMethods(db, [{ ...method, description: 'A description.' }]);

    expect(unchanged).toBe(before);
    expect(await stamp()).toBeGreaterThan(before);
  });
});

describe('loadIndicatorVersions', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;
  let directory: string;
  let indicatorId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    sql = testDb.sql;
    await importCoreData(sql);
    const [row] = await sql<{ id: string }[]>`INSERT INTO indicator DEFAULT VALUES RETURNING id`;
    indicatorId = row?.id ?? '';
    directory = await mkdtemp(join(tmpdir(), 'fphd-ci-methods-'));
  });

  afterAll(async () => {
    await testDb.drop();
    await rm(directory, { recursive: true, force: true });
  });

  /** A source as Pholio's export shapes it: its own method ids and names, one version. */
  async function writeSource(methodName: string, extraColumn?: string) {
    const methodId = '00000000-0000-7000-8000-00000000c1c1';
    await writeFile(
      join(directory, 'ci_method.csv.gz'),
      gzipSync(`id,name,description\n${methodId},${methodName},\n`),
    );
    await writeFile(
      join(directory, 'comparator_method.csv.gz'),
      gzipSync('id,name\n00000000-0000-7000-8000-00000000c0c0,No comparison\n'),
    );
    await writeFile(
      join(directory, 'indicator_version.csv.gz'),
      gzipSync(
        `indicator_id,status,published_at,name,slug,ci_method_id,created_by,updated_by${extraColumn ? `,${extraColumn}` : ''}\n` +
          `${indicatorId},published,2026-01-01T00:00:00Z,A seeded indicator,a-seeded-indicator,${methodId},${SYSTEM_USER_IDS.pholioMigration},${SYSTEM_USER_IDS.pholioMigration}${extraColumn ? ',x' : ''}\n`,
      ),
    );
  }

  it("points a version at the service's method under Pholio's older name", async () => {
    await writeSource('Normal approximation');

    const loaded = await sql.begin((tx) => loadIndicatorVersions(tx, directory));
    const rows = await sql<{ name: string }[]>`
      SELECT c.name FROM indicator_version v JOIN ci_method c ON c.id = v.ci_method_id
      WHERE v.indicator_id = ${indicatorId}
    `;

    expect(loaded).toEqual({
      ciMethods: 1,
      comparatorMethods: 1,
      versions: 1,
      legacySources: 0,
      sources: 0,
    });
    expect(rows).toEqual([{ name: 'Wald normal approximation' }]);
    await sql`DELETE FROM indicator_version WHERE indicator_id = ${indicatorId}`;
  });

  it('stops the load at a method the service does not list', async () => {
    await writeSource('A method nobody has heard of');

    await expect(sql.begin((tx) => loadIndicatorVersions(tx, directory))).rejects.toThrow(
      /No core CI method for A method nobody has heard of/,
    );
  });

  it('names the columns of a file exported before a migration', async () => {
    await writeSource('Normal approximation', 'caveats');

    await expect(sql.begin((tx) => loadIndicatorVersions(tx, directory))).rejects.toThrow(
      'indicator_version.csv.gz has columns indicator_version does not: caveats',
    );
  });
});
