import { type Database, schema } from '@fphd/db';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { categoryKey, nameIndex, nameKey } from './data-table-names.ts';
import type { DataTableReferences } from './data-table-rows.ts';
import type { DataTableProblem } from './data-upload-contract.ts';
import { draftJoin, draftVersion } from './indicator-repository-sql.ts';

const { area, dimensionType, dimensionValue, indicator, noteType, uploadBatch } = schema;

// Sex and age have columns of their own, so a category never names them.
const SEX = nameKey('Sex');
const AGE = nameKey('Age');

export interface LatestDataUploadRow {
  id: string;
  status: 'processed' | 'failed';
  originalFilename: string;
  uploadedAt: Date;
  problems: DataTableProblem[];
}

export interface UploadDraftRow {
  id: string;
  isLocked: boolean;
}

/** The indicator's draft version, null without a draft, undefined with no indicator. */
export async function findUploadDraftVersion(
  db: Database,
  indicatorId: string,
): Promise<UploadDraftRow | null | undefined> {
  const [row] = await db
    .select({ id: draftVersion.id, isLocked: draftVersion.isLocked })
    .from(indicator)
    .leftJoin(draftVersion, draftJoin)
    .where(eq(indicator.id, indicatorId));

  if (row === undefined) return undefined;
  return row.id === null || row.isLocked === null ? null : { id: row.id, isLocked: row.isLocked };
}

/** The most recent upload to a draft that finished, whether it loaded or was refused. */
export async function getLatestDataUpload(
  db: Database,
  draftId: string,
): Promise<LatestDataUploadRow | undefined> {
  const [row] = await db
    .select({
      id: uploadBatch.id,
      status: uploadBatch.status,
      originalFilename: uploadBatch.originalFilename,
      uploadedAt: uploadBatch.uploadedAt,
      validationResult: uploadBatch.validationResult,
    })
    .from(uploadBatch)
    .where(
      and(
        eq(uploadBatch.indicatorVersionId, draftId),
        inArray(uploadBatch.status, ['processed', 'failed']),
      ),
    )
    .orderBy(desc(uploadBatch.uploadedAt), desc(uploadBatch.id))
    .limit(1);

  if (row === undefined) return undefined;

  const { validationResult, status, ...upload } = row;
  return {
    ...upload,
    status: status === 'failed' ? 'failed' : 'processed',
    problems: (validationResult as DataTableProblem[] | null) ?? [],
  };
}

/** Every code and name a data table can match, names keyed as the file's names are. */
export async function loadDataTableReferences(db: Database): Promise<DataTableReferences> {
  const [areas, values, notes] = await Promise.all([
    db.select({ code: area.code, id: area.id }).from(area).where(eq(area.isCurrent, true)),
    db
      .select({ type: dimensionType.name, name: dimensionValue.name, id: dimensionValue.id })
      .from(dimensionValue)
      .innerJoin(dimensionType, eq(dimensionType.id, dimensionValue.dimensionTypeId)),
    db.select({ text: noteType.text, id: noteType.id }).from(noteType),
  ]);

  const valuesOf = (type: string) => values.filter((value) => nameKey(value.type) === type);

  return {
    areaIds: new Map(areas.map(({ code, id }) => [code, id])),
    sexIds: nameIndex(valuesOf(SEX).map(({ name, id }) => [nameKey(name), id])),
    ageIds: nameIndex(valuesOf(AGE).map(({ name, id }) => [nameKey(name), id])),
    categoryIds: nameIndex(
      values
        .filter(({ type }) => nameKey(type) !== SEX && nameKey(type) !== AGE)
        .map(({ type, name, id }) => [categoryKey(type, name), id]),
    ),
    noteTypeIds: nameIndex(notes.map(({ text, id }) => [nameKey(text), id])),
  };
}
