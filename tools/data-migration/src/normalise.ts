import { DATA_MIGRATION_NULL } from '@fphd/db-operations/data-migration-contract';
import { slugify } from '@fphd/utils/slug';

import { NOTES_AND_CAVEATS_COLUMNS, notesAndCaveats } from './notes-and-caveats.ts';
import { plainTextFromHtml } from './plain-text.ts';

// Columns that hold HTML prose and must be stripped to plain text before the import.
// Does not include the answer columns (disclosure_control, caveats_needed, other_notes_needed)
// or the old Pholio source columns (disclosure_control, caveats, notes) — those are either
// structured answers or handled by expandNotesAndCaveats when present.
const proseColumns = new Set([
  'definition',
  'rationale',
  'methodology',
  'numerator_definition',
  'denominator_definition',
  'disclosure_control_detail',
  'caveats_detail',
  'other_notes_detail',
  'update_frequency_text',
]);

export const DISPLAY_GROUPS: Record<string, readonly [string, number]> = {
  'County unchanged': ['Local authorities', 1],
  'LA unchanged': ['Local authorities', 1],
  'UA unchanged': ['Local authorities', 1],
  'UA new 2020': ['Local authorities', 1],
  'UA new 2021': ['Local authorities', 1],
  'UA new 2023': ['Local authorities', 1],
  'Regions (statistical)': ['Statistical regions', 2],
  'NHS regions': ['NHS regions', 3],
  ICBs: ['Integrated care boards', 4],
  MSOA: ['Middle-layer super output areas', 5],
  GPs: ['GP practices', 6],
};

export function stripAreaName(name: string): string {
  return name
    .replace(/ region \(statistical\)$/, '')
    .replace(/ NHS Region$/, '')
    .replace(/^NHS (.+) Integrated Care Board - \w+$/, '$1')
    .replace(/ UA$/, '');
}

function hasLegacyProseCols(header: readonly string[]): boolean {
  return (
    header.includes('disclosure_control') &&
    !header.includes('disclosure_control_detail') &&
    header.includes('caveats') &&
    header.includes('notes')
  );
}

/**
 * Expands a legacy indicator_version header by replacing the three Pholio prose columns
 * (disclosure_control, caveats, notes) with the eight structured answer columns.
 */
export function expandLegacyVersionHeader(header: string[]): string[] {
  const dcIdx = header.indexOf('disclosure_control');
  return [
    ...header.slice(0, dcIdx),
    ...NOTES_AND_CAVEATS_COLUMNS,
    ...header.slice(dcIdx + 1).filter((col) => col !== 'caveats' && col !== 'notes'),
  ];
}

function expandNotesAndCaveats(row: string[], header: readonly string[]): string[] {
  const get = (col: string): string | null => {
    const idx = header.indexOf(col);
    const v = idx !== -1 ? row[idx] : undefined;
    if (v === '' || v === DATA_MIGRATION_NULL || v === undefined) return null;
    return v;
  };
  const answers = notesAndCaveats({
    disclosureControl: get('disclosure_control'),
    caveats: get('caveats'),
    notes: get('notes'),
  });
  // An unanswered question is a database null, which an empty string would not be.
  const answerValues = NOTES_AND_CAVEATS_COLUMNS.map((column) => {
    const value = answers[column];
    return value === null ? DATA_MIGRATION_NULL : String(value);
  });
  const dcIdx = header.indexOf('disclosure_control');
  const cavIdx = header.indexOf('caveats');
  const notesIdx = header.indexOf('notes');
  const dropIdxs = new Set([dcIdx, cavIdx, notesIdx]);
  return [
    ...row.slice(0, dcIdx),
    ...answerValues,
    ...row.filter((_, i) => i > dcIdx && !dropIdxs.has(i)),
  ];
}

export function normaliseRow(table: string, header: readonly string[], row: string[]): string[] {
  if (table === 'indicator_version') {
    const normalised = row.map((value, index) => {
      const column = header[index];
      return column && proseColumns.has(column) && value !== '' && value !== DATA_MIGRATION_NULL
        ? plainTextFromHtml(value)
        : value;
    });
    // Fill slug from name: inject it when missing, or fill it in-place when null/empty.
    const slugIndex = header.indexOf('slug');
    const nameForSlug = normalised[header.indexOf('name')] ?? '';
    const slugValue =
      nameForSlug && nameForSlug !== DATA_MIGRATION_NULL ? slugify(nameForSlug) : '';
    if (slugIndex === -1) {
      normalised.push(slugValue);
    } else if (!normalised[slugIndex] || normalised[slugIndex] === DATA_MIGRATION_NULL) {
      normalised[slugIndex] = slugValue;
    }
    // Legacy seed CSVs carry the old Pholio prose columns; translate them to the service's
    // structured answer columns so the row matches the current indicator_version schema.
    if (hasLegacyProseCols(header)) {
      return expandNotesAndCaveats(normalised, header);
    }
    return normalised;
  }
  if (table === 'area') {
    const index = header.indexOf('name');
    return row.map((value, position) => (position === index ? stripAreaName(value) : value));
  }
  if (table === 'area_type' && !header.includes('display_group')) {
    const name = row[header.indexOf('name')] ?? '';
    const [group, order] = DISPLAY_GROUPS[name] ?? [DATA_MIGRATION_NULL, DATA_MIGRATION_NULL];
    return [...row, group, String(order)];
  }
  return row;
}

export function normaliseHeader(table: string, header: string[]): string[] {
  if (table === 'area_type' && !header.includes('display_group'))
    return [...header, 'display_group', 'display_order'];
  if (table === 'indicator_version') {
    let result = header;
    if (hasLegacyProseCols(result)) result = expandLegacyVersionHeader(result);
    if (!result.includes('slug')) result = [...result, 'slug'];
    return result;
  }
  return header;
}
