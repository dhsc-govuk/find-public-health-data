import { tidyName } from '@fphd/utils/tidy-name';

import type { PholioSource } from './context.ts';
import { MASKED_SOURCE_NOTE_IDS } from './note-suppression.ts';
import { queryPholio } from './source.ts';
import { TableWriter } from './table-writer.ts';

const QUALITY_NOTES = new Set([
  'Extreme outlier suppressed for data presentation purposes',
  'Value suppressed as denominator age group count is too small to produce a reliable DSR',
  'Value suppressed as sample size was too small to produce a reliable estimate',
  'Value suppressed due to incompleteness of source data',
]);

export function noteCategory(text: string | null): string {
  if (!text) return 'contextual';
  if (QUALITY_NOTES.has(tidyName(text))) return 'quality';
  const t = text.toLowerCase();
  if (/boundar|geograph|merg|area.*change|reconfig/.test(t)) return 'geographic';
  if (/suppress|disclosure|small number/.test(t)) return 'disclosure';
  if (/estimat|aggregat|model/.test(t)) return 'estimation';
  if (/quality|reliab|caution/.test(t)) return 'quality';
  if (/method|definition|calculation/.test(t)) return 'methodological';
  if (/not available|no data|missing/.test(t)) return 'missing';
  return 'contextual';
}

/** Exports ci_method, comparator_method, data_source, numerator_denominator_source and note_type from Pholio. */
export async function exportLookups(context: PholioSource) {
  const { pool, outDir } = context;

  await using ciMethodWriter = new TableWriter(outDir, 'ci_method');
  await using comparatorMethodWriter = new TableWriter(outDir, 'comparator_method');
  await using dataSourceWriter = new TableWriter(outDir, 'data_source');
  await using numDenSourceWriter = new TableWriter(outDir, 'numerator_denominator_source');

  const ciMethodRows = await queryPholio<{
    CIMethodID: number;
    Name: string;
    Description: string | null;
  }>(pool, 'SELECT CIMethodID, Name, Description FROM L_CIMethods');
  await ciMethodWriter.writeAll(
    ciMethodRows.map((r) => ({ id: r.CIMethodID, name: r.Name, description: r.Description })),
  );

  const comparatorRows = await queryPholio<{
    ComparatorMethodID: number;
    ComparatorMethod: string;
  }>(
    pool,
    // -1 is Pholio's "No comparison" placeholder; a version without a comparator has none.
    'SELECT ComparatorMethodID, ComparatorMethod FROM L_ComparatorMethods WHERE ComparatorMethodID != -1',
  );
  const existingComparatorIds = new Set(comparatorRows.map((r) => r.ComparatorMethodID));
  const gapFillRows = await queryPholio<{ ComparatorMethodID: number }>(
    pool,
    `SELECT DISTINCT ComparatorMethodID
     FROM [grouping]
     WHERE ComparatorMethodID IS NOT NULL AND ComparatorMethodID != -1`,
  );
  const gapFill = gapFillRows
    .map((r) => r.ComparatorMethodID)
    .filter((id) => !existingComparatorIds.has(id))
    .map((id) => ({ id, name: `Legacy comparator method ${id}` }));
  await comparatorMethodWriter.writeAll([
    ...comparatorRows.map((row) => ({ id: row.ComparatorMethodID, name: row.ComparatorMethod })),
    ...gapFill,
  ]);

  // data_source: id, name (from ISNULL(DataSourceDesc, 'Unknown')), url always null
  const dataSourceRows = await queryPholio<{
    DataSourceID: number;
    DataSourceDesc: string | null;
  }>(pool, 'SELECT DataSourceID, DataSourceDesc FROM L_DataSources');
  await dataSourceWriter.writeAll(
    dataSourceRows.map((r) => ({
      id: r.DataSourceID,
      name: r.DataSourceDesc ?? 'Unknown',
      url: null,
    })),
  );

  const numDenRows = await queryPholio<{
    NumDenSourceID: number;
    NumDenSourceDesc: string | null;
    NumDenLink: string | null;
  }>(pool, 'SELECT NumDenSourceID, NumDenSourceDesc, NumDenLink FROM L_NumDenSources');
  await numDenSourceWriter.writeAll(
    numDenRows.map((r) => ({
      id: r.NumDenSourceID,
      name: r.NumDenSourceDesc ?? 'Unknown',
      url: r.NumDenLink,
    })),
  );

  const { file, noteTypeCategory } = await exportNoteTypes(context);

  return {
    noteTypeCategory,
    tables: {
      ci_method: await ciMethodWriter.close(),
      comparator_method: await comparatorMethodWriter.close(),
      data_source: await dataSourceWriter.close(),
      numerator_denominator_source: await numDenSourceWriter.close(),
      note_type: file,
    },
  };
}

export async function exportNoteTypes({ pool, outDir }: PholioSource) {
  await using noteTypeWriter = new TableWriter(outDir, 'note_type');
  const noteTypeCategory = new Map<number, string>();
  // note_type: exclude ValueNoteID 0 (no note) and 506 (Fingertips placeholder)
  const noteTypeRows = await queryPholio<{ ValueNoteID: number; Text: string | null }>(
    pool,
    `SELECT ValueNoteID, Text FROM L_ValueNotes WHERE ValueNoteID != 0 AND ValueNoteID != 506`,
  );
  await noteTypeWriter.writeAll(
    noteTypeRows.map((r) => {
      const category = noteCategory(r.Text);
      if (category === 'disclosure' && !MASKED_SOURCE_NOTE_IDS.has(r.ValueNoteID))
        throw new Error(
          `Source note ${r.ValueNoteID} requires review of its numeric masking policy`,
        );
      noteTypeCategory.set(r.ValueNoteID, category);
      return { id: r.ValueNoteID, text: r.Text, category };
    }),
  );

  return { file: await noteTypeWriter.close(), noteTypeCategory };
}
