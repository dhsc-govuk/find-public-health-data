import { type Database, schema } from '@fphd/db';
import { type Actor, changesBetween, recordAudit } from '@fphd/db/audit-log';
import { type PublicYearType, publicYearType } from '@fphd/utils/period-type';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import type { DataTableRow } from './data-table-check-contract.ts';
import { columnsOf, type DataTableColumn } from './data-table-columns.ts';
import { nameKey } from './data-table-names.ts';
import { draftJoin, draftVersion } from './indicator-repository-sql.ts';
import { clearFlag } from './review-flag-repository.ts';

const {
  area,
  dimensionType,
  dimensionValue,
  indicator,
  indicatorVersion,
  isUnpublished,
  noteType,
  observation,
  observationDimension,
  observationNote,
  uploadBatch,
} = schema;

const SEX = nameKey('Sex');
const AGE = nameKey('Age');

/** The draft's current upload, with the details the check page needs. */
export interface DraftDataTableRow {
  batchId: string;
  columns: DataTableColumn[];
  rowCount: number;
  yearType: PublicYearType | null;
}

export type FindDraftDataTableResult =
  | { found: true; dataTable: DraftDataTableRow | null }
  | { found: false; reason: 'not_found' | 'no_draft' | 'locked' };

/** The current upload of the indicator's draft, or null if no file has been uploaded yet. */
export async function findDraftDataTable(
  db: Database,
  indicatorId: string,
): Promise<FindDraftDataTableResult> {
  const [row] = await db
    .select({
      draftId: draftVersion.id,
      draftLocked: draftVersion.isLocked,
      batchId: uploadBatch.id,
      columnNames: uploadBatch.columnNames,
      rowCount: uploadBatch.rowCount,
      yearType: draftVersion.yearType,
      yearEndDay: draftVersion.yearEndDay,
      yearEndMonth: draftVersion.yearEndMonth,
    })
    .from(indicator)
    .leftJoin(draftVersion, draftJoin)
    .leftJoin(uploadBatch, eq(uploadBatch.id, draftVersion.uploadBatchId))
    .where(eq(indicator.id, indicatorId));

  if (row === undefined) return { found: false, reason: 'not_found' };
  if (row.draftId === null) return { found: false, reason: 'no_draft' };
  if (row.draftLocked) return { found: false, reason: 'locked' };
  if (row.batchId === null) return { found: true, dataTable: null };

  const { yearType, yearEndDay, yearEndMonth } = row;
  return {
    found: true,
    dataTable: {
      batchId: row.batchId,
      columns: columnsOf(row.columnNames ?? []),
      rowCount: row.rowCount ?? 0,
      yearType:
        yearType === null
          ? null
          : publicYearType(
              yearType,
              yearEndDay === null || yearEndMonth === null
                ? null
                : { day: yearEndDay, month: yearEndMonth },
            ),
    },
  };
}

/**
 * One page of a batch's rows, sorted by area, dates and dimension key. The query counts through
 * the index from whichever end of the batch is nearer, so it never skips more than half the rows.
 * Until the batch has been vacuumed, each skipped row is also read from the table, so the middle
 * pages of a new upload are several times slower.
 */
