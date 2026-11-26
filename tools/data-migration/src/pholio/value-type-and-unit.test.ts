import { readFileSync } from 'node:fs';

import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';

import {
  countsAndValuesColumns,
  inexpressibleUnits,
  UNIT_NAMES_BY_LABEL,
  UNIT_PLACEHOLDERS,
  UNIT_READINGS,
  unitNameForLabel,
  unitReading,
  unknownValueTypes,
  VALUE_TYPES,
  valueTypeId,
} from './value-type-and-unit.ts';

const coreValueTypes = JSON.parse(
  readFileSync(
    new URL('../../../../packages/db-operations/data/value-types.json', import.meta.url),
    'utf8',
  ),
) as { id: string; name: string }[];

// Every value type and unit in Pholio.
const PHOLIO = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/db-operations/src/pholio-value-types-and-units.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { valueTypes: { name: string }[]; units: { name: string }[] };

// The Pholio units the export cannot read, which stop it beside any value type.
const UNREADABLE_UNITS = [
  '1,000',
  '£ per 100,000',
  '£ per capita',
  '£1,000,000 per 100,000',
  'average daily quantity per STAR-PU',
  'mean dmft per child',
  'tonnes CO2e per 1000 population',
];

const UNANSWERED = {
  has_count: null,
  count_measure: null,
  count_measure_detail: null,
  count_is_estimate: null,
  rate_per: null,
  rate_object: null,
  rate_object_detail: null,
  value_same_as_count: null,
  value_measure: null,
  value_measure_detail: null,
  gap_object: null,
  gap_object_detail: null,
  ratio_format: null,
};

describe('valueTypeId', () => {
  it('maps each service value type name to its own id', () => {
    for (const row of coreValueTypes) {
      expect(valueTypeId(row.name)).toBe(row.id);
    }
  });

  it('maps an indirectly standardised rate to its own value type', () => {
    expect(valueTypeId('Indirectly standardised rate')).toBe(
      VALUE_TYPE_IDS.indirectlyStandardisedRate,
    );
  });

  it('maps Unknown value type 21 to the Gap id', () => {
    expect(valueTypeId('Unknown value type 21')).toBe(VALUE_TYPE_IDS.gap);
  });

  it('throws for the value types the service does not have, and an unrecognised name', () => {
    for (const name of [
      'Percentage point',
      'Excess risk',
      'Unknown value type 22',
      'Weighted mean',
    ]) {
      expect(() => valueTypeId(name)).toThrow(name);
    }
  });

  it('maps every Pholio value type but Percentage point and Excess risk', () => {
    expect(unknownValueTypes(PHOLIO.valueTypes.map(({ name }) => name))).toEqual([
      'Excess risk',
      'Percentage point',
    ]);
  });

  it('includes every key in VALUE_TYPES as a recognised name', () => {
    for (const name of Object.keys(VALUE_TYPES)) {
      expect(() => valueTypeId(name)).not.toThrow();
    }
  });
});

describe('unitReading', () => {
  it('reads every Pholio unit but those listed as unreadable', () => {
    const unread = PHOLIO.units
      .map(({ name }) => name)
      .filter((name) => unitReading(name) === undefined);

    expect(unread.sort()).toEqual([...UNREADABLE_UNITS].sort());
  });

  it('reads each placeholder as the unit the Fingertips API names', () => {
    expect(Object.keys(UNIT_PLACEHOLDERS)).toHaveLength(18);
    expect(unitReading('Unknown unit 56')).toEqual({
      kind: 'measure',
      measure: 'pounds',
      detail: null,
    });
    expect(unitReading('Unknown unit 71')).toEqual({
      kind: 'rate',
      per: 1000,
      object: 'other',
      detail: 'per day',
    });
  });

  it('reads nothing for an unknown placeholder or a blank name', () => {
    expect(unitReading('Unknown unit 99')).toBeUndefined();
    expect(unitReading(' ')).toBeUndefined();
  });

  it('names an Other measure or rate object in words of its own', () => {
    for (const reading of Object.values(UNIT_READINGS)) {
      if (reading.kind === 'measure') {
        expect(reading.detail === null).toBe(reading.measure !== 'other');
      }
      if (reading.kind === 'rate') {
        expect(reading.detail === null).toBe(reading.object !== 'other');
      }
    }
  });
});

