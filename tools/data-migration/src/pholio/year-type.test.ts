import { readFileSync } from 'node:fs';
import { PERIOD_TYPES, YEAR_TYPES as UTILS_YEAR_TYPES } from '@fphd/utils/period-type';
import { describe, expect, it } from 'vitest';

import { YEAR_TYPES, yearTypeValues } from './year-type.ts';

const migrationDir = new URL('../../../../packages/db-operations/drizzle/', import.meta.url);

function extractBetween(sql: string, startAnchor: string, endAnchor: string): string {
  const start = sql.indexOf(startAnchor);
  if (start === -1) throw new Error(`Start anchor not found: ${JSON.stringify(startAnchor)}`);
  const after = sql.slice(start + startAnchor.length);
  const end = after.indexOf(endAnchor);
  if (end === -1) throw new Error(`End anchor not found: ${JSON.stringify(endAnchor)}`);
  return after.slice(0, end);
}

interface Sql0034Row {
  name: string;
  period_type_id: string;
  year_type_id: string;
  year_end_day: number | null;
  year_end_month: number | null;
}

function parseSql0034YearTypeRows(sql: string): Sql0034Row[] {
  const block = extractBetween(
    sql,
    "-- The Fingertips year types become the service's five, with the period type and any year end",
    ') AS m(name, period_type_id, year_type_id, day, month)',
  );
  const re =
    /\(\s*'((?:[^']|'')*)'\s*,\s*'([^']+)'(?:::\w+)?\s*,\s*'([^']+)'(?:::\w+)?\s*,\s*(NULL|[0-9]+)(?:::\w+)?\s*,\s*(NULL|[0-9]+)(?:::\w+)?\s*\)/g;
  return Array.from(block.matchAll(re), (m) => ({
    name: m[1]?.replace(/''/g, "'") ?? '',
    period_type_id: m[2] ?? '',
    year_type_id: m[3] ?? '',
    year_end_day: m[4] === 'NULL' ? null : parseInt(m[4] ?? '0', 10),
    year_end_month: m[5] === 'NULL' ? null : parseInt(m[5] ?? '0', 10),
  }));
}

function parseSql0036PeriodTypeCase(sql: string): Map<string, string> {
  const block = extractBetween(sql, '"period_type" = CASE "period_type_id"', 'END,');
  return new Map(
    Array.from(block.matchAll(/WHEN\s+'([^']+)'\s+THEN\s+'([^']+)'/g), (m) => [
      m[1] ?? '',
      m[2] ?? '',
    ]),
  );
}

function parseSql0036YearTypeCase(sql: string): Map<string, string> {
  const block = extractBetween(sql, '"year_type" = CASE "year_type_id"', 'END;');
  return new Map(
    Array.from(block.matchAll(/WHEN\s+'([^']+)'\s+THEN\s+'([^']+)'/g), (m) => [
      m[1] ?? '',
      m[2] ?? '',
    ]),
  );
}

describe('yearTypeValues', () => {
  it('has 17 entries, each with a recognised period_type and year_type', () => {
    expect(Object.keys(YEAR_TYPES)).toHaveLength(17);
    for (const name of Object.keys(YEAR_TYPES)) {
      const values = yearTypeValues(name);
      expect(PERIOD_TYPES as readonly string[]).toContain(values.period_type);
      expect(UTILS_YEAR_TYPES as readonly string[]).toContain(values.year_type);
    }
  });

  it('maps Calendar to years/calendar with no year end', () => {
    expect(yearTypeValues('Calendar')).toEqual({
      period_type: 'years',
      year_type: 'calendar',
      year_end_day: null,
      year_end_month: null,
    });
  });

  it('maps Financial to years/financial with no year end', () => {
    expect(yearTypeValues('Financial')).toEqual({
      period_type: 'years',
      year_type: 'financial',
      year_end_day: null,
      year_end_month: null,
    });
  });

  it('maps Academic to years/academic with no year end', () => {
    expect(yearTypeValues('Academic')).toEqual({
      period_type: 'years',
      year_type: 'academic',
      year_end_day: null,
      year_end_month: null,
    });
  });

  it('maps August-July to years/specified-end-date ending 31 July', () => {
    expect(yearTypeValues('August-July')).toEqual({
      period_type: 'years',
      year_type: 'specified-end-date',
      year_end_day: 31,
      year_end_month: 7,
    });
  });

  it('sets year_end_day and year_end_month only when year_type is specified-end-date', () => {
    for (const [name, entry] of Object.entries(YEAR_TYPES)) {
      const hasEnd = entry.year_end_day !== null || entry.year_end_month !== null;
      expect(hasEnd, name).toBe(entry.year_type === 'specified-end-date');
    }
  });

  it('maps Financial multi year cumulative quarters to quarters/financial', () => {
    const values = yearTypeValues('Financial multi year cumulative quarters');
    expect(values.period_type).toBe('quarters');
    expect(values.year_type).toBe('financial');
  });

  it('throws for an unrecognised year type name', () => {
    expect(() => yearTypeValues('Fortnightly')).toThrow('Fortnightly');
  });
});

