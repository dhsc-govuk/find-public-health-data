import { readFileSync } from 'node:fs';
import { UNIT_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';

function extractBetween(sql: string, startAnchor: string, endAnchor: string): string {
  const start = sql.indexOf(startAnchor);
  if (start === -1) throw new Error(`Start anchor not found: ${JSON.stringify(startAnchor)}`);
  const after = sql.slice(start + startAnchor.length);
  const end = after.indexOf(endAnchor);
  if (end === -1) throw new Error(`End anchor not found: ${JSON.stringify(endAnchor)}`);
  return after.slice(0, end);
}

function sqlStringPairs(block: string): [string, string][] {
  const re = /\(\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'/g;
  return Array.from(block.matchAll(re), (m) => [
    m[1]?.replace(/''/g, "'") ?? '',
    m[2]?.replace(/''/g, "'") ?? '',
  ]);
}

import {
  UNIT_NAMES_BY_LABEL,
  UNIT_PLACEHOLDERS,
  UNITS,
  unitNameForLabel,
  unitValues,
  unknownUnits,
  unknownValueTypes,
  VALUE_TYPES,
  valueTypeId,
} from './value-type-and-unit.ts';

const coreDataDir = new URL('../../../../packages/db-operations/data/', import.meta.url);

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(new URL(file, coreDataDir), 'utf8')) as T;
}

const coreValueTypes = readJson<{ id: string; name: string }[]>('value-types.json');
const coreUnits = readJson<{ id: string; name: string }[]>('units.json');
const coreUnitIdsByName = Object.fromEntries(coreUnits.map((u) => [u.name, u.id]));

describe('valueTypeId', () => {
  it('maps each service value type name to its own id', () => {
    for (const row of coreValueTypes) {
      expect(valueTypeId(row.name)).toBe(row.id);
    }
  });

  it('maps Unknown value type 21 to the Gap id', () => {
    const gapId = coreValueTypes.find((r) => r.name === 'Gap')?.id;
    expect(valueTypeId('Unknown value type 21')).toBe(gapId);
  });

  it('throws for an unrecognised value type name', () => {
    expect(() => valueTypeId('Unknown value type 22')).toThrow('Unknown value type 22');
    expect(() => valueTypeId('Weighted mean')).toThrow('Weighted mean');
  });

  it('includes every key in VALUE_TYPES as a recognised name', () => {
    for (const name of Object.keys(VALUE_TYPES)) {
      expect(() => valueTypeId(name)).not.toThrow();
    }
  });
});

describe('unitValues', () => {
  it('maps each listed UNITS entry to a core-data unit id', () => {
    for (const [name, serviceName] of Object.entries(UNITS)) {
      expect(unitValues(name).unit_id).toBe(coreUnitIdsByName[serviceName]);
    }
  });

  it('maps specific named units to the correct ids', () => {
    expect(unitValues('Percent').unit_id).toBe(coreUnitIdsByName['%']);
    expect(unitValues('per 100,000').unit_id).toBe(coreUnitIdsByName['per 100,000']);
    expect(unitValues('Minutes').unit_id).toBe(coreUnitIdsByName.minutes);
    expect(unitValues('Days').unit_id).toBe(coreUnitIdsByName.days);
    expect(unitValues('Years').unit_id).toBe(coreUnitIdsByName.years);
    expect(unitValues('No unit').unit_id).toBe(coreUnitIdsByName['No unit']);
    expect(unitValues('Percent').unit_detail).toBeNull();
  });

  it('resolves Unknown unit 71 placeholder to Other with correct detail', () => {
    expect(unitValues('Unknown unit 71')).toEqual({
      unit_id: UNIT_IDS.other,
      unit_detail: 'per 1,000, per day',
    });
  });

  it('resolves Unknown unit 68 placeholder to Other with Percentage points detail', () => {
    expect(unitValues('Percentage points')).toEqual({
      unit_id: UNIT_IDS.other,
      unit_detail: 'Percentage points',
    });
  });

  it('throws for an unknown placeholder or a blank name', () => {
    expect(() => unitValues('Unknown unit 99')).toThrow();
    expect(() => unitValues(' ')).toThrow();
  });

  it('preserves unit detail longer than 100 characters', () => {
    const detail = 'x'.repeat(101);
    expect(unitValues(detail)).toEqual({ unit_id: UNIT_IDS.other, unit_detail: detail });
  });
});

