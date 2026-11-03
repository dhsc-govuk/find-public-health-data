import { readFileSync } from 'node:fs';

import { z } from '@fphd/config';
import { schema } from '@fphd/db';
import { recordAudit } from '@fphd/db/audit-log';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { toSnakeCase } from 'drizzle-orm/casing';
import type postgres from 'postgres';

import { CORE_DATA_IMPORT, upsertEntries } from './core-data-audit.ts';
import { findDuplicates } from './parse-topics-file.ts';
import { summarizeUpsert, type UpsertSummary } from './topic-import.ts';

const id = z.uuidv7();
const name = z.string().regex(/\S/, 'Expected a non-blank reference label');

const areaTypeRecord = z.object({
  id,
  name,
  hierarchyType: z.enum(schema.AREA_HIERARCHY_TYPES),
  level: z.int(),
  displayGroup: name.nullable(),
  displayOrder: z.int().nullable(),
});
const dimensionTypeRecord = z.object({
  id,
  name,
  dimensionClass: z.enum(schema.DIMENSION_CLASSES),
  classificationScheme: name.nullable(),
  granularity: name.nullable(),
  schemeVersion: name.nullable(),
  isRequired: z.boolean(),
});
const dimensionValueRecord = z.object({
  id,
  dimensionTypeId: id,
  parentId: id.nullable(),
  name,
  code: name.nullable(),
  sortOrder: z.int(),
  isAggregate: z.boolean(),
});
const noteTypeRecord = z.object({
  id,
  text: name,
  category: z.enum(schema.NOTE_TYPE_CATEGORIES),
});

export const referenceDataSchema = z.object({
  areaTypes: z.array(areaTypeRecord),
  dimensionTypes: z.array(dimensionTypeRecord),
  dimensionValues: z.array(dimensionValueRecord),
  noteTypes: z.array(noteTypeRecord),
});

export type ReferenceData = z.infer<typeof referenceDataSchema>;
export type ReferenceCoreDataImport = Record<
  keyof ReferenceData,
  {
    summary: UpsertSummary;
    orphaned: { id: string; name: string }[];
  }
>;

const lists = {
  areaTypes: { file: 'area-types.json', table: schema.areaType },
  dimensionTypes: { file: 'dimension-types.json', table: schema.dimensionType },
  dimensionValues: { file: 'dimension-values.json', table: schema.dimensionValue },
  noteTypes: { file: 'note-types.json', table: schema.noteType },
} as const;

export function parseReferenceData(data: unknown): ReferenceData {
  const records = referenceDataSchema.parse(data);
  for (const [list, rows] of Object.entries(records)) {
    const names = rows.map((row) =>
      'text' in row
        ? row.text
        : 'dimensionTypeId' in row
          ? `${row.dimensionTypeId}:${row.name}`
          : row.name,
    );
    const duplicates = [...findDuplicates(rows.map(({ id }) => id)), ...findDuplicates(names)];
    if (duplicates.length > 0) {
      throw new Error(`Duplicate ${list} entries: ${duplicates.join(', ')}`);
    }
  }
  const typeIds = new Set(records.dimensionTypes.map(({ id }) => id));
  const valueTypes = new Map(
    records.dimensionValues.map(({ id, dimensionTypeId }) => [id, dimensionTypeId]),
  );
  for (const value of records.dimensionValues) {
    if (!typeIds.has(value.dimensionTypeId)) {
      throw new Error(`Dimension value ${value.id} names an unknown dimension type`);
    }
    if (value.parentId !== null && !valueTypes.has(value.parentId)) {
      throw new Error(`Dimension value ${value.id} names an unknown parent`);
    }
  }
  return records;
}

export function readReferenceData(): ReferenceData {
  return parseReferenceData(
    Object.fromEntries(
      Object.entries(lists).map(([key, { file }]) => [
        key,
        JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8')),
      ]),
    ),
  );
}

export async function importReferenceCoreData(
  sql: postgres.Sql,
  records: ReferenceData,
): Promise<ReferenceCoreDataImport> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('fphd-data-migration'))`;
    const results = {} as ReferenceCoreDataImport;
    for (const key of Object.keys(lists) as (keyof typeof lists)[]) {
      const { table } = lists[key];
      const tableName = getTableName(table);
      const columns = Object.keys(getTableColumns(table)).map(toSnakeCase);
      const columnList = columns.map((column) => `"${column}"`).join(', ');
      const fields = columns.filter((column) => column !== 'id');
      const assignments = fields.map((column) => `"${column}" = excluded."${column}"`).join(', ');
      const oldFields = fields.map((column) => `"${tableName}"."${column}"`).join(', ');
      const newFields = fields.map((column) => `excluded."${column}"`).join(', ');
      const payload = records[key].map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([field, value]) => [toSnakeCase(field), value]),
        ),
      );
      const rows = await tx.unsafe<
        {
          id: string;
          wasInsert: boolean;
          before: Record<string, unknown> | null;
          after: Record<string, unknown>;
        }[]
      >(
        `
        INSERT INTO "${tableName}" (${columnList})
        SELECT ${columnList} FROM jsonb_populate_recordset(NULL::"${tableName}", $1::text::jsonb)
        ON CONFLICT (id) DO UPDATE SET ${assignments}
        WHERE (${oldFields}) IS DISTINCT FROM (${newFields})
        RETURNING id, xmax = 0 AS "wasInsert", to_jsonb(old) AS before, to_jsonb(new) AS after
      `,
        [JSON.stringify(payload)],
      );
      await recordAudit(tx, CORE_DATA_IMPORT, upsertEntries(table, rows));
      const labelColumn = key === 'noteTypes' ? 'text' : 'name';
      const orphaned = await tx.unsafe<{ id: string; name: string }[]>(
        `
        SELECT id, "${labelColumn}" AS name FROM "${tableName}"
        WHERE NOT (id = ANY($1::uuid[])) ORDER BY id
      `,
        [records[key].map(({ id }) => id)],
      );
      results[key] = { summary: summarizeUpsert(records[key].length, rows), orphaned };
      await tx.unsafe(`ANALYZE "${tableName}"`);
    }
    return results;
  });
}

export async function assertReferenceCoreDataPresent(sql: postgres.Sql): Promise<void> {
  const records = readReferenceData();
  for (const key of Object.keys(lists) as (keyof typeof lists)[]) {
    const table = getTableName(lists[key].table);
    const [row] = await sql.unsafe<{ count: number }[]>(
      `
      SELECT count(*)::int AS count FROM "${table}" WHERE id = ANY($1::uuid[])
    `,
      [records[key].map(({ id }) => id)],
    );
    if (row?.count !== records[key].length) {
      throw new Error(`${table} core data is incomplete — run \`db import-core-data\``);
    }
  }
}
