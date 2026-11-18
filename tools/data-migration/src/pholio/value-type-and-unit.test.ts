import { readFileSync } from 'node:fs';
import { UNIT_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';

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
const coreValueTypeIdsByName = Object.fromEntries(coreValueTypes.map((v) => [v.name, v.id]));

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

  it('maps each pholio value type to the correct service value', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      valueTypes: { name: string; service: string }[];
    };
    for (const row of fixture.valueTypes) {
      expect(valueTypeId(row.name), row.name).toBe(coreValueTypeIdsByName[row.service]);
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