describe('UNIT_PLACEHOLDERS', () => {
  it('has 18 entries covering Unknown unit 54 through 76', () => {
    expect(Object.keys(UNIT_PLACEHOLDERS)).toHaveLength(18);
    for (const key of Object.keys(UNIT_PLACEHOLDERS)) {
      expect(key).toMatch(/^Unknown unit \d+$/);
    }
  });
});

describe('unitNameForLabel', () => {
  it('maps % to Percent', () => {
    expect(unitNameForLabel('%')).toBe('Percent');
  });

  it('maps min to Minutes', () => {
    expect(unitNameForLabel('min')).toBe('Minutes');
  });

  it('maps per 100,000 to per 100,000', () => {
    expect(unitNameForLabel('per 100,000')).toBe('per 100,000');
  });

  it('resolves to a name whose unit_id matches the minutes unit', () => {
    const name = unitNameForLabel('min');
    expect(unitValues(name).unit_id).toBe(coreUnitIdsByName.minutes);
  });

  it('throws for £ (ambiguous with £ per 100,000)', () => {
    expect(() => unitNameForLabel('£')).toThrow('£');
  });

  it('throws for per 1,000/day', () => {
    expect(() => unitNameForLabel('per 1,000/day')).toThrow('per 1,000/day');
  });

  it('throws for unrecognised labels', () => {
    expect(() => unitNameForLabel('kg/m2')).toThrow('kg/m2');
  });
});

describe('UNIT_NAMES_BY_LABEL', () => {
  it('maps only names that are keys of UNITS', () => {
    for (const name of Object.values(UNIT_NAMES_BY_LABEL)) {
      expect(name in UNITS).toBe(true);
    }
  });
});

describe('unknownValueTypes', () => {
  it('returns only the names with no mapping, sorted', () => {
    expect(unknownValueTypes(['Weighted mean', 'Count', 'Months life lost', ''])).toEqual([
      '',
      'Weighted mean',
    ]);
  });
});

describe('unknownUnits', () => {
  it('returns only the names with no mapping, sorted', () => {
    expect(
      unknownUnits(['Unknown unit 99', 'Percent', 'Kg/m2', 'Unknown unit 54', '  ', '']),
    ).toEqual(['', '  ', 'Unknown unit 99']);
  });
});

describe('full pholio fixture coverage', () => {
  const fixturePath = new URL(
    '../../../../packages/db-operations/src/pholio-value-types-and-units.json',
    import.meta.url,
  );

  it('maps every pholio value type without throwing', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      valueTypes: { name: string; service: string }[];
      units: { name: string; service: string; other: string | null }[];
    };
    for (const row of fixture.valueTypes) {
      expect(() => valueTypeId(row.name)).not.toThrow();
    }
  });

  it('maps every pholio unit without throwing', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      valueTypes: { name: string; service: string }[];
      units: { name: string; service: string; other: string | null }[];
    };
    for (const row of fixture.units) {
      expect(() => unitValues(row.name)).not.toThrow();
    }
  });

  it('maps each pholio unit to the correct service value', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      valueTypes: { name: string; service: string }[];
      units: { name: string; service: string; other: string | null }[];
    };
    for (const row of fixture.units) {
      expect(unitValues(row.name)).toEqual({
        unit_id: coreUnitIdsByName[row.service],
        unit_detail: row.other,
      });
    }
  });
});

