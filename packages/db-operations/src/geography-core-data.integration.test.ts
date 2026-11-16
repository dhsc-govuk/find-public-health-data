import { createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import * as copy from './data-migration-copy.ts';
import { importGeographyCoreData, readGeographyManifest } from './geography-core-data.ts';

let database: TestDb;
const manifest = readGeographyManifest();
beforeAll(async () => {
  database = await createTestDb({ template: 'core' });
});
afterAll(async () => {
  await database.drop();
});

it('updates rankings, deletes removed positions and schemes, and leaves a repeat import unchanged', async () => {
  const sql = database.sql;
  const [anchor] = await sql<{ area_id: string; neighbour_area_id: string; scheme: string }[]>`
    SELECT n.* FROM area_neighbour n JOIN area a ON a.id = n.area_id
    WHERE a.code = 'E06000001' AND n.position = 1
  `;
  if (!anchor) throw new Error('Missing neighbour fixture');
  await sql`
    INSERT INTO area_neighbour (area_id, neighbour_area_id, scheme, position)
    VALUES (${anchor.area_id}, ${anchor.neighbour_area_id}, ${anchor.scheme}, 16),
      (${anchor.area_id}, ${anchor.neighbour_area_id}, 'An older scheme', 1)
  `;
  await sql`
    UPDATE area_neighbour SET neighbour_area_id = area_id
    WHERE area_id = ${anchor.area_id} AND scheme = ${anchor.scheme} AND position = 1
  `;
  const result = await importGeographyCoreData(sql, manifest);
  expect(result.area_neighbour.orphaned).toBe(2);
  expect(result.area_neighbour.summary).toEqual({
    inserted: 0,
    updated: 1,
    unchanged: manifest.files.area_neighbour.rows - 1,
  });
  expect(
    await sql`SELECT neighbour_area_id FROM area_neighbour WHERE area_id = ${anchor.area_id} ORDER BY position`,
  ).toHaveLength(15);
  expect(
    await sql`SELECT neighbour_area_id FROM area_neighbour WHERE area_id = ${anchor.area_id} AND position = 1`,
  ).toEqual([{ neighbour_area_id: anchor.neighbour_area_id }]);
  const repeated = await importGeographyCoreData(sql, manifest);
  expect(repeated.area_neighbour).toEqual({
    summary: { inserted: 0, updated: 0, unchanged: manifest.files.area_neighbour.rows },
    orphaned: 0,
  });
});

it('reports missing source areas before inserting neighbours and rolls back the import', async () => {
  const original = copy.copyInto;
  const spy = vi.spyOn(copy, 'copyInto').mockImplementation(async (...args) => {
    await original(...args);
    if (args[1] === 'core_source_area_neighbour') {
      await args[0]`
        UPDATE core_source_area_neighbour SET area_id = '019de000-0000-7000-8000-000000000001'
        WHERE id = (SELECT id FROM core_source_area_neighbour LIMIT 1)
      `;
    }
  });
  try {
    await expect(importGeographyCoreData(database.sql, manifest)).rejects.toThrow(
      'Core geography neighbours reference areas missing from the source:',
    );
    expect(await database.sql`SELECT id FROM area_neighbour`).toHaveLength(
      manifest.files.area_neighbour.rows,
    );
  } finally {
    spy.mockRestore();
  }
});
