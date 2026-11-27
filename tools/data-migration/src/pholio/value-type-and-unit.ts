import { readFileSync } from 'node:fs';

import type {
  GapObject,
  Measure,
  RateObject,
  RatePer,
  RatioFormat,
} from '@fphd/utils/counts-and-values';
import { ESTIMATED_COUNT_INDICATOR_IDS, VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';

const coreDataDir = new URL('../../../../packages/db-operations/data/', import.meta.url);

function idsFromJson(file: string): Record<string, string> {
  const rows = JSON.parse(readFileSync(new URL(file, coreDataDir), 'utf8')) as {
    id: string;
    name: string;
  }[];
  return Object.fromEntries(rows.map((row) => [row.name, row.id]));
}

const valueTypeIdsByName: Record<string, string> = idsFromJson('value-types.json');

/**
 * Each Fingertips value type, by the service value type it becomes. A percentage point is the gap
 * between two percentages. Excess risk has no value type in the service, so an indicator of it
 * stops the export.
 */
export const VALUE_TYPES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.keys(valueTypeIdsByName).map((name) => [name, name])),
  'Slope Index of Inequality': 'Slope index of inequality',
  'Relative Index of Inequality': 'Relative index of inequality',
  Number: 'Count',
  'Months life lost': 'Count',
  'Rate ratio': 'Ratio',
  'Unknown value type 21': 'Gap',
  'Percentage point': 'Gap',
};

/** The Fingertips names of the units Pholio has only a placeholder for. */
export const UNIT_PLACEHOLDERS: Readonly<Record<string, string>> = {
  'Unknown unit 54': 'admissions',
  'Unknown unit 56': '£',
  'Unknown unit 57': 'per 1,000,000',
  'Unknown unit 58': 'Minutes',
  'Unknown unit 59': 'per 100,000 bed-days',
  'Unknown unit 60': 'per 100',
  'Unknown unit 61': 'litres per adult',
  'Unknown unit 63': 'µg/m-3 (micrograms per cubic meter)',
  'Unknown unit 65': 'per 100 procedures',
  'Unknown unit 66': 'Score',
  'Unknown unit 67': 'Count',
  'Unknown unit 68': 'Percentage points',
  'Unknown unit 71': 'per 1,000, per day ',
  'Unknown unit 72': 'per 100,000 smoking population aged 18+',
  'Unknown unit 73': 'per re-offender',
  'Unknown unit 74': 'per 1,000,000,000 vehicle miles',
  'Unknown unit 75': 'Persons per km2',
  'Unknown unit 76': 'Centimetre',
};

/**
 * What a Fingertips unit says about an indicator's values: nothing more, that they are
 * percentages, what they measure, or what number and object a rate is per. A measure or rate
 * object outside the service's lists is "Other", named as Fingertips names it.
 */
export type UnitReading =
  | { kind: 'none' }
  | { kind: 'percent' }
  | { kind: 'measure'; measure: Measure; detail: string | null }
  | { kind: 'rate'; per: RatePer; object: RateObject | null; detail: string | null };

const NONE: UnitReading = { kind: 'none' };

function measure(measure: Measure): UnitReading {
  return { kind: 'measure', measure, detail: null };
}

function otherMeasure(detail: string): UnitReading {
  return { kind: 'measure', measure: 'other', detail };
}

function rate(per: RatePer, object: RateObject | null = null): UnitReading {
  return { kind: 'rate', per, object, detail: null };
}

function rateOfOther(per: RatePer, detail: string): UnitReading {
  return { kind: 'rate', per, object: 'other', detail };
}

