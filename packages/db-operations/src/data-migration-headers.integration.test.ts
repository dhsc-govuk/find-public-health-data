import { describe, expect, it } from 'vitest';

import { SOURCE_ID, VERSION_COLUMNS, VERSION_ROW } from './data-migration.testing.ts';
import { dataMigrationTestDb, versionWithBatch } from './data-migration-db.testing.ts';

const { sql, apply, baseline, assertRolledBack } = await dataMigrationTestDb();

describe('applyDataMigration', () => {
  it('rolls back a version pointing at a missing batch', async () => {
    await baseline();
    await expect(
      apply({
        upserts: { indicator_version: versionWithBatch(SOURCE_ID, '2026-01-01T00:00:00Z') },
      }),
    ).rejects.toThrow('indicator_version_upload_batch_fk');
    await assertRolledBack();
    expect(
      await sql`SELECT upload_batch_id, data_table_confirmed_at FROM indicator_version`,
    ).toEqual([{ upload_batch_id: null, data_table_confirmed_at: null }]);
  });
  it.each(['upload_batch_id', 'data_table_confirmed_at'])(
    'requires the paired batch field when a version header includes %s',
    async (column) => {
      await baseline();
      await expect(
        apply({
          upserts: {
            indicator_version: {
              columns: [...VERSION_COLUMNS, column],
              rows: [[...VERSION_ROW, null]],
            },
          },
        }),
      ).rejects.toThrow(
        `missing required columns: ${column === 'upload_batch_id' ? 'data_table_confirmed_at' : 'upload_batch_id'}`,
      );
      await assertRolledBack();
    },
  );
  it.each([
    [
      ['id', 'name', 'hierarchy_type', 'bogus_column'],
      'columns the target table does not: bogus_column',
    ],
    [['id', 'hierarchy_type'], 'missing required columns: name'],
    [['name', 'hierarchy_type'], 'missing required columns: id'],
  ])('refuses invalid area_type headers: %j', async (columns, error) => {
    await baseline();
    await expect(
      apply({ upserts: { area_type: { columns: columns as string[] } } }),
    ).rejects.toThrow(error as string);
    await assertRolledBack();
  });
  it('requires imported numeric indicator identities', async () => {
    await baseline();
    await expect(apply({ upserts: { indicator: { columns: ['id'] } } })).rejects.toThrow(
      'missing required columns: short_id',
    );
  });
  it('refuses an indicator CSV that carries the team the receiver assigns', async () => {
    await baseline();
    await expect(
      apply({ upserts: { indicator: { columns: ['id', 'short_id', 'team_id'] } } }),
    ).rejects.toThrow('indicator CSV has columns only the receiver writes: team_id');
    await assertRolledBack();
  });
  it('rejects a retired area without explicit current status and rolls back the package', async () => {
    await baseline();
    const id = '44444444-4444-7444-8444-444444444444';
    await expect(
      apply({
        upserts: {
          area_type: {
            columns: ['id', 'name', 'hierarchy_type'],
            rows: [[id, 'Retired type', 'Administrative']],
          },
          area: {
            columns: ['id', 'area_type_id', 'code', 'name', 'valid_from', 'valid_to'],
            rows: [[id, id, 'E08000001', 'Retired area', '2010-01-01', '2024-01-01']],
          },
        },
      }),
    ).rejects.toThrow('area CSV is missing required columns: is_current');
    expect(await sql`SELECT id FROM area WHERE id = ${id}`).toEqual([]);
    expect(await sql`SELECT id FROM area_type WHERE id = ${id}`).toEqual([]);
    await assertRolledBack();
  });
  it('rejects a version header without is_locked rather than leave it unlocked', async () => {
    await baseline();
    const lockedAt = VERSION_COLUMNS.indexOf('is_locked');
    await expect(
      apply({
        upserts: {
          indicator_version: {
            columns: VERSION_COLUMNS.filter((_, index) => index !== lockedAt),
            rows: [VERSION_ROW.filter((_, index) => index !== lockedAt)],
          },
        },
      }),
    ).rejects.toThrow('indicator_version CSV is missing required columns: is_locked');
    await assertRolledBack();
  });
  it('refuses a published version whose is_locked is false', async () => {
    await baseline();
    const row = [...VERSION_ROW];
    row[VERSION_COLUMNS.indexOf('is_locked')] = 'f';
    await expect(
      apply({ upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } } }),
    ).rejects.toThrow('contains an unlocked published indicator version');
    await assertRolledBack();
  });
  it.each(
    [VERSION_COLUMNS.slice(0, -2), VERSION_COLUMNS.slice(0, -1)].map((columns) => ({ columns })),
  )('rejects a version header missing legacy source columns: %j', async ({ columns }) => {
    await baseline();
    await expect(
      apply({
        upserts: { indicator_version: { columns, rows: [VERSION_ROW.slice(0, columns.length)] } },
      }),
    ).rejects.toThrow('missing required columns:');
    await assertRolledBack();
  });
  it('refuses a mislabeled delete header and retains the target row', async () => {
    await baseline({
      upserts: { data_source: { columns: ['id', 'name'], rows: [[SOURCE_ID, 'Retained source']] } },
    });
    await expect(
      apply({ deletes: { data_source: [SOURCE_ID] }, deleteHeaders: { data_source: ['name'] } }),
    ).rejects.toThrow(
      'data_migration_delete_data_source CSV has columns the target table does not: name',
    );
    const [row] = await sql<
      { name: string }[]
    >`SELECT name FROM data_source WHERE id = ${SOURCE_ID}`;
    expect(row?.name).toBe('Retained source');
    await assertRolledBack();
  });
  it('refuses non-published source versions and rolls back the increment', async () => {
    await baseline();
    const row = [...VERSION_ROW];
    row[2] = 'draft';
    row[3] = null;
    await expect(
      apply({ upserts: { indicator_version: { columns: VERSION_COLUMNS, rows: [row] } } }),
    ).rejects.toThrow('contains a non-published indicator version');
    await assertRolledBack();
  });
});
