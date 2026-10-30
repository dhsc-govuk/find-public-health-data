import { createDbFromClient, createRepositories, listAreasByType } from '@fphd/db';
import { createOwnerClient, createTestDatabase, type TestDatabase } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { migrateBefore, migrateThrough } from './testing.ts';

let database: TestDatabase;
let client: postgres.Sql;
let areaTypeId: string;
beforeAll(async () => {
  database = await createTestDatabase({ template: 'unmigrated' });
  client = createOwnerClient(database.name);
  await migrateBefore(client, '0054_area-status-and-unknown-validity');
  const [type] = await client<
    { id: string }[]
  >`INSERT INTO area_type (name,hierarchy_type,level) VALUES ('Status test','Administrative',1) RETURNING id`;
  if (!type) throw new Error('Missing area type');
  areaTypeId = type.id;
  await client`INSERT INTO area (code,name,area_type_id,valid_from,valid_to) VALUES
    ('current','Current',${areaTypeId},'2010-01-01',NULL),
    ('retired','Retired',${areaTypeId},'2010-01-01','2020-01-01')`;
  await migrateThrough(client, '0054_area-status-and-unknown-validity');
});
afterAll(async () => {
  await client.end();
  await database.drop();
});
it('retains current and retired status when migrating existing records', async () => {
  expect(await client`SELECT code,is_current FROM area ORDER BY code`).toEqual([
    { code: 'current', is_current: true },
    { code: 'retired', is_current: false },
  ]);
});
it('stores an unknown validity range without treating a retired area as current', async () => {
  await client`INSERT INTO area (code,name,area_type_id,valid_from,valid_to,is_current)
    VALUES ('nSTP_1','Retired without dates',${areaTypeId},NULL,NULL,false)`;
  expect(await client`SELECT valid_from,valid_to,is_current FROM area WHERE code='nSTP_1'`).toEqual(
    [{ valid_from: null, valid_to: null, is_current: false }],
  );
  expect(await listAreasByType(createDbFromClient(client), 'Status test')).toEqual([
    { code: 'current', name: 'Current' },
  ]);
});
it('stores unknown relationship dates', async () => {
  await client`INSERT INTO area_relationship (parent_area_id,child_area_id,valid_from,valid_to)
    SELECT p.id,c.id,NULL,NULL FROM area p,area c WHERE p.code='current' AND c.code='retired'`;
  expect(await client`SELECT valid_from,valid_to FROM area_relationship`).toEqual([
    { valid_from: null, valid_to: null },
  ]);
  const areas = createRepositories(createDbFromClient(client)).areas;
  expect(await areas.listParents(['retired'], 'Status test')).toEqual([]);
});
it('does not infer a current parent from an unknown retirement date', async () => {
  await client`INSERT INTO area_relationship (parent_area_id,child_area_id,valid_from,valid_to)
    SELECT p.id,c.id,NULL,NULL FROM area p,area c WHERE p.code='nSTP_1' AND c.code='current'`;
  const areas = createRepositories(createDbFromClient(client)).areas;
  expect(await areas.listParents(['current'], 'Status test')).toEqual([]);
});
