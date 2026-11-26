import { z } from '@fphd/config/zod';
import { tidyName } from '@fphd/utils/tidy-name';

import type { DataTableColumn, Header } from './data-table-columns.ts';
import { AMBIGUOUS, categoryKey, type NameIndex, nameKey } from './data-table-names.ts';
import type { DataTableFinding } from './data-table-problems.ts';

/** The reference data a row's codes and names are matched to, names by `nameKey`. */
export interface DataTableReferences {
  /** The current area for each code. */
  areaIds: ReadonlyMap<string, string>;
  sexIds: NameIndex;
  ageIds: NameIndex;
  /** The values of every dimension type but sex and age, by `categoryKey`. */
  categoryIds: NameIndex;
  noteTypeIds: NameIndex;
}

const NUMBER_COLUMNS = [
  'value',
  'count',
  'numerator',
  'denominator',
  'lower_ci_95',
  'upper_ci_95',
  'lower_ci_998',
  'upper_ci_998',
] as const satisfies readonly DataTableColumn[];

type NumberColumn = (typeof NUMBER_COLUMNS)[number];

/** A row as it is loaded: ids for what it names, and its numbers as written, null when empty. */
export type DataTableRow = Record<NumberColumn, string | null> & {
  /** The file's line number, which a spreadsheet shows as the row number. */
  line: number;
  areaId: string;
  fromDate: string;
  toDate: string;
  sexId: string | null;
  ageId: string | null;
  categoryId: string | null;
  noteTypeId: string | null;
};

export type RowReading =
  | { ok: true; row: DataTableRow }
  | { ok: false; findings: DataTableFinding[] };

/** The sex a file names a total by, which is stored without the dimension, as an empty cell is. */
export const ALL_SEXES_NAME = 'Persons';
/** The age a file names a total by, which is stored without the dimension, as an empty cell is. */
export const ALL_AGES_NAME = 'All ages';

const ALL_SEXES = nameKey(ALL_SEXES_NAME);
const ALL_AGES = nameKey(ALL_AGES_NAME);

// The cells a row cannot do without, in the columns the header has.
const REQUIRED_CELLS = [
  'area_code',
  'period_start',
  'period_end',
] as const satisfies readonly DataTableColumn[];

const NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
// YYYY-MM-DD and a real calendar date, month lengths and leap years included.
const ISO_DATE = z.iso.date();

/**
 * Digits with an optional minus sign, decimal part and exponent, that a double precision column
 * can hold: finite, and not so small it reads as zero unless it is written as zero.
 */
export function isStorableNumber(text: string): boolean {
  if (!NUMBER.test(text)) return false;
  const number = Number(text);
  const writtenAsZero = !/[1-9]/.test(text.replace(/[eE].*$/, ''));
  return Number.isFinite(number) && (number !== 0 || writtenAsZero);
}

/** A date a period can have: ISO and real, and from year 1, as Postgres has no year 0. */
function isStorableDate(text: string): boolean {
  return ISO_DATE.safeParse(text).success && !text.startsWith('0000');
}

/** Both ends of a period, inclusive, so one that ends the day it starts is a day long. */
function isPeriod(start: string, end: string): boolean {
  return isStorableDate(start) && isStorableDate(end) && start <= end;
}

type Lookup = { found: true; id: string | null } | { found: false; ambiguous: boolean };

/** A name that is empty or marks the total stands for no dimension value. */
function lookUp(key: string, index: NameIndex, total?: string): Lookup {
  if (key === '' || key === total) return { found: true, id: null };
  const id = index.get(key);
  if (id === undefined) return { found: false, ambiguous: false };
  return id === AMBIGUOUS ? { found: false, ambiguous: true } : { found: true, id };
}

/** The finding for a name that did not match, which may be one that matched two. */
function unmatched(lookup: Lookup, code: DataTableFinding['code'], item: string) {
  if (lookup.found) return [];
  return [{ code: lookup.ambiguous ? ('ambiguous_names' as const) : code, item }];
}

/**
 * Reads one row of a data table: either the row as it is loaded, or everything wrong with it.
 * A column the header lacks is not checked, as the header's own findings report it. Every cell
 * is trimmed, and names are tidied to match.
 */
export function readRow(
  cells: readonly string[],
  { positions, columnCount }: Header,
  references: DataTableReferences,
  line: number,
): RowReading {
  const row = String(line);

  if (cells.length !== columnCount) {
    return { ok: false, findings: [{ code: 'wrong_cell_count', item: row }] };
  }

  const has = (column: DataTableColumn) => positions[column] !== undefined;
  const cell = (column: DataTableColumn): string => {
    const position = positions[column];
    return position === undefined ? '' : (cells[position] ?? '').trim();
  };
  const findings: DataTableFinding[] = [];

  const areaCode = cell('area_code');
  const fromDate = cell('period_start');
  const toDate = cell('period_end');
  const areaId = references.areaIds.get(areaCode);
  const period = isPeriod(fromDate, toDate);

  if (REQUIRED_CELLS.some((column) => has(column) && cell(column) === '')) {
    findings.push({ code: 'missing_cells', item: row });
  } else {
    if (has('area_code') && areaId === undefined) {
      findings.push({ code: 'unmatched_area_codes', item: areaCode });
    }
    if (has('period_start') && has('period_end') && !period) {
      findings.push({ code: 'invalid_periods', item: row });
    }
  }

  const numbers = Object.fromEntries(
    NUMBER_COLUMNS.map((column) => [column, cell(column) === '' ? null : cell(column)]),
  ) as Record<NumberColumn, string | null>;

  if (Object.values(numbers).some((number) => number !== null && !isStorableNumber(number))) {
    findings.push({ code: 'invalid_numbers', item: row });
  }

  const sexName = tidyName(cell('sex'));
  const sex = lookUp(nameKey(sexName), references.sexIds, ALL_SEXES);
  findings.push(...unmatched(sex, 'unmatched_sexes', sexName));

  const ageName = tidyName(cell('age'));
  const age = lookUp(nameKey(ageName), references.ageIds, ALL_AGES);
  findings.push(...unmatched(age, 'unmatched_ages', ageName));

  const categoryType = tidyName(cell('category_type'));
  const categoryName = tidyName(cell('category'));
  const category =
    categoryType === '' && categoryName === ''
      ? ({ found: true, id: null } as const)
      : categoryType !== '' && categoryName !== ''
        ? lookUp(categoryKey(categoryType, categoryName), references.categoryIds)
        : undefined;
  // A header with one of the pair is reported once, not on every row.
  if (has('category_type') === has('category')) {
    if (category === undefined) {
      findings.push({ code: 'unpaired_category', item: row });
    } else {
      findings.push(
        ...unmatched(category, 'unmatched_categories', `${categoryType}: ${categoryName}`),
      );
    }
  }

  const noteName = tidyName(cell('value_note'));
  const note = lookUp(nameKey(noteName), references.noteTypeIds);
  findings.push(...unmatched(note, 'unmatched_value_notes', noteName));

  if (
    findings.length > 0 ||
    areaId === undefined ||
    !period ||
    !sex.found ||
    !age.found ||
    category === undefined ||
    !category.found ||
    !note.found
  ) {
    return { ok: false, findings };
  }

  return {
    ok: true,
    row: {
      line,
      areaId,
      fromDate,
      toDate,
      ...numbers,
      sexId: sex.id,
      ageId: age.id,
      categoryId: category.id,
      noteTypeId: note.id,
    },
  };
}