describe('migration drift — 0035_value-type-and-units.sql', () => {
  const migrationDir = new URL('../../../../packages/db-operations/drizzle/', import.meta.url);
  const sql = readFileSync(new URL('0035_value-type-and-units.sql', migrationDir), 'utf8');

  it('VALUE_TYPES covers every Pholio name in the SQL translation table', () => {
    const block = extractBetween(
      sql,
      '-- export/value_type_and_unit.py holds the same translation.',
      ') AS m(name, value_type_id)',
    );
    const pairs = sqlStringPairs(block);
    expect(pairs.length).toBeGreaterThan(0);
    for (const [pholioName] of pairs) {
      expect(VALUE_TYPES, `VALUE_TYPES missing key ${JSON.stringify(pholioName)}`).toHaveProperty(
        pholioName,
      );
    }
  });

  it('VALUE_TYPES maps to the same service name as the SQL does', () => {
    const serviceNameById = Object.fromEntries(coreValueTypes.map((r) => [r.id, r.name]));
    const block = extractBetween(
      sql,
      '-- export/value_type_and_unit.py holds the same translation.',
      ') AS m(name, value_type_id)',
    );
    const pairs = sqlStringPairs(block);
    for (const [pholioName, sqlId] of pairs) {
      const sqlServiceName = serviceNameById[sqlId];
      expect(sqlServiceName, `No service name for id ${sqlId}`).toBeDefined();
      const tsServiceName = VALUE_TYPES[pholioName];
      expect(tsServiceName, `VALUE_TYPES[${JSON.stringify(pholioName)}] missing`).toBeDefined();
      expect(tsServiceName).toBe(sqlServiceName);
    }
  });

  it('every VALUE_TYPES key appears in the SQL translation table', () => {
    const block = extractBetween(
      sql,
      '-- export/value_type_and_unit.py holds the same translation.',
      ') AS m(name, value_type_id)',
    );
    const sqlPholioNames = new Set(sqlStringPairs(block).map(([name]) => name));
    for (const name of Object.keys(VALUE_TYPES)) {
      if (coreValueTypes.some((r) => r.name === name)) continue;
      expect(sqlPholioNames, `VALUE_TYPES key ${JSON.stringify(name)} missing from SQL`).toContain(
        name,
      );
    }
  });

  it('UNITS covers every Pholio name in the SQL unit translation table', () => {
    const block = extractBetween(
      sql,
      'UPDATE "indicator_version" v\nSET "unit_id" = m.unit_id',
      ') AS m(name, unit_id)',
    );
    const pairs = sqlStringPairs(block);
    expect(pairs.length).toBeGreaterThan(0);
    for (const [pholioName] of pairs) {
      expect(UNITS, `UNITS missing key ${JSON.stringify(pholioName)}`).toHaveProperty(pholioName);
    }
  });

  it('UNITS maps to the same service name as the SQL does', () => {
    const unitNameById = Object.fromEntries(coreUnits.map((r) => [r.id, r.name]));
    const block = extractBetween(
      sql,
      'UPDATE "indicator_version" v\nSET "unit_id" = m.unit_id',
      ') AS m(name, unit_id)',
    );
    const pairs = sqlStringPairs(block);
    for (const [pholioName, sqlId] of pairs) {
      const sqlServiceName = unitNameById[sqlId];
      expect(sqlServiceName, `No unit name for id ${sqlId}`).toBeDefined();
      const tsServiceName = UNITS[pholioName];
      expect(tsServiceName, `UNITS[${JSON.stringify(pholioName)}] missing`).toBeDefined();
      expect(tsServiceName).toBe(sqlServiceName);
    }
  });

  it('UNIT_PLACEHOLDERS covers every Unknown unit in the SQL placeholder rename', () => {
    const block = extractBetween(
      sql,
      "-- Pholio's placeholders for units the Fingertips API names take the name of Pholio's unit with",
      ') AS m(placeholder, name)',
    );
    const pairs = sqlStringPairs(block);
    expect(pairs.length).toBeGreaterThan(0);
    for (const [placeholder, resolvedName] of pairs) {
      expect(
        UNIT_PLACEHOLDERS,
        `UNIT_PLACEHOLDERS missing key ${JSON.stringify(placeholder)}`,
      ).toHaveProperty(placeholder);
      expect(UNIT_PLACEHOLDERS[placeholder]).toBe(resolvedName);
    }
  });

  it('every UNIT_PLACEHOLDERS key appears in the SQL placeholder rename', () => {
    const block = extractBetween(
      sql,
      "-- Pholio's placeholders for units the Fingertips API names take the name of Pholio's unit with",
      ') AS m(placeholder, name)',
    );
    const sqlPlaceholders = new Map(sqlStringPairs(block));
    for (const [placeholder, resolvedName] of Object.entries(UNIT_PLACEHOLDERS)) {
      expect(
        sqlPlaceholders.has(placeholder),
        `UNIT_PLACEHOLDERS key ${JSON.stringify(placeholder)} missing from SQL`,
      ).toBe(true);
      expect(sqlPlaceholders.get(placeholder)).toBe(resolvedName);
    }
  });
});
