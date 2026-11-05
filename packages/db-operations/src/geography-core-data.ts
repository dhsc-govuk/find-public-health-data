import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from '@fphd/config';
import { schema } from '@fphd/db';
import { getTableColumns } from 'drizzle-orm';
import { toSnakeCase } from 'drizzle-orm/casing';
import type postgres from 'postgres';

import { copyInto, quoteIdentifiers } from './data-migration-copy.ts';
import { validateMigrationHeader } from './data-migration-header.ts';
import type { UpsertSummary } from './topic-import.ts';

const directory = fileURLToPath(new URL('../data/geography/', import.meta.url));
const fileSchema = z.object({
  file: z.string(),
  rows: z.int().nonnegative(),
  bytes: z.int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const manifestSchema = z.object({
  files: z.object({ area: fileSchema, area_relationship: fileSchema }),
});
export type GeographyManifest = z.infer<typeof manifestSchema>;
export type GeographyCoreDataImport = Record<
  'area' | 'area_relationship',
  {
    summary: UpsertSummary;
    orphaned: number;
  }
>;

export function readGeographyManifest(): GeographyManifest {
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(`${directory}/manifest.json`, 'utf8')),
  );
  for (const table of ['area', 'area_relationship'] as const) {
    const file = manifest.files[table];
    if (file.file !== `${table}.csv.gz`)
      throw new Error(`Unexpected core geography file for ${table}`);
    const bytes = readFileSync(`${directory}/${file.file}`);
    if (
      bytes.length !== file.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== file.sha256
    ) {
      throw new Error(`Core geography integrity check failed for ${table}`);
    }
  }
  return manifest;
}