describe('YEAR_TYPES values consistency', () => {
  it('uses only values the @fphd/utils/period-type module recognises', () => {
    for (const entry of Object.values(YEAR_TYPES)) {
      expect(PERIOD_TYPES as readonly string[]).toContain(entry.period_type);
      expect(UTILS_YEAR_TYPES as readonly string[]).toContain(entry.year_type);
    }
  });
});

describe('migration drift — 0034_period-type.sql + 0036_period-and-year-type-values.sql', () => {
  const sql0034 = readFileSync(new URL('0034_period-type.sql', migrationDir), 'utf8');
  const sql0036 = readFileSync(
    new URL('0036_period-and-year-type-values.sql', migrationDir),
    'utf8',
  );

  it('YEAR_TYPES has exactly the same Pholio names as the SQL translation table', () => {
    const sqlRows = parseSql0034YearTypeRows(sql0034);
    expect(sqlRows.length).toBeGreaterThan(0);
    const sqlNames = new Set(sqlRows.map((r) => r.name));
    const tsNames = new Set(Object.keys(YEAR_TYPES));
    expect(tsNames).toEqual(sqlNames);
  });

  it('YEAR_TYPES year_end_day and year_end_month match the SQL for every Pholio name', () => {
    const sqlRows = parseSql0034YearTypeRows(sql0034);
    for (const row of sqlRows) {
      const tsEntry = YEAR_TYPES[row.name];
      expect(tsEntry, `YEAR_TYPES missing ${JSON.stringify(row.name)}`).toBeDefined();
      expect(tsEntry?.year_end_day, `year_end_day mismatch for ${JSON.stringify(row.name)}`).toBe(
        row.year_end_day,
      );
      expect(
        tsEntry?.year_end_month,
        `year_end_month mismatch for ${JSON.stringify(row.name)}`,
      ).toBe(row.year_end_month);
    }
  });

  it('period_type values in YEAR_TYPES match what 0036 maps from the SQL period_type_id', () => {
    const sqlRows = parseSql0034YearTypeRows(sql0034);
    const periodTypeById = parseSql0036PeriodTypeCase(sql0036);
    for (const row of sqlRows) {
      const sqlPeriodType = periodTypeById.get(row.period_type_id);
      expect(
        sqlPeriodType,
        `No period_type string for id ${row.period_type_id} (Pholio: ${row.name})`,
      ).toBeDefined();
      const tsEntry = YEAR_TYPES[row.name];
      expect(tsEntry?.period_type, `period_type mismatch for ${JSON.stringify(row.name)}`).toBe(
        sqlPeriodType,
      );
    }
  });

  it('year_type values in YEAR_TYPES match what 0036 maps from the SQL year_type_id', () => {
    const sqlRows = parseSql0034YearTypeRows(sql0034);
    const yearTypeById = parseSql0036YearTypeCase(sql0036);
    for (const row of sqlRows) {
      const sqlYearType = yearTypeById.get(row.year_type_id);
      expect(
        sqlYearType,
        `No year_type string for id ${row.year_type_id} (Pholio: ${row.name})`,
      ).toBeDefined();
      const tsEntry = YEAR_TYPES[row.name];
      expect(tsEntry?.year_type, `year_type mismatch for ${JSON.stringify(row.name)}`).toBe(
        sqlYearType,
      );
    }
  });
});
