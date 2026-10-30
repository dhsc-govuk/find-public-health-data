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
      { name: 'Wilson Score method', description: 'A description.' },
      { name: 'Other method', kind: 'other' },
      { name: "Byar's method (adjusted for repeat hospital admissions)" },
      { name: "Byar's method" },
    ]);
});

afterAll(async () => {
  await testDb.drop();
});

describe('listCiMethods', () => {
  it('lists every method by name, with its description and kind', async () => {
    const methods = await listCiMethods(db);

    expect(methods.map(({ name, description, kind }) => ({ name, description, kind }))).toEqual([
      { name: "Byar's method", description: null, kind: 'standard' },
      {
        name: "Byar's method (adjusted for repeat hospital admissions)",
        description: null,
        kind: 'standard',
      },
      { name: 'Other method', description: null, kind: 'other' },
      { name: 'Wilson Score method', description: 'A description.', kind: 'standard' },
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