describe('countsAndValuesColumns', () => {
  it.each([
    ['a rate per 100,000', 'Directly standardised rate', 'per 100,000', { rate_per: 100000 }],
    [
      'a rate per a listed object',
      'Crude rate',
      'per 1,000 bed-days',
      { rate_per: 1000, rate_object: 'bed-days' },
    ],
    [
      'a rate per an object of its own',
      'Indirectly standardised rate',
      'per 1,000 live births',
      { rate_per: 1000, rate_object: 'other', rate_object_detail: 'live births' },
    ],
    ['a proportion as a percentage', 'Proportion', 'Percent', {}],
    ['a count of pounds', 'Count', '£', { count_measure: 'pounds' }],
    ['a count with no unit', 'Number', 'No unit', {}],
    [
      'a mean of a measure of its own',
      'Mean',
      'Kg/m2',
      { value_measure: 'other', value_measure_detail: 'kg/m2' },
    ],
    [
      'a gap in percentage points',
      'Unknown value type 21',
      'Unknown unit 68',
      { value_measure: 'percentage-points' },
    ],
    ['a ratio as a percentage', 'Ratio', 'Percent', { ratio_format: 'percentage' }],
    ['a ratio as a number', 'Rate ratio', 'No unit', { ratio_format: 'number' }],
    ['a life expectancy in years', 'Life expectancy', 'Years', {}],
  ])('reads %s', (_, valueType, unit, answers) => {
    expect(countsAndValuesColumns(valueType, unit, 108)).toEqual({ ...UNANSWERED, ...answers });
  });

  it("records a survey's estimated count as an estimate", () => {
    expect(countsAndValuesColumns('Proportion', 'Percent', 92443)).toEqual({
      ...UNANSWERED,
      count_is_estimate: true,
    });
  });

  it.each([
    ['a rate beside a count', 'Count', 'per 100,000'],
    ['a measure beside a rate', 'Crude rate', 'admissions'],
    ['a percentage beside a mean', 'Mean', 'Percent'],
    ['a rate beside an indirectly standardised ratio', 'Indirectly standardised ratio', 'per 100'],
    ['an unreadable unit', 'Mean', '£ per capita'],
  ])('reads nothing from %s, which the answers cannot hold', (_, valueType, unit) => {
    expect(countsAndValuesColumns(valueType, unit, 108)).toBeUndefined();
  });
});

describe('inexpressibleUnits', () => {
  it('names each pair the answers cannot hold once, sorted, leaving out unknown value types', () => {
    expect(
      inexpressibleUnits([
        { valueType: 'Mean', unit: 'Percent' },
        { valueType: 'Count', unit: 'per 100,000' },
        { valueType: 'Mean', unit: 'Percent' },
        { valueType: 'Proportion', unit: 'Percent' },
        { valueType: 'Excess risk', unit: 'Percent' },
      ]),
    ).toEqual(['Count: per 100,000', 'Mean: Percent']);
  });
});

describe('unitNameForLabel', () => {
  it('maps the Fingertips API labels to Pholio names', () => {
    expect(unitNameForLabel('%')).toBe('Percent');
    expect(unitNameForLabel('min')).toBe('Minutes');
    expect(unitNameForLabel('per 100,000')).toBe('per 100,000');
  });

  it('throws for £ (ambiguous with £ per 100,000) and unrecognised labels', () => {
    expect(() => unitNameForLabel('£')).toThrow('£');
    expect(() => unitNameForLabel('kg/m2')).toThrow('kg/m2');
  });

  it('maps only names the export can read', () => {
    for (const name of Object.values(UNIT_NAMES_BY_LABEL)) {
      expect(unitReading(name)).toBeDefined();
    }
  });
});
