import { type Database, schema } from '@fphd/db';
import { type Period, periodLabel } from '@fphd/utils/period-label';
import type { PublicYearType } from '@fphd/utils/period-type';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  not,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';

import type { DataTableColumn } from './data-table-columns.ts';
import {
  type CheckColumnKey,
  checkColumnKeys,
  type DataTableColumnValues,
  type DataTableFilter,
  type DataTableValuesQuery,
  MAX_LISTED_DATA_TABLE_VALUES,
} from './data-table-filter-contract.ts';
import { AGE, nameKey, SEX } from './data-table-names.ts';
import { ALL_AGES_NAME, ALL_SEXES_NAME } from './data-table-rows.ts';

const { area, dimensionType, dimensionValue, noteType, observation, observationNote } = schema;

/** The details of a batch that its values are read and labelled from. */
export interface FilterableDataTable {
  batchId: string;
  columns: DataTableColumn[];
  yearType: PublicYearType | null;
}

/** The values wanted of a column: those with these hashes, or whose label contains a search. */
type Wanted = { hashes: readonly string[] } | { search: string };

interface ColumnValue {
  hash: string;
  label: string;
}

/** A value found in the batch, with what its rows are matched on, such as the ids of its areas. */
interface MatchedValue<Match> extends ColumnValue {
  matches: Match[];
}

interface ColumnReader {
  /** In the order they are listed. A search may stop once it has one more than are listed. */
  list: (search: string) => Promise<ColumnValue[]>;
  /** The values the batch has of those named, and the condition for a row with any of them. */
  resolve: (
    hashes: readonly string[],
  ) => Promise<{ values: ColumnValue[]; where: SQL | undefined }>;
}

/**
 * The hash of an empty cell, listed as a value of its column. It is that of the empty text, which
 * no value has, so an empty cell has an id like any other value's.
 */
const BLANK_HASH = 'd41d8cd98f';

interface ColumnSource<Match> {
  find: (wanted: Wanted) => Promise<MatchedValue<Match>[]>;
  /** The condition for a row with any of these. */
  where: (matches: Match[]) => SQL | undefined;
  /** The condition for a row whose cell is empty, or undefined if the batch has none. */
  blank?: () => Promise<SQL | undefined>;
  /** What an empty cell is listed as, such as "Persons" for a total in the sex column. */
  blankLabel?: string | undefined;
}

function columnReader<Match>({
  find,
  where,
  blank,
  blankLabel = 'Blank',
}: ColumnSource<Match>): ColumnReader {
  const empty: ColumnValue = { hash: BLANK_HASH, label: blankLabel };

  return {
    list: async (search) => {
      const values = await find({ search });
      const isBlank = empty.label.toLowerCase().includes(search.toLowerCase())
        ? await blank?.()
        : undefined;
      return isBlank === undefined ? values : [empty, ...values];
    },
    resolve: async (hashes) => {
      const values = await find({ hashes });
      const isBlank = hashes.includes(empty.hash) ? await blank?.() : undefined;
      return {
        values: isBlank === undefined ? values : [empty, ...values],
        where: or(
          values.length === 0 ? undefined : where(values.flatMap(({ matches }) => matches)),
          isBlank,
        ),
      };
    },
  };
}

/** The hash in a filter's id. It is of the value's text, not of where the value is in an upload. */
function hashOf(text: SQLWrapper): SQL<string> {
  return sql<string>`left(md5(${text}), 10)`;
}

/** Values are found by the hash of their text, or by the label the table shows for them. */
function matchesWanted(
  text: SQLWrapper,
  wanted: Wanted,
  label: SQLWrapper = text,
): SQL | undefined {
  if ('hashes' in wanted) return inArray(hashOf(text), [...wanted.hashes]);
  return wanted.search === ''
    ? undefined
    : sql`strpos(lower(${label}), ${wanted.search.toLowerCase()}) > 0`;
}

/**
 * A number's text as JavaScript, and so the table, writes it. Postgres uses an exponent for numbers
 * JavaScript writes in full, from 0.000001 up to 1e21, and writes 1e-7 as 1e-07.
 */