/** Every Fingertips unit the export can read, by its Pholio name. */
export const UNIT_READINGS: Readonly<Record<string, UnitReading>> = {
  'No unit': NONE,
  Count: NONE,
  Score: otherMeasure('score'),
  Percent: { kind: 'percent' },
  'per 100': rate(100),
  'per 1,000': rate(1000),
  'per 10,000': rate(10000),
  'per 100,000': rate(100000),
  'per 1,000,000': rate(1000000),
  'per 1,000 bed-days': rate(1000, 'bed-days'),
  'per 10,000 bed-days': rate(10000, 'bed-days'),
  'per 100,000 bed-days': rate(100000, 'bed-days'),
  'per 100,000 smoking population aged 16+': rate(100000, 'smokers-aged-16-plus'),
  'per 100,000 smoking population aged 18+': rate(100000, 'smokers-aged-18-plus'),
  'per STAR-PU': rate(1, 'star-pu'),
  'per re-offender': rate(1, 're-offender'),
  'per 1,000,000,000 vehicle miles': rate(1000000000, 'vehicle-miles'),
  'per 100 women aged 15-17': rateOfOther(100, 'women aged 15-17'),
  'per 1,000 births': rateOfOther(1000, 'births'),
  'per 1,000 live births': rateOfOther(1000, 'live births'),
  'per 100,000 aged 16+': rateOfOther(100000, 'aged 16+'),
  'per 100,000 aged 35+': rateOfOther(100000, 'aged 35+'),
  'per 100,000 aged 65+': rateOfOther(100000, 'aged 65+'),
  'per 10,000 aged 65+': rateOfOther(10000, 'aged 65+'),
  'per 1,000 aged 65+': rateOfOther(1000, 'aged 65+'),
  'per 100 procedures': rateOfOther(100, 'procedures'),
  'per offender': rateOfOther(1, 'offender'),
  'per 1,000, per day': rateOfOther(1000, 'per day'),
  '£ per capita': rate(1, 'capita'),
  'Persons per km2': rateOfOther(1, 'km2'),
  '£': measure('pounds'),
  Minutes: measure('minutes'),
  Days: measure('days'),
  Years: measure('years'),
  admissions: measure('admissions'),
  Cases: measure('cases'),
  population: otherMeasure('population'),
  'Percentage points': measure('percentage-points'),
  discharges: otherMeasure('discharges'),
  'Kg/m2': otherMeasure('kg/m2'),
  'litres per adult': otherMeasure('litres per adult'),
  'µg/m-3 (micrograms per cubic meter)': otherMeasure('µg/m3'),
  Centimetre: otherMeasure('cm'),
  'Average daily quantity': otherMeasure('average daily quantity'),
  'Number of items prescribed': otherMeasure('items prescribed'),
};

/**
 * The Pholio name of each unit the public Fingertips API labels, for the prototype seed. The API
 * labels "No unit" blank. "£" is Pholio's £, the only £ unit an approved indicator has, though
 * Pholio's "£ per 100,000" has that label too.
 */
export const UNIT_NAMES_BY_LABEL: Readonly<Record<string, string>> = {
  '%': 'Percent',
  'per 100': 'per 100',
  'per 1,000': 'per 1,000',
  'per 10,000': 'per 10,000',
  'per 100,000': 'per 100,000',
  'per 1,000,000': 'per 1,000,000',
  'per STAR-PU': 'per STAR-PU',
  'per re-offender': 'per re-offender',
  'per billion vehicle miles': 'per 1,000,000,000 vehicle miles',
  'persons/km2': 'Persons per km2',
  '£': '£',
  '£ per capita': '£ per capita',
  min: 'Minutes',
  Days: 'Days',
  Years: 'Years',
  cm: 'Centimetre',
  'µg/m3': 'µg/m-3 (micrograms per cubic meter)',
  'Percentage points': 'Percentage points',
  admissions: 'admissions',
  population: 'population',
  Count: 'Count',
  Score: 'Score',
  'No unit': 'No unit',
  '': 'No unit',
};

export function unitNameForLabel(label: string): string {
  const name = UNIT_NAMES_BY_LABEL[label];
  if (name === undefined)
    throw new Error(`No Fingertips unit name known for the unit label ${JSON.stringify(label)}`);
  return name;
}

export function valueTypeId(name: string): string {
  const serviceName = VALUE_TYPES[name];
  const id = serviceName === undefined ? undefined : valueTypeIdsByName[serviceName];
  if (id === undefined)
    throw new Error(`No value type for the Fingertips value type ${JSON.stringify(name)}`);
  return id;
}

