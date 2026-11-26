import { type Database, schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getCiMethodById, listCiMethods } from './ci-method-repository.ts';

let testDb: TestDb;
let db: Database;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  await db
    .insert(schema.ciMethod)
    .values([
      { name: 'Wilson Score method' },
      { name: 'Other method', kind: 'other' },
      { name: "Byar's method (adjusted for repeat hospital admissions)" },
      { name: "Byar's method" },
    ]);
});

afterAll(async () => {
  await testDb.drop();
});

describe('listCiMethods', () => {
  it('lists every method by name, with its kind', async () => {
    const methods = await listCiMethods(db);

    expect(methods.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "Byar's method", kind: 'standard' },
      { name: "Byar's method (adjusted for repeat hospital admissions)", kind: 'standard' },
      { name: 'Other method', kind: 'other' },
      { name: 'Wilson Score method', kind: 'standard' },
    ]);
  });
});

describe('getCiMethodById', () => {
  it('finds a method by its id', async () => {
    const [first] = await listCiMethods(db);
    if (!first) throw new Error('inserted no methods');

    await expect(getCiMethodById(db, first.id)).resolves.toEqual(first);
  });

  it('finds nothing for an id no method has', async () => {
    await expect(
      getCiMethodById(db, '00000000-0000-7000-8000-000000000000'),
    ).resolves.toBeUndefined();
  });
});