function shownNumber(column: SQLWrapper, text: SQLWrapper): SQL {
  return sql`CASE
    WHEN strpos(${text}, 'e') = 0 THEN ${text}
    WHEN abs(${column}) >= 1e-6 AND abs(${column}) < 1e21 THEN ${text}::numeric::text
    ELSE regexp_replace(${text}, '(e[+-])0', '\\1')
  END`;
}

/** Whether a search could be part of a number's text, such as 83.1, -3 or 1e-7. */
function couldBeNumber(search: string): boolean {
  return /^[\d.e+-]*$/i.test(search);
}

const byName = new Intl.Collator('en', { numeric: true });

/** Groups the rows that share a label into one value each, and keeps the values wanted. */
function wantedValues<Match>(
  rows: readonly (ColumnValue & { match: Match })[],
  wanted: Wanted,
): MatchedValue<Match>[] {
  const byLabel = Map.groupBy(rows, ({ label }) => label);
  const values = [...byLabel].flatMap(([label, [first, ...rest]]) =>
    first === undefined
      ? []
      : [{ hash: first.hash, label, matches: [first, ...rest].map(({ match }) => match) }],
  );
  if ('hashes' in wanted) return values.filter(({ hash }) => wanted.hashes.includes(hash));
  const search = wanted.search.toLowerCase();
  return values.filter(({ label }) => label.toLowerCase().includes(search));
}

/** Like `wantedValues`, sorted from A to Z. */
function wantedNames<Match>(
  rows: readonly (ColumnValue & { match: Match })[],
  wanted: Wanted,
): MatchedValue<Match>[] {
  return wantedValues(rows, wanted).sort((a, b) => byName.compare(a.label, b.label));
}

type NumberColumn = Extract<
  CheckColumnKey,
  | 'count'
  | 'numerator'
  | 'denominator'
  | 'value'
  | 'lowerCi95'
  | 'upperCi95'
  | 'lowerCi998'
  | 'upperCi998'
>;

function isSex(type: string): boolean {
  return nameKey(type) === SEX;
}

function isAge(type: string): boolean {
  return nameKey(type) === AGE;
}

function isCategory(type: string): boolean {
  return !isSex(type) && !isAge(type);
}

