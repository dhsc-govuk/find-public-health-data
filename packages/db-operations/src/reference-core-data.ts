import { readFileSync } from 'node:fs';

import { z } from '@fphd/config';
import { schema } from '@fphd/db';
import { SLUG_PATTERN } from '@fphd/utils/slug';
import { AGE_UNITS, STANDARD_DIMENSIONS } from '@fphd/utils/standard-dimension';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { toSnakeCase } from 'drizzle-orm/casing';
import type postgres from 'postgres';

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
const slug = z.string().regex(SLUG_PATTERN);
const ageValue = z.int().nonnegative().nullable();
const ageUnit = z.enum(AGE_UNITS).nullable();
const dimensionTypePublicRecord = z.object({
  id,
  standardDimension: z.enum(STANDARD_DIMENSIONS).nullable(),
  slug: slug.nullable(),
});
const dimensionValuePublicRecord = z.object({
  id,
  slug,
  ageFromValue: ageValue,
  ageFromUnit: ageUnit,
  ageUnderValue: ageValue,
  ageUnderUnit: ageUnit,
  deprivationGroup: z.int().min(1).max(10).nullable(),
});
const deprivationSchemeRecord = z.object({
  id,
  release: name,
  ranked: name,
  within: z.enum(schema.DEPRIVATION_WITHIN),
  boundaries: name.nullable(),
  groups: z.union([z.literal(5), z.literal(10)]),
});
const areaLevelRecord = z.object({
  id,
  slug,
  name,
  hierarchy: z.enum(schema.AREA_LEVEL_HIERARCHIES).nullable(),
  displayOrder: z.int(),
  parentLevels: z.array(slug),
  // The names are there for a reviewer: the import checks they match the ids, and loads the ids.
  areaTypes: z.array(name).min(1),
  areaTypeIds: z.array(id).min(1),
});
const noteTypePublicRecord = z.object({ id, code: z.string().regex(/^n\d+$/) });
const noteTypeRecord = z.object({
  id,
  text: name,
  category: z.enum(schema.NOTE_TYPE_CATEGORIES),
});

export const referenceDataSchema = z.object({
  areaTypes: z.array(areaTypeRecord),
  dimensionTypes: z.array(dimensionTypeRecord),
  dimensionValues: z.array(dimensionValueRecord),
  dimensionTypesPublic: z.array(dimensionTypePublicRecord),
  dimensionValuesPublic: z.array(dimensionValuePublicRecord),
  deprivationSchemes: z.array(deprivationSchemeRecord),
  areaLevels: z.array(areaLevelRecord),
  noteTypes: z.array(noteTypeRecord),
  noteTypesPublic: z.array(noteTypePublicRecord),
});

export type ReferenceData = z.infer<typeof referenceDataSchema>;
export type ReferenceCoreDataImport = Record<
  keyof ReferenceData,
  {
    summary: UpsertSummary;
    orphaned: { id: string; name: string }[];
  }
>;

// In foreign-key order. `label` names the column the orphan report shows.
const lists = {
  areaTypes: { file: 'area-types.json', table: schema.areaType, label: 'name' },
  dimensionTypes: { file: 'dimension-types.json', table: schema.dimensionType, label: 'name' },
  dimensionValues: { file: 'dimension-values.json', table: schema.dimensionValue, label: 'name' },
  dimensionTypesPublic: {
    file: 'dimension-types-public.json',
    table: schema.dimensionTypePublic,
    label: 'slug',
  },
  dimensionValuesPublic: {
    file: 'dimension-values-public.json',
    table: schema.dimensionValuePublic,
    label: 'slug',
  },
  deprivationSchemes: {
    file: 'deprivation-schemes.json',
    table: schema.deprivationScheme,
    label: 'release',
  },
  areaLevels: { file: 'area-levels.json', table: schema.areaLevel, label: 'slug' },
  noteTypes: { file: 'note-types.json', table: schema.noteType, label: 'text' },
  noteTypesPublic: { file: 'note-types-public.json', table: schema.noteTypePublic, label: 'code' },
} as const;

// The public names describe rows of their own lists, so they share those rows' ids.
const publicNameOwners = [
  ['dimensionTypesPublic', 'dimensionTypes'],
  ['deprivationSchemes', 'dimensionTypes'],
  ['dimensionValuesPublic', 'dimensionValues'],
  ['noteTypesPublic', 'noteTypes'],
] as const;

export function parseReferenceData(data: unknown): ReferenceData {
  const records = referenceDataSchema.parse(data);
  for (const [list, rows] of Object.entries(records)) {
    const names = rows.flatMap((row) =>
      'text' in row
        ? [row.text]
        : 'dimensionTypeId' in row
          ? [`${row.dimensionTypeId}:${row.name}`]
          : 'name' in row
            ? [row.name]
            : [],
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
  const areaTypeNames = new Map(records.areaTypes.map(({ id, name }) => [id, name]));
  const levelSlugs = new Set(records.areaLevels.map(({ slug }) => slug));
  for (const level of records.areaLevels) {
    const names = level.areaTypeIds.map((typeId) => areaTypeNames.get(typeId));
    if (names.join('\n') !== level.areaTypes.join('\n')) {
      throw new Error(
        `Area level ${level.slug} names area types its ids don't: ${names.join(', ')}`,
      );
    }
    const unknown = level.parentLevels.filter((parent) => !levelSlugs.has(parent));
    if (unknown.length > 0) {
      throw new Error(`Area level ${level.slug} names unknown parents: ${unknown.join(', ')}`);
    }
  }
  for (const [list, owner] of publicNameOwners) {
    const owners = new Set(records[owner].map(({ id }) => id));
    for (const row of records[list]) {
      if (!owners.has(row.id)) throw new Error(`${list} entry ${row.id} names no ${owner} entry`);
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
      const rows = await tx.unsafe<{ id: string; wasInsert: boolean }[]>(
        `
        INSERT INTO "${tableName}" (${columnList})
        SELECT ${columnList} FROM jsonb_populate_recordset(NULL::"${tableName}", $1::text::jsonb)
        ON CONFLICT (id) DO UPDATE SET ${assignments}
        WHERE (${oldFields}) IS DISTINCT FROM (${newFields})
        RETURNING id, xmax = 0 AS "wasInsert"
      `,
        [JSON.stringify(payload)],
      );
      const labelColumn = lists[key].label;
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