export async function listDataTableRows(
  db: Database,
  { batchId, rowCount }: Pick<DraftDataTableRow, 'batchId' | 'rowCount'>,
  page: number,
  rowsPerPage: number,
): Promise<DataTableRow[]> {
  const start = (page - 1) * rowsPerPage;
  const fromEnd = start > rowCount / 2;
  const order = fromEnd ? desc : asc;
  const key = db
    .select({
      areaId: observation.areaId,
      fromDate: observation.fromDate,
      toDate: observation.toDate,
      dimensionKey: observation.dimensionKey,
    })
    .from(observation)
    .where(eq(observation.uploadBatchId, batchId))
    .orderBy(
      order(observation.areaId),
      order(observation.fromDate),
      order(observation.toDate),
      order(observation.dimensionKey),
    )
    .limit(fromEnd ? Math.min(rowsPerPage, rowCount - start) : rowsPerPage)
    .offset(fromEnd ? Math.max(0, rowCount - start - rowsPerPage) : start)
    .as('page_key');

  const rows = await db
    .select({
      id: observation.id,
      areaCode: area.code,
      fromDate: observation.fromDate,
      toDate: observation.toDate,
      dimensionKey: observation.dimensionKey,
      value: observation.value,
      count: observation.count,
      numerator: observation.numerator,
      denominator: observation.denominator,
      lowerCi95: observation.lowerCi95,
      upperCi95: observation.upperCi95,
      lowerCi998: observation.lowerCi998,
      upperCi998: observation.upperCi998,
    })
    .from(key)
    .innerJoin(
      observation,
      and(
        eq(observation.uploadBatchId, batchId),
        eq(observation.areaId, key.areaId),
        eq(observation.fromDate, key.fromDate),
        eq(observation.toDate, key.toDate),
        eq(observation.dimensionKey, key.dimensionKey),
      ),
    )
    .innerJoin(area, eq(area.id, observation.areaId))
    .orderBy(asc(key.areaId), asc(key.fromDate), asc(key.toDate), asc(key.dimensionKey));

  if (rows.length === 0) return [];

  const ids = rows.map(({ id }) => id);
  const [dimensions, notes] = await Promise.all([
    db
      .select({
        observationId: observationDimension.observationId,
        type: dimensionType.name,
        name: dimensionValue.name,
      })
      .from(observationDimension)
      .innerJoin(dimensionValue, eq(dimensionValue.id, observationDimension.dimensionValueId))
      .innerJoin(dimensionType, eq(dimensionType.id, observationDimension.dimensionTypeId))
      .where(inArray(observationDimension.observationId, ids)),
    db
      .select({ observationId: observationNote.observationId, text: noteType.text })
      .from(observationNote)
      .innerJoin(noteType, eq(noteType.id, observationNote.noteTypeId))
      .where(inArray(observationNote.observationId, ids))
      .orderBy(asc(noteType.text)),
  ]);

  return rows.map(({ id, ...row }) => {
    const own = dimensions.filter(({ observationId }) => observationId === id);
    const nameOf = (type: string) => own.find((d) => nameKey(d.type) === type)?.name ?? null;
    const category = own.find((d) => nameKey(d.type) !== SEX && nameKey(d.type) !== AGE);
    return {
      ...row,
      sex: nameOf(SEX),
      age: nameOf(AGE),
      categoryType: category?.type ?? null,
      category: category?.name ?? null,
      valueNotes: notes.filter(({ observationId }) => observationId === id).map(({ text }) => text),
    };
  });
}

export type ConfirmDataTableResult =
  | { ok: true; confirmedAt: Date }
  | { ok: false; reason: 'not_found' | 'no_draft' | 'locked' | 'data_table_changed' };

/**
 * Records that the publisher has checked the draft's data table. It only succeeds if the draft
 * still uses the batch they were shown, so a newer upload, a lock or publication stops it. It
 * clears the data table's flag a review response left; an upload does not, since it unconfirms.
 */
export async function confirmDataTable(
  db: Database,
  indicatorId: string,
  batchId: string,
  actor: Actor,
): Promise<ConfirmDataTableResult> {
  const confirmedAt = await db.transaction(async (tx) => {
    const [confirmed] = await tx
      .update(indicatorVersion)
      .set({ dataTableConfirmedAt: sql`now()`, updatedAt: sql`now()`, updatedBy: actor.userId })
      .where(
        and(
          eq(indicatorVersion.indicatorId, indicatorId),
          isUnpublished(indicatorVersion.status),
          eq(indicatorVersion.isLocked, false),
          eq(indicatorVersion.uploadBatchId, batchId),
        ),
      )
      .returning({
        id: indicatorVersion.id,
        before: sql`old.data_table_confirmed_at`.mapWith(indicatorVersion.dataTableConfirmedAt),
        after: indicatorVersion.dataTableConfirmedAt,
      });

    if (!confirmed?.after) return undefined;

    await recordAudit(tx, actor, [
      {
        action: 'indicator.data_table_confirmed',
        entityId: indicatorId,
        changes: {
          ...changesBetween(
            { dataTableConfirmedAt: confirmed.before },
            { dataTableConfirmedAt: confirmed.after },
          ),
          ...(await clearFlag(tx, confirmed.id, 'data-table', actor)),
        },
      },
    ]);
    return confirmed.after;
  });

  if (confirmedAt) return { ok: true, confirmedAt };

  const found = await findDraftDataTable(db, indicatorId);
  return { ok: false, reason: found.found ? 'data_table_changed' : found.reason };
}