/** Reads each column's values from a batch. The dimension values are read once for every column. */
function columnReaders(
  db: Database,
  { batchId, yearType }: FilterableDataTable,
): Record<CheckColumnKey, ColumnReader> {
  const inBatch = eq(observation.uploadBatchId, batchId);
  const ifAnyRow = async (condition: SQL) => {
    const found = await db
      .select({ one: sql`1` })
      .from(observation)
      .where(and(inBatch, condition))
      .limit(1);
    return found.length > 0 ? condition : undefined;
  };

  const numbers = (name: NumberColumn) => {
    const column = observation[name];
    const text = sql`${column}::text`;
    return columnReader<number>({
      find: async (wanted) => {
        if ('search' in wanted && !couldBeNumber(wanted.search)) return [];
        const rows = await db
          .select({ value: column, hash: hashOf(text) })
          .from(observation)
          .where(
            and(inBatch, isNotNull(column), matchesWanted(text, wanted, shownNumber(column, text))),
          )
          .groupBy(column)
          .orderBy(desc(column))
          .limit(MAX_LISTED_DATA_TABLE_VALUES + 1);
        return rows.flatMap(({ value, hash }) =>
          value === null ? [] : [{ hash, label: String(value), matches: [value] }],
        );
      },
      where: (values) => inArray(column, values),
      blank: () => ifAnyRow(isNull(column)),
    });
  };

  const periods = columnReader<Period>({
    find: async (wanted) => {
      const rows = await db
        .select({
          fromDate: observation.fromDate,
          toDate: observation.toDate,
          hash: hashOf(
            sql`to_char(${observation.fromDate}, 'YYYYMMDD') || to_char(${observation.toDate}, 'YYYYMMDD')`,
          ),
        })
        .from(observation)
        .where(inBatch)
        .groupBy(observation.fromDate, observation.toDate)
        .orderBy(desc(observation.toDate), desc(observation.fromDate));
      return wantedValues(
        rows.map(({ hash, ...period }) => ({
          hash,
          label: periodLabel(period, yearType),
          match: period,
        })),
        wanted,
      );
    },
    where: (matches) =>
      or(
        ...matches.map(({ fromDate, toDate }) =>
          and(eq(observation.fromDate, fromDate), eq(observation.toDate, toDate)),
        ),
      ),
  });

  const areas = columnReader<string>({
    find: async (wanted) => {
      const rows = await db
        .select({ id: area.id, code: area.code, hash: hashOf(area.code) })
        .from(area)
        .where(
          and(
            inArray(
              area.id,
              db.select({ id: observation.areaId }).from(observation).where(inBatch),
            ),
            matchesWanted(area.code, wanted),
          ),
        )
        .orderBy(asc(area.code))
        .limit(MAX_LISTED_DATA_TABLE_VALUES + 1);
      return rows.map(({ id, code, hash }) => ({ hash, label: code, matches: [id] }));
    },
    where: (ids) => inArray(observation.areaId, ids),
  });

  // A row's dimension key lists the ids of its dimension values, so the few distinct keys say which
  // values the batch has, and which rows have them, without reading every row's dimension values.
  const readDimensions = async () => {
    const keys = await db
      .selectDistinct({ key: observation.dimensionKey })
      .from(observation)
      .where(inBatch);
    const idsOf = ({ key }: { key: string }) => (key === '' ? [] : key.split(','));
    const values = await db
      .select({
        id: dimensionValue.id,
        value: dimensionValue.name,
        valueHash: hashOf(dimensionValue.name),
        type: dimensionType.name,
        typeHash: hashOf(dimensionType.name),
      })
      .from(dimensionValue)
      .innerJoin(dimensionType, eq(dimensionType.id, dimensionValue.dimensionTypeId))
      .where(inArray(dimensionValue.id, [...new Set(keys.flatMap(idsOf))]));
    const byId = new Map(values.map((value) => [value.id, value]));
    return keys.map((row) => ({
      key: row.key,
      values: idsOf(row).flatMap((id) => byId.get(id) ?? []),
    }));
  };
  let dimensions: ReturnType<typeof readDimensions> | undefined;
  const batchDimensions = () => {
    dimensions ??= readDimensions();
    return dimensions;
  };

  const hasDimensionKey = (keys: readonly string[]) =>
    sql`${observation.dimensionKey} = any(${sql.param([...new Set(keys)])}::text[])`;

  const dimensionColumn = (
    ofType: (type: string) => boolean,
    cellOf: (value: {
      value: string;
      valueHash: string;
      type: string;
      typeHash: string;
    }) => ColumnValue,
    blankLabel?: string,
  ) =>
    columnReader<string>({
      find: async (wanted) =>
        wantedNames(
          (await batchDimensions()).flatMap(({ key, values }) =>
            values
              .filter(({ type }) => ofType(type))
              .map((value) => ({ ...cellOf(value), match: key })),
          ),
          wanted,
        ),
      where: hasDimensionKey,
      blank: async () => {
        const keys = (await batchDimensions())
          .filter(({ values }) => !values.some(({ type }) => ofType(type)))
          .map(({ key }) => key);
        return keys.length === 0 ? undefined : hasDimensionKey(keys);
      },
      blankLabel,
    });

  const dimensionValues = (ofType: (type: string) => boolean, blankLabel?: string) =>
    dimensionColumn(
      ofType,
      ({ value, valueHash }) => ({ label: value, hash: valueHash }),
      blankLabel,
    );

  const categoryTypes = dimensionColumn(isCategory, ({ type, typeHash }) => ({
    label: type,
    hash: typeHash,
  }));

  const rowHasNote = (condition?: SQL) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(observationNote)
        .where(and(eq(observationNote.observationId, observation.id), condition)),
    );

  const valueNotes = columnReader<string>({
    find: async (wanted) => {
      const rows = await db
        .select({ id: noteType.id, text: noteType.text, hash: hashOf(noteType.text) })
        .from(noteType)
        .where(
          inArray(
            noteType.id,
            db
              .select({ id: observationNote.noteTypeId })
              .from(observationNote)
              .innerJoin(observation, eq(observation.id, observationNote.observationId))
              .where(inBatch),
          ),
        );
      return wantedNames(
        rows.map(({ id, text, hash }) => ({ hash, label: text, match: id })),
        wanted,
      );
    },
    where: (ids) => rowHasNote(inArray(observationNote.noteTypeId, ids)),
    blank: () => ifAnyRow(not(rowHasNote())),
  });

  return {
    count: numbers('count'),
    numerator: numbers('numerator'),
    denominator: numbers('denominator'),
    value: numbers('value'),
    lowerCi95: numbers('lowerCi95'),
    upperCi95: numbers('upperCi95'),
    lowerCi998: numbers('lowerCi998'),
    upperCi998: numbers('upperCi998'),
    period: periods,
    areaCode: areas,
    // A total is stored without the dimension, so the empty cell is listed as the file names it.
    sex: dimensionValues(isSex, ALL_SEXES_NAME),
    age: dimensionValues(isAge, ALL_AGES_NAME),
    categoryType: categoryTypes,
    category: dimensionValues(isCategory),
    valueNote: valueNotes,
  };
}

