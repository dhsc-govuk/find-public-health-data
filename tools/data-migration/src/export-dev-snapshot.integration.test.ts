import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { importCoreData, rebuildReadModels, seedPublishedTables } from '@fphd/db-operations';
import { DATA_MIGRATION_NULL } from '@fphd/db-operations/data-migration-contract';
import type postgres from 'postgres';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { verifyPublishedSnapshot } from '../../../apps/operations/src/published-snapshot.ts';
import { transformGzipCsv } from './csv.ts';
import { sourceConfirmation, writeDevelopmentSource } from './export-dev-snapshot.testing.ts';
import { exportDevSnapshot } from './export-dev-snapshot.ts';
import { exportPholio } from './pholio/export-pholio.ts';
import { deterministicUuid } from './prepare-baseline.ts';

vi.mock('./pholio/export-pholio.ts', () => ({ exportPholio: vi.fn() }));
let database: TestDb;
let sql: postgres.Sql;
let directory: string;
beforeAll(async () => {
  database = await createTestDb();
  sql = database.sql;
  await importCoreData(sql);
  directory = await mkdtemp(join(tmpdir(), 'dev-snapshot-import-'));
});
afterAll(async () => {
  await database?.drop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it('imports a generated development snapshot with version batch pointers and published observations', async () => {
  vi.mocked(exportPholio).mockImplementation(({ outDir }) => writeDevelopmentSource(outDir));
  await exportDevSnapshot({ connectionString: 'test source', outDir: directory });
  const manifest = await verifyPublishedSnapshot(directory);
  const imported = await sql.begin((tx) => seedPublishedTables(tx, directory));
  expect(imported.relationships.unknownIndicators).toEqual([]);
  for (const [table, record] of Object.entries(manifest.tables))
    expect(imported.tables[table], table).toBe(record.rows);
  await rebuildReadModels(sql);
  const versionId = deterministicUuid('indicator_version', '108');
  const batchId = deterministicUuid('upload_batch', '108');
  const [version] = await sql<{ batch: string; confirmed: boolean; owner: string }[]>`
    SELECT v.upload_batch_id AS batch,
      v.data_table_confirmed_at = ${sourceConfirmation}::timestamptz AS confirmed,
      b.indicator_version_id AS owner
    FROM indicator_version v JOIN upload_batch b ON b.id=v.upload_batch_id
    WHERE v.id=${versionId}
  `;
  expect(version).toEqual({
    batch: batchId,
    confirmed: true,
    owner: versionId,
  });
  // The archive is seed files, which name their writers by user id.
  const migrated = schema.SYSTEM_USER_IDS.pholioMigration;
  expect(
    await sql`
    SELECT v.created_by, v.updated_by, b.uploaded_by
    FROM indicator_version v JOIN upload_batch b ON b.id = v.upload_batch_id
    WHERE v.id = ${versionId}
  `,
  ).toEqual([{ created_by: migrated, updated_by: migrated, uploaded_by: migrated }]);
  expect(
    await sql`
    SELECT p.value, o.upload_batch_id
    FROM published.observation p JOIN observation o ON o.id = p.id
  `,
  ).toEqual([{ value: 10, upload_batch_id: batchId }]);
  expect(await sql`SELECT count(*)::int AS count FROM published.observation_dimension`).toEqual([
    { count: 1 },
  ]);
  expect(await sql`SELECT count(*)::int AS count FROM published.observation_note`).toEqual([
    { count: 1 },
  ]);

  await transformGzipCsv(join(directory, 'indicator_version.csv.gz'), (row, header) =>
    row.map((value, index) =>
      row[header.indexOf('id')] === versionId && header[index] === 'upload_batch_id'
        ? DATA_MIGRATION_NULL
        : value,
    ),
  );
  await expect(sql.begin((tx) => seedPublishedTables(tx, directory))).rejects.toThrow(
    /indicator_version_data_table_confirmed_check/,
  );
  expect(await sql`SELECT value FROM published.observation`).toEqual([{ value: 10 }]);
  expect(
    await sql`
    SELECT upload_batch_id,
      data_table_confirmed_at = ${sourceConfirmation}::timestamptz AS confirmed
    FROM indicator_version WHERE id=${versionId}
  `,
  ).toEqual([{ upload_batch_id: batchId, confirmed: true }]);
});