/** What a Fingertips unit says, by its Pholio name or placeholder, or undefined for none known. */
export function unitReading(name: string): UnitReading | undefined {
  return UNIT_READINGS[(UNIT_PLACEHOLDERS[name] ?? name).trim()];
}

/** The answers about an indicator's counts and values, as the version's columns hold them. */
export interface CountsAndValuesColumns {
  has_count: boolean | null;
  count_measure: Measure | null;
  count_measure_detail: string | null;
  count_is_estimate: boolean | null;
  rate_per: RatePer | null;
  rate_object: RateObject | null;
  rate_object_detail: string | null;
  value_same_as_count: boolean | null;
  value_measure: Measure | null;
  value_measure_detail: string | null;
  gap_object: GapObject | null;
  gap_object_detail: string | null;
  ratio_format: RatioFormat | null;
}

const UNANSWERED: CountsAndValuesColumns = {
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

const RATE_TYPES: readonly string[] = [
  VALUE_TYPE_IDS.crudeRate,
  VALUE_TYPE_IDS.directlyStandardisedRate,
  VALUE_TYPE_IDS.indirectlyStandardisedRate,
];
const VALUE_MEASURE_TYPES: readonly string[] = [
  VALUE_TYPE_IDS.mean,
  VALUE_TYPE_IDS.median,
  VALUE_TYPE_IDS.gap,
  VALUE_TYPE_IDS.slopeIndexOfInequality,
  VALUE_TYPE_IDS.relativeIndexOfInequality,
];

/**
 * The answers a value type and unit give: those the value type asks that the unit answers, and
 * nothing for a unit its questions cannot hold. Fingertips says nothing of whether there is a
 * count, or what it measures beside a rate or a proportion, so those stay unanswered.
 */
function answersOf(valueTypeId: string, reading: UnitReading): Partial<CountsAndValuesColumns> {
  switch (reading.kind) {
    case 'none':
      return {};
    case 'percent':
      if (valueTypeId === VALUE_TYPE_IDS.ratio) return { ratio_format: 'percentage' };
      // A rate in percent is a rate per 100.
      return RATE_TYPES.includes(valueTypeId) ? { rate_per: 100 } : {};
    case 'rate':
      return RATE_TYPES.includes(valueTypeId)
        ? { rate_per: reading.per, rate_object: reading.object, rate_object_detail: reading.detail }
        : {};
    case 'measure':
      if (valueTypeId === VALUE_TYPE_IDS.count) {
        return { count_measure: reading.measure, count_measure_detail: reading.detail };
      }
      return VALUE_MEASURE_TYPES.includes(valueTypeId)
        ? { value_measure: reading.measure, value_measure_detail: reading.detail }
        : {};
  }
}

/**
 * The answers about a Fingertips indicator's counts and values, from its value type, its unit and
 * its id, or undefined for a unit the export cannot read. A percentage point measures percentage
 * points whatever its unit. A count's measure says whether it is an estimate, as the form does.
 */
export function countsAndValuesColumns(
  valueTypeName: string,
  unitName: string,
  fingertipsId: number,
): CountsAndValuesColumns | undefined {
  const reading = unitReading(unitName);
  if (reading === undefined) return undefined;
  const answers: Partial<CountsAndValuesColumns> =
    valueTypeName === 'Percentage point'
      ? { value_measure: 'percentage-points' }
      : answersOf(valueTypeId(valueTypeName), reading);
  const countMeasured = answers.count_measure !== undefined && answers.count_measure !== null;
  return {
    ...UNANSWERED,
    ...answers,
    count_is_estimate: countMeasured ? ESTIMATED_COUNT_INDICATOR_IDS.includes(fingertipsId) : null,
  };
}

/** The unit names among these the export cannot read, sorted. */
export function unreadableUnits(names: Iterable<string>): string[] {
  return [...new Set(names)].filter((name) => unitReading(name) === undefined).sort();
}

export function unknownValueTypes(names: Iterable<string>): string[] {
  const result: string[] = [];
  for (const name of names) {
    try {
      valueTypeId(name);
    } catch {
      result.push(name);
    }
  }
  return result.sort();
}