async function stageGeography(
  tx: postgres.TransactionSql,
  manifest: GeographyManifest,
): Promise<void> {
  for (const table of ['area', 'area_relationship'] as const) {
    const file = manifest.files[table];
    const path = `${directory}/${file.file}`;
    const { rawHeader } = await validateMigrationHeader(tx, table, path);
    const stage = `core_source_${table}`;
    await tx.unsafe(
      `CREATE TEMP TABLE "${stage}" (LIKE "${table}" INCLUDING DEFAULTS) ON COMMIT DROP`,
    );
    await copyInto(
      tx,
      stage,
      rawHeader,
      path,
      `staging core ${table}`,
      { table, phase: 'upsert' },
      () => {},
    );
    const [loaded] = await tx.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "${stage}"`,
    );
    if (loaded?.count !== file.rows)
      throw new Error(`Core geography row count failed for ${table}`);
    await tx.unsafe(`ALTER TABLE "${stage}" ADD PRIMARY KEY (id)`);
  }
  await tx`CREATE UNIQUE INDEX ON core_source_area (code, area_type_id)`;
  await tx`CREATE UNIQUE INDEX ON core_source_area_relationship (parent_area_id, child_area_id)`;
  await tx`ANALYZE core_source_area, core_source_area_relationship`;
  const ambiguous = await tx<{ code: string }[]>`
    SELECT a.code FROM area a JOIN core_source_area source
      ON source.code = a.code AND source.area_type_id = a.area_type_id
    GROUP BY a.code, a.area_type_id HAVING count(*) > 1 ORDER BY a.code LIMIT 20
  `;
  if (ambiguous.length > 0) {
    throw new Error(
      `Core geography matches multiple area versions: ${ambiguous.map(({ code }) => code).join(', ')}`,
    );
  }
}

async function upsertGeography(
  tx: postgres.TransactionSql,
  table: 'area' | 'area_relationship',
  expected: number,
): Promise<GeographyCoreDataImport['area']> {
  const definition = table === 'area' ? schema.area : schema.areaRelationship;
  const fields = Object.keys(getTableColumns(definition));
  const columns = fields.map(toSnakeCase);
  const matching =
    table === 'area'
      ? 'existing.code = source.code AND existing.area_type_id = source.area_type_id'
      : 'existing.parent_area_id = source.parent_area_id AND existing.child_area_id = source.child_area_id';
  const assignments = columns
    .filter((column) => column !== 'id')
    .map((column) => `"${column}" = excluded."${column}"`)
    .join(', ');
  const old = columns
    .filter((column) => column !== 'id')
    .map((column) => `"${table}"."${column}"`)
    .join(', ');
  const incoming = columns
    .filter((column) => column !== 'id')
    .map((column) => `excluded."${column}"`)
    .join(', ');
  const existingFields = columns
    .filter((column) => column !== 'id')
    .map((column) => `existing."${column}"`)
    .join(', ');
  const sourceFields = columns
    .filter((column) => column !== 'id')
    .map((column) => `source."${column}"`)
    .join(', ');
  const selected = columns
    .map((column) => (column === 'id' ? 'coalesce(existing.id, source.id)' : `source."${column}"`))
    .join(', ');
  const [changed] = await tx.unsafe<{ inserted: number; updated: number }[]>(
    `
    WITH changed AS (
      INSERT INTO "${table}" (${quoteIdentifiers(columns)})
      SELECT ${selected} FROM core_source_${table} source
      LEFT JOIN "${table}" existing ON ${matching}
      WHERE existing.id IS NULL OR (${existingFields}) IS DISTINCT FROM (${sourceFields})
      ON CONFLICT (id) DO UPDATE SET ${assignments}
      WHERE (${old}) IS DISTINCT FROM (${incoming})
      RETURNING xmax = 0 AS was_insert
    )
    SELECT count(*) FILTER (WHERE was_insert)::int AS inserted,
      count(*) FILTER (WHERE NOT was_insert)::int AS updated FROM changed
  `,
  );
  if (!changed) throw new Error(`No core geography result for ${table}`);
  const [orphaned] = await tx.unsafe<{ count: number }[]>(`
    SELECT count(*)::int AS count FROM "${table}" existing
    WHERE NOT EXISTS (SELECT 1 FROM core_source_${table} source WHERE ${matching})
  `);
  return {
    summary: { ...changed, unchanged: expected - changed.inserted - changed.updated },
    orphaned: orphaned?.count ?? 0,
  };
}

export async function importGeographyCoreData(
  sql: postgres.Sql,
  manifest: GeographyManifest,
): Promise<GeographyCoreDataImport> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('fphd-data-migration'))`;
    await stageGeography(tx, manifest);
    const area = await upsertGeography(tx, 'area', manifest.files.area.rows);
    await tx`
      CREATE TEMP TABLE core_area_map ON COMMIT DROP AS
      SELECT source.id AS source_id, core.id AS core_id FROM core_source_area source
      JOIN area core ON core.code = source.code AND core.area_type_id = source.area_type_id
    `;
    await tx`ALTER TABLE core_area_map ADD PRIMARY KEY (source_id)`;
    await tx`
      UPDATE core_source_area_relationship relationship
      SET parent_area_id = parent.core_id, child_area_id = child.core_id
      FROM core_area_map parent, core_area_map child
      WHERE parent.source_id = relationship.parent_area_id AND child.source_id = relationship.child_area_id
    `;
    const ambiguous = await tx<{ parent: string }[]>`
      SELECT relationship.parent_area_id::text AS parent FROM area_relationship relationship
      JOIN core_source_area_relationship source ON source.parent_area_id = relationship.parent_area_id
        AND source.child_area_id = relationship.child_area_id
      GROUP BY relationship.parent_area_id, relationship.child_area_id HAVING count(*) > 1
      ORDER BY relationship.parent_area_id LIMIT 20
    `;
    if (ambiguous.length > 0)
      throw new Error('Core geography matches multiple relationship versions');
    const areaRelationship = await upsertGeography(
      tx,
      'area_relationship',
      manifest.files.area_relationship.rows,
    );
    await tx`ANALYZE area, area_relationship`;
    return { area, area_relationship: areaRelationship };
  });
}