// Each column read holds a database connection, and the pool every request shares has ten.
const COLUMNS_AT_ONCE = 3;

/** Reads columns a few at a time, so one request leaves connections for others. */
async function inColumnGroups<Result>(
  columns: readonly CheckColumnKey[],
  read: (column: CheckColumnKey) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = [];
  for (let start = 0; start < columns.length; start += COLUMNS_AT_ONCE) {
    results.push(...(await Promise.all(columns.slice(start, start + COLUMNS_AT_ONCE).map(read))));
  }
  return results;
}

function filterId(column: CheckColumnKey, hash: string): string {
  return `${column}.${hash}`;
}

/** The filters that apply to a batch, and the conditions on the rows that match all of them. */
export interface AppliedFilters {
  filters: DataTableFilter[];
  conditions: SQL[];
}

/**
 * Finds the values of a batch that filter ids name, in the order of the ids. A row matches a column
 * if it has any of the column's values, and must match every column filtered by. An id whose value
 * isn't in the batch is left out.
 */
export async function applyDataTableFilters(
  db: Database,
  dataTable: FilterableDataTable,
  filterIds: readonly string[],
): Promise<AppliedFilters> {
  if (filterIds.length === 0) return { filters: [], conditions: [] };

  const readers = columnReaders(db, dataTable);
  const resolved = await inColumnGroups(
    checkColumnKeys(dataTable.columns).filter((column) =>
      filterIds.some((id) => id.startsWith(`${column}.`)),
    ),
    async (column) => {
      const hashes = filterIds
        .filter((id) => id.startsWith(`${column}.`))
        .map((id) => id.slice(column.length + 1));
      const { values, where } = await readers[column].resolve(hashes);
      return {
        filters: values.map(({ hash, label }) => ({ id: filterId(column, hash), label, column })),
        where,
      };
    },
  );

  const filters = new Map(
    resolved.flatMap(({ filters }) => filters.map((filter) => [filter.id, filter])),
  );
  return {
    filters: filterIds.flatMap((id) => filters.get(id) ?? []),
    conditions: resolved.flatMap(({ where }) => where ?? []),
  };
}

/**
 * Lists the values of one column of a batch, or of every column with a value that contains the
 * search. A blank is listed first, then numbers from high to low, periods from the latest and other
 * values from A to Z.
 */
export async function listDataTableValues(
  db: Database,
  dataTable: FilterableDataTable,
  { column, search }: DataTableValuesQuery,
): Promise<DataTableColumnValues[]> {
  const readers = columnReaders(db, dataTable);
  const columns = checkColumnKeys(dataTable.columns).filter(
    (key) => column === undefined || key === column,
  );
  const listed = await inColumnGroups(columns, async (key) => {
    const values = await readers[key].list(search);
    return {
      column: key,
      values: values
        .slice(0, MAX_LISTED_DATA_TABLE_VALUES)
        .map(({ hash, label }) => ({ id: filterId(key, hash), label })),
      more: values.length > MAX_LISTED_DATA_TABLE_VALUES,
    };
  });
  return listed.filter(({ values }) => search === '' || values.length > 0);
}
