import { readFileSync } from 'node:fs';

import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';

import {
  type CountsAndValuesColumns,
  countsAndValuesColumns,
  UNIT_NAMES_BY_LABEL,
  UNIT_PLACEHOLDERS,
  UNIT_READINGS,
  unitNameForLabel,
  unitReading,
  unknownValueTypes,
  unreadableUnits,
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

  it('maps Unknown value type 21 and Percentage point to Gap', () => {
    expect(valueTypeId('Unknown value type 21')).toBe(VALUE_TYPE_IDS.gap);
    expect(valueTypeId('Percentage point')).toBe(VALUE_TYPE_IDS.gap);
  });

  it('throws for Excess risk, which the service does not have, and an unrecognised name', () => {
    for (const name of ['Excess risk', 'Unknown value type 22', 'Weighted mean']) {
      expect(() => valueTypeId(name)).toThrow(name);
    }
  });

  it('maps every Pholio value type but Excess risk', () => {
    expect(unknownValueTypes(PHOLIO.valueTypes.map(({ name }) => name))).toEqual(['Excess risk']);
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

// Every value type and unit pair among the indicators approved for launch, by their Pholio names,
// from the Fingertips API's metadata in November 2026, with the answers each becomes.
const APPROVED_PAIRS: [string, string, number, Partial<CountsAndValuesColumns>][] = [
  ['Number', 'No unit', 5, {}],
  ['Number', 'Unknown unit 67', 1, {}],
  [
    'Number',
    'population',
    1,
    { count_measure: 'other', count_measure_detail: 'population', count_is_estimate: false },
  ],
  ['Number', 'Unknown unit 54', 1, { count_measure: 'admissions', count_is_estimate: false }],
  ['Crude rate', 'per 100,000', 63, { rate_per: 100000 }],
  ['Crude rate', 'per 1,000', 49, { rate_per: 1000 }],
  ['Crude rate', 'per 10,000', 19, { rate_per: 10000 }],
  ['Crude rate', 'Percent', 9, { rate_per: 100 }],
  ['Crude rate', 'Unknown unit 60', 3, { rate_per: 100 }],
  ['Crude rate', 'Unknown unit 56', 1, {}],
  ['Crude rate', 'Unknown unit 57', 1, { rate_per: 1000000 }],
  ['Crude rate', 'Unknown unit 73', 1, { rate_per: 1, rate_object: 're-offender' }],
  ['Crude rate', 'Unknown unit 74', 1, { rate_per: 1000000000, rate_object: 'vehicle-miles' }],
  [
    'Crude rate',
    'Unknown unit 75',
    1,
    { rate_per: 1, rate_object: 'other', rate_object_detail: 'km2' },
  ],
  ['Crude rate', '£ per capita', 1, { rate_per: 1, rate_object: 'capita' }],
  ['Directly standardised rate', 'per 100,000', 121, { rate_per: 100000 }],
  ['Directly standardised rate', 'per 10,000', 3, { rate_per: 10000 }],
  ['Directly standardised rate', 'per 1,000', 1, { rate_per: 1000 }],
  ['Unknown value type 21', 'Unknown unit 68', 1, { value_measure: 'percentage-points' }],
  ['Indirectly standardised proportion', 'Percent', 1, {}],
  ['Indirectly standardised ratio', 'Unknown unit 60', 1, {}],
  ['Indirectly standardised ratio', 'No unit', 1, {}],
  ['Indirectly standardised ratio', 'per STAR-PU', 1, {}],
  ['Life expectancy', 'Years', 8, {}],
  ['Mean', 'Unknown unit 76', 4, { value_measure: 'other', value_measure_detail: 'cm' }],
  ['Mean', 'Unknown unit 66', 3, { value_measure: 'other', value_measure_detail: 'score' }],
  ['Mean', 'Days', 2, { value_measure: 'days' }],
  ['Mean', 'Unknown unit 58', 1, { value_measure: 'minutes' }],
  ['Mean', 'Unknown unit 63', 1, { value_measure: 'other', value_measure_detail: 'µg/m3' }],
  ['Median', 'Unknown unit 56', 1, { value_measure: 'pounds' }],
  ['Percentage point', 'Percent', 1, { value_measure: 'percentage-points' }],
  ['Proportion', 'Percent', 456, {}],
  ['Ratio', 'No unit', 5, {}],
  ['Ratio', 'Percent', 5, { ratio_format: 'percentage' }],
  ['Ratio', 'Unknown unit 66', 2, {}],
  ['Score', 'No unit', 4, {}],
  ['Score', 'Unknown unit 66', 1, {}],
  ['Slope Index of Inequality', 'Years', 4, { value_measure: 'years' }],
];

describe('countsAndValuesColumns', () => {
  it('covers the 785 indicators approved for launch', () => {
    expect(APPROVED_PAIRS.reduce((total, [, , indicators]) => total + indicators, 0)).toBe(785);
  });

  it.each(APPROVED_PAIRS)('reads %s beside the unit %s', (valueType, unit, _, answers) => {
    expect(countsAndValuesColumns(valueType, unit, 108)).toEqual({ ...UNANSWERED, ...answers });
  });

  it("records a survey's estimated count as an estimate once its count measure is answered", () => {
    expect(countsAndValuesColumns('Proportion', 'Percent', 92443)).toEqual(UNANSWERED);
    expect(countsAndValuesColumns('Number', 'population', 92443)).toMatchObject({
      count_is_estimate: true,
    });
  });

  it('reads nothing from a unit it cannot read', () => {
    expect(countsAndValuesColumns('Mean', '£ per 100,000', 108)).toBeUndefined();
  });
});

describe('unreadableUnits', () => {
  it('names each unit it cannot read once, sorted', () => {
    expect(unreadableUnits(['mean dmft per child', 'Percent', '1,000', '1,000', ''])).toEqual([
      '',
      '1,000',
      'mean dmft per child',
    ]);
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
